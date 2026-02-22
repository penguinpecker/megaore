const { ethers } = require("ethers");
require("dotenv").config();

const RPC_URL = process.env.RPC_URL || "https://carrot.megaeth.com/rpc";
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const GRID_ADDRESS = process.env.GRID_ADDRESS;

const GRID_ABI = [
  "function resolveRound() external",
  "function canResolve() external view returns (bool)",
  "function getCurrentRound() external view returns (uint256, uint64, uint64, uint256, uint16, bool)",
  "event RoundResolved(uint256 indexed roundId, uint8 winningCell, uint256 winnersCount, uint256 potPerWinner, uint256 orePerWinner, bool motherlodeTriggered)",
];

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
const grid = new ethers.Contract(GRID_ADDRESS, GRID_ABI, wallet);

let roundsResolved = 0;

async function checkAndResolve() {
  try {
    const canResolve = await grid.canResolve();
    if (canResolve) {
      console.log(`[${new Date().toISOString()}] Resolving...`);
      const tx = await grid.resolveRound({ gasLimit: 500000 });
      const receipt = await tx.wait();
      roundsResolved++;

      const evt = receipt.logs.find(
        (l) => l.topics[0] === grid.interface.getEvent("RoundResolved").topicHash
      );
      if (evt) {
        const p = grid.interface.parseLog(evt);
        console.log(`  ✅ Round #${p.args[0]} | Cell ${p.args[1]} | ${p.args[2]} winners | ${ethers.formatEther(p.args[3])} ETH each`);
        if (p.args[5]) console.log(`  🎰 MOTHERLODE!`);
      }
      console.log(`  Gas: ${receipt.gasUsed} | Total: ${roundsResolved}`);
    }
  } catch (err) {
    if (!err.message.includes("RoundNotEnded") && !err.message.includes("RoundAlreadyResolved")) {
      console.error(`[${new Date().toISOString()}] Error:`, err.message);
    }
  }
}

async function main() {
  console.log("=".repeat(50));
  console.log("  MEGAORE RESOLVER BOT");
  console.log("=".repeat(50));
  console.log(`  Grid:     ${GRID_ADDRESS}`);
  console.log(`  Resolver: ${wallet.address}`);
  const bal = await provider.getBalance(wallet.address);
  console.log(`  Balance:  ${ethers.formatEther(bal)} ETH`);
  console.log("=".repeat(50));
  setInterval(checkAndResolve, 5000);
  checkAndResolve();
}

main().catch(console.error);
