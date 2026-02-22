const { ethers } = require("ethers");
require("dotenv").config();

const RPC_URL = process.env.RPC_URL || "https://mainnet.megaeth.com/rpc";
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const GRID_ADDRESS = process.env.GRID_ADDRESS;

const GRID_ABI = [
  "function resolveRound() external",
  "function canResolve() external view returns (bool)",
  "function getCurrentRound() external view returns (uint256, uint64, uint64, uint256, uint16, bool)",
];

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
const grid = new ethers.Contract(GRID_ADDRESS, GRID_ABI, wallet);
let total = 0;
let cooldown = false;

async function check() {
  if (cooldown) return;
  try {
    const [roundId, start, end, deposits, players, resolved] = await grid.getCurrentRound();
    const now = Math.floor(Date.now() / 1000);
    const remaining = Number(end) - now;

    if (remaining > 0) return; // round still active
    if (resolved) return; // already resolved

    const canResolve = await grid.canResolve();
    if (!canResolve) return;

    console.log(`[${new Date().toISOString()}] Round #${roundId} — ${players} miners, ${ethers.formatEther(deposits)} ETH pot`);
    const tx = await grid.resolveRound({ gasLimit: 500000 });
    const r = await tx.wait();
    total++;
    console.log(`  ✓ Resolved. Gas: ${r.gasUsed} | Total: ${total}`);

    // cooldown to let new round start
    cooldown = true;
    setTimeout(() => { cooldown = false; }, 10000);
  } catch (e) {
    if (e.message.includes("RoundNotEnded") || e.message.includes("RoundAlreadyResolved")) return;
    console.error(`  ✗ ${e.shortMessage || e.message}`);
  }
}

console.log("═══════════════════════════════════");
console.log("  MEGAORE RESOLVER BOT");
console.log(`  Grid:   ${GRID_ADDRESS}`);
console.log(`  Wallet: ${wallet.address}`);
console.log("═══════════════════════════════════");
setInterval(check, 5000);
check();
