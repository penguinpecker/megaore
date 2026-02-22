import { ethers } from "ethers";
import http from "http";

const {
  RESOLVER_PRIVATE_KEY,
  RPC_URL = "https://mainnet.megaeth.com/rpc",
  GRID_ADDRESS = "0x23D682B07fFADf6F772E6A2310bD882E5B23982f",
  BATCH_RESOLVER_ADDRESS = "",
  INDEXER_URL = "https://dqvwpbggjlcumcmlliuj.supabase.co/functions/v1/megaore-indexer",
  PORT = "8080",
} = process.env;

if (!RESOLVER_PRIVATE_KEY) { console.error("RESOLVER_PRIVATE_KEY required"); process.exit(1); }
if (!BATCH_RESOLVER_ADDRESS) { console.error("BATCH_RESOLVER_ADDRESS required"); process.exit(1); }

const wallet = new ethers.Wallet(RESOLVER_PRIVATE_KEY);
const provider = new ethers.JsonRpcProvider(RPC_URL);
const grid = new ethers.Contract(GRID_ADDRESS, [
  "function currentRoundId() view returns (uint256)",
  "function rounds(uint256) view returns (uint64 startTime, uint64 endTime, uint256 totalDeposits, uint16 totalPlayers, uint8 winningCell, bool resolved, bool pendingVRF)",
], provider);
const batchIface = new ethers.Interface([
  "function resolveAndFulfill(bytes32 randomness, uint64 drandRound, bytes signature)",
  "function fulfillOnly(uint256 roundId, bytes32 randomness, uint64 drandRound, bytes signature)",
]);
const gridIface = new ethers.Interface([
  "function resolveRound()",
]);

function log(msg, data = {}) {
  const extra = Object.keys(data).length ? " " + JSON.stringify(data) : "";
  console.log(`${new Date().toISOString()} [resolver] ${msg}${extra}`);
}

// ── Raw RPC ──
async function rpc(method, params) {
  const r = await fetch(RPC_URL, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method, params, id: Date.now() }),
    signal: AbortSignal.timeout(10000),
  });
  const data = await r.json();
  if (data.error) throw new Error(`RPC ${method}: ${data.error.message}`);
  return data.result;
}

// ── drand ──
const DC = "52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971";
async function fetchDrand() {
  for (const base of ["https://api.drand.sh", "https://drand.cloudflare.com"]) {
    try {
      const r = await fetch(`${base}/${DC}/public/latest`, { signal: AbortSignal.timeout(3000) });
      if (!r.ok) continue;
      const d = await r.json();
      return { randomness: "0x" + d.randomness, round: d.round, signature: "0x" + d.signature };
    } catch { continue; }
  }
  throw new Error("drand failed");
}

// ── Send raw tx: ALWAYS fetch nonce fresh, never cache ──
async function sendTx(calldata, label, to = BATCH_RESOLVER_ADDRESS) {
  const nonce = parseInt(await rpc("eth_getTransactionCount", [wallet.address, "pending"]), 16);
  const chainId = parseInt(await rpc("eth_chainId", []), 16);

  const signed = await wallet.signTransaction({
    to, data: calldata,
    gasLimit: 800000n, gasPrice: 1000000n,
    nonce, chainId, type: 0,
  });

  const hash = await rpc("eth_sendRawTransaction", [signed]);
  log("TX sent", { hash, nonce, label });

  // Wait for receipt
  const start = Date.now();
  while (Date.now() - start < 15000) {
    try {
      const receipt = await rpc("eth_getTransactionReceipt", [hash]);
      if (receipt) {
        const status = parseInt(receipt.status, 16);
        const gas = parseInt(receipt.gasUsed, 16);
        if (status === 1) {
          log("TX confirmed", { hash, gas, label });
          return { success: true, hash, gas };
        } else {
          log("TX reverted", { hash, gas, label });
          return { success: false, reverted: true };
        }
      }
    } catch {}
    await sleep(250);
  }
  log("TX timeout", { hash, label });
  return { success: false, timeout: true };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── State ──
let totalResolved = 0, totalErrors = 0, busy = false;

// ── Sweep stuck rounds ──
async function sweep(currentRoundId) {
  for (let rid = currentRoundId - 1; rid > Math.max(0, currentRoundId - 20); rid--) {
    try {
      const r = await grid.rounds(rid);
      if (r.pendingVRF && !r.resolved && Number(r.totalPlayers) > 0) {
        log("Sweeping stuck round", { roundId: rid });
        const drand = await fetchDrand();
        const cd = batchIface.encodeFunctionData("fulfillOnly", [rid, drand.randomness, drand.round, drand.signature]);
        const res = await sendTx(cd, `sweep-${rid}`);
        if (res.success) { totalResolved++; indexRound(rid, res.hash); }
        return true;
      }
    } catch {}
  }
  return false;
}

// ── Index round to Supabase ──
async function indexRound(roundId, txHash) {
  try {
    const r = await fetch(INDEXER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roundId, txHash }),
    });
    const d = await r.json();
    log("Indexed", { roundId, action: d.action, players: d.players });
  } catch (e) {
    log("Index error", { roundId, err: (e?.message || "").slice(0, 100) });
  }
}

// ── Main loop ──
async function poll() {
  if (busy) return;
  busy = true;
  try {
    const roundId = Number(await grid.currentRoundId());
    const round = await grid.rounds(roundId);
    const miners = Number(round.totalPlayers);

    if (round.resolved) { await sweep(roundId); return; }

    if (round.pendingVRF && miners > 0) {
      log("Fulfilling pending VRF", { roundId });
      const drand = await fetchDrand();
      const cd = batchIface.encodeFunctionData("fulfillOnly", [roundId, drand.randomness, drand.round, drand.signature]);
      const res = await sendTx(cd, `fulfill-${roundId}`);
      if (res.success) { totalResolved++; indexRound(roundId, res.hash); }
      return;
    }

    if (Date.now() / 1000 < Number(round.endTime)) return; // round still active

    // Empty round — call resolveRound() on grid directly to advance
    if (miners === 0) {
      log("Empty round, advancing", { roundId });
      const cd = gridIface.encodeFunctionData("resolveRound");
      const res = await sendTx(cd, `advance-${roundId}`, GRID_ADDRESS);
      if (res.success) { totalResolved++; log("ADVANCED", { roundId }); }
      return;
    }

    log("Resolving", { roundId, miners });
    const drand = await fetchDrand();
    const cd = batchIface.encodeFunctionData("resolveAndFulfill", [drand.randomness, drand.round, drand.signature]);
    const res = await sendTx(cd, `resolve-${roundId}`);
    if (res.success) { totalResolved++; log("RESOLVED", { roundId }); indexRound(roundId, res.hash); }
  } catch (e) {
    totalErrors++;
    const msg = e?.message || String(e);
    if (!msg.includes("RoundNot") && !msg.includes("Already")) log("Error", { err: msg.slice(0, 200) });
  } finally { busy = false; }
}

// ── Health ──
http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", totalResolved, totalErrors, uptime: process.uptime() }));
  } else { res.writeHead(404); res.end(); }
}).listen(Number(PORT), () => log("Health on :" + PORT));

// ── Start ──
async function start() {
  log("Starting", { grid: GRID_ADDRESS, batch: BATCH_RESOLVER_ADDRESS, wallet: wallet.address });
  try { await sweep(Number(await grid.currentRoundId())); } catch {}
  setInterval(poll, 1000);
}

start().catch(e => { console.error("Fatal:", e); process.exit(1); });
process.on("SIGTERM", () => { log("Shutdown", { totalResolved, totalErrors }); process.exit(0); });
