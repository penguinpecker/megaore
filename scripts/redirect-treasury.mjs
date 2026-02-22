import { ethers } from "ethers";
import "dotenv/config";

const NEW_WALLET = "0x9F9244ED9661d61fA2Da38Ec466823fbDf1D5b5e";
const V1_TREASURY = "0xF746406FE2c4d3eC9aFd227e298E398209405f04";
const V2_TREASURY = "0xd6f1c0b5c4ecff143070060bc92aef61ab51332a";
const RPC = "https://mainnet.megaeth.com/rpc";

const ABI = [
  "function setTeamWallet(address) external",
  "function distribute() external",
  "function teamWallet() view returns (address)",
];

const provider = new ethers.JsonRpcProvider(RPC);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

console.log("Signer:", wallet.address);

// V1
const v1 = new ethers.Contract(V1_TREASURY, ABI, wallet);
console.log("\n=== V1 Treasury ===");
console.log("Current teamWallet:", await v1.teamWallet());
let tx = await v1.setTeamWallet(NEW_WALLET);
await tx.wait();
console.log("✓ setTeamWallet →", NEW_WALLET);
try { tx = await v1.distribute(); await tx.wait(); console.log("✓ Distributed"); } catch(e) { console.log("  distribute skipped:", e.shortMessage || e.message); }

// V2
const v2 = new ethers.Contract(V2_TREASURY, ABI, wallet);
console.log("\n=== V2 Treasury ===");
console.log("Current teamWallet:", await v2.teamWallet());
tx = await v2.setTeamWallet(NEW_WALLET);
await tx.wait();
console.log("✓ setTeamWallet →", NEW_WALLET);
try { tx = await v2.distribute(); await tx.wait(); console.log("✓ Distributed"); } catch(e) { console.log("  distribute skipped:", e.shortMessage || e.message); }

// Verify
console.log("\n=== Verified ===");
console.log("V1 teamWallet:", await v1.teamWallet());
console.log("V2 teamWallet:", await v2.teamWallet());
