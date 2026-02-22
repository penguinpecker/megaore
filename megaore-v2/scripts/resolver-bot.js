require("dotenv").config();
const { ethers } = require("ethers");

const GRID_ADDRESS = process.env.GRID_ADDRESS;
const RPC_URL = process.env.MEGAETH_RPC_URL || "https://mainnet.megaeth.com/rpc";
const PRIVATE_KEY = process.env.PRIVATE_KEY;

const DRAND_API = "https://api.drand.sh/52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971";

const GRID_ABI = [
  "function resolveRound() external",
  "function canResolve() view returns (bool)",
  "function getCurrentRound() view returns (uint256,uint64,uint64,uint256,uint16,bool)",
  "function fulfillRandomness(uint256 requestId, bytes32 randomness, uint64 drandRound, bytes signature) external",
  "event RandomnessRequested(uint256 indexed requestId, address indexed requester)",
  "event RoundResolved(uint256 indexed roundId, uint8 winningCell, uint256 winnersCount, uint256 potPerWinner, uint256 orePerWinner, bool motherlodeTriggered)",
];

async function fetchDrandRandomness() {
  const res = await fetch(`${DRAND_API}/public/latest`);
  if (!res.ok) throw new Error(`drand API error: ${res.status}`);
  return await res.json();
}

function toBytes32(hex) {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  return "0x" + clean.padStart(64, "0");
}

function toBytes(hex) {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  return "0x" + clean;
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const grid = new ethers.Contract(GRID_ADDRESS, GRID_ABI, wallet);

  let totalResolved = 0;
  let totalFulfilled = 0;

  console.log("═══════════════════════════════════════════");
  console.log("  MEGAORE V2 — RESOLVER + drand VRF BOT");
  console.log("  Grid:     ", GRID_ADDRESS);
  console.log("  Wallet:   ", wallet.address);
  console.log("  drand:     League of Entropy (BLS12-381)");
  console.log("═══════════════════════════════════════════");
  console.log("\nBot running... (Ctrl+C to stop)\n");

  async function tick() {
    try {
      const canRes = await grid.canResolve();
      if (!canRes) return;

      const [roundId, , , deposits, players] = await grid.getCurrentRound();
      const ts = new Date().toISOString();

      // Step 1: Resolve round
      const resolveTx = await grid.resolveRound({ gasLimit: 500000 });
      const resolveReceipt = await resolveTx.wait();
      totalResolved++;

      // Check if VRF was requested (round had players)
      const vrfEvent = resolveReceipt.logs.find((l) => {
        try { return grid.interface.parseLog(l)?.name === "RandomnessRequested"; }
        catch { return false; }
      });

      if (!vrfEvent) {
        console.log(`[${ts}] Round #${roundId} — 0 miners, skipped`);
        return;
      }

      const parsed = grid.interface.parseLog(vrfEvent);
      const requestId = parsed.args[0];
      console.log(`[${ts}] Round #${roundId} — ${players} miners, ${ethers.formatEther(deposits)} ETH pot`);
      console.log(`  → VRF requested (id: ${requestId})`);

      // Step 2: Fetch drand randomness
      const drand = await fetchDrandRandomness();
      console.log(`  → drand round ${drand.round}, randomness: ${drand.randomness.slice(0, 16)}...`);

      // Step 3: Fulfill on-chain
      const fulfillTx = await grid.fulfillRandomness(
        requestId,
        toBytes32(drand.randomness),
        drand.round,
        toBytes(drand.signature),
        { gasLimit: 500000 }
      );
      const fulfillReceipt = await fulfillTx.wait();
      totalFulfilled++;

      // Check result
      const resolvedEvent = fulfillReceipt.logs.find((l) => {
        try { return grid.interface.parseLog(l)?.name === "RoundResolved"; }
        catch { return false; }
      });

      if (resolvedEvent) {
        const res = grid.interface.parseLog(resolvedEvent);
        const [, winningCell, winnersCount, potPerWinner, orePerWinner, motherlode] = res.args;
        const cellLetter = String.fromCharCode(65 + Math.floor(Number(winningCell) / 5));
        const cellNum = (Number(winningCell) % 5) + 1;
        console.log(`  ✓ Cell ${cellLetter}${cellNum} | Winners: ${winnersCount} | Gas: ${fulfillReceipt.gasUsed}`);
        if (Number(winnersCount) > 0) {
          console.log(`    💰 ${ethers.formatEther(potPerWinner)} ETH + ${ethers.formatEther(orePerWinner)} ORE per winner`);
        }
        if (motherlode) console.log(`    🌋 MOTHERLODE TRIGGERED!`);
      } else {
        console.log(`  ✓ Fulfilled | Gas: ${fulfillReceipt.gasUsed}`);
      }

      console.log(`  [Resolved: ${totalResolved} | Fulfilled: ${totalFulfilled}]`);
    } catch (err) {
      if (!err.message?.includes("RoundNotEnded") && !err.message?.includes("RoundAlreadyPending")) {
        console.error(`[${new Date().toISOString()}] Error:`, err.shortMessage || err.message);
      }
    }
  }

  setInterval(tick, 5000);
  tick();
}

main().catch(console.error);
