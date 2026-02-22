import { ethers } from "ethers";
import fs from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const RPC_URL = "https://mainnet.megaeth.com/rpc";
const GRID_ADDRESS = "0xa3230e290205FfEf5a1f71e52b5aDba69a88208d"; // V3

const PRIVATE_KEY = process.env.RESOLVER_PRIVATE_KEY;
if (!PRIVATE_KEY) { console.error("Set RESOLVER_PRIVATE_KEY"); process.exit(1); }

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

const GRID_ABI = [
  "function setFulfiller(address _fulfiller) external",
  "function fulfiller() external view returns (address)",
  "function currentRoundId() external view returns (uint256)",
  "function rounds(uint256) external view returns (uint64, uint64, uint256, uint16, uint8, bool, bool)",
];

const BATCH_ABI = [
  "function resolveAndFulfill(bytes32 randomness, uint64 drandRound, bytes signature) external",
  "function fulfillOnly(uint256 roundId, bytes32 randomness, uint64 drandRound, bytes signature) external",
  "function owner() view returns (address)",
  "function grid() view returns (address)",
];

async function main() {
  console.log(`Deployer: ${wallet.address}`);
  const balance = await provider.getBalance(wallet.address);
  console.log(`Balance: ${ethers.formatEther(balance)} ETH\n`);

  // Step 1: Deploy using full ABI + raw bytecode (without constructor args)
  console.log("--- Step 1: Deploy BatchResolver for V3 ---");
  
  const fullABI = JSON.parse(fs.readFileSync(join(__dirname, "BatchResolver_abi.json"), "utf8"));
  const deployDataFull = fs.readFileSync(join(__dirname, "deploy_data.txt"), "utf8").trim();
  
  // Extract raw bytecode WITHOUT constructor args (remove last 64 hex chars = 32 bytes)
  const rawBytecode = deployDataFull.slice(0, -64);
  console.log(`Raw bytecode: ${rawBytecode.length} chars`);
  
  const factory = new ethers.ContractFactory(fullABI, rawBytecode, wallet);
  const contract = await factory.deploy(GRID_ADDRESS, { gasLimit: 30_000_000n });
  
  console.log(`Deploy TX: ${contract.deploymentTransaction().hash}`);
  await contract.waitForDeployment();
  
  const batchAddr = await contract.getAddress();
  console.log(`✓ BatchResolver V3 deployed at: ${batchAddr}`);
  console.log(`  Owner: ${await contract.owner()}`);
  console.log(`  Grid:  ${await contract.grid()}`);

  // Step 2: Set fulfiller on V3 grid
  console.log("\n--- Step 2: Set fulfiller on V3 grid ---");
  const grid = new ethers.Contract(GRID_ADDRESS, GRID_ABI, wallet);
  console.log(`  Old fulfiller: ${await grid.fulfiller()}`);
  
  const tx2 = await grid.setFulfiller(batchAddr, { gasLimit: 100_000n });
  await tx2.wait();
  console.log(`  New fulfiller: ${await grid.fulfiller()}`);

  // Step 3: Clear pending VRF rounds
  console.log("\n--- Step 3: Clear pending VRF rounds ---");
  const currentRound = Number(await grid.currentRoundId());
  const pending = [];
  for (let i = currentRound; i > Math.max(0, currentRound - 50); i--) {
    const r = await grid.rounds(i);
    if (r[6] && !r[5]) pending.push(i); // pendingVRF && !resolved
  }
  
  if (pending.length > 0) {
    console.log(`  Found ${pending.length} pending: ${pending.join(", ")}`);
    const drand = await (await fetch("https://api.drand.sh/52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971/public/latest")).json();
    const batch = new ethers.Contract(batchAddr, BATCH_ABI, wallet);
    
    for (const rid of pending) {
      try {
        const tx = await batch.fulfillOnly(rid, "0x"+drand.randomness, drand.round, "0x"+drand.signature, { gasLimit: 500_000n });
        const r = await tx.wait();
        console.log(`  ✓ Round ${rid} fulfilled (gas: ${r.gasUsed})`);
      } catch (e) {
        console.log(`  ✗ Round ${rid}: ${e.message.slice(0, 80)}`);
      }
    }
  } else {
    console.log("  No pending rounds");
  }

  console.log(`\n=== DONE ===`);
  console.log(`BatchResolver V3: ${batchAddr}`);
  console.log(`\nUpdate Railway env: BATCH_RESOLVER_ADDRESS=${batchAddr}`);
  console.log(`Update Railway env: GRID_ADDRESS=${GRID_ADDRESS}`);
}

main().catch(console.error);
