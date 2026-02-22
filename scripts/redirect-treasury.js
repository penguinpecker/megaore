require("dotenv").config();
const { ethers } = require("hardhat");

const NEW_WALLET = "0x9F9244ED9661d61fA2Da38Ec466823fbDf1D5b5e";

// V1 Treasury
const V1_TREASURY = "0xF746406FE2c4d3eC9aFd227e298E398209405f04";
// V2 Treasury  
const V2_TREASURY = "0xd6f1c0b5c4ecff143070060bc92aef61ab51332a";

const ABI = [
  "function setTeamWallet(address) external",
  "function distribute() external",
  "function teamWallet() view returns (address)",
  "function getStats() view returns (uint256,uint256,uint256,uint256,uint256)",
];

async function main() {
  const [signer] = await ethers.getSigners();
  console.log("Signer:", signer.address);

  // === V1 Treasury ===
  console.log("\n=== V1 Treasury ===");
  const v1 = new ethers.Contract(V1_TREASURY, ABI, signer);
  const v1wallet = await v1.teamWallet();
  console.log("Current teamWallet:", v1wallet);
  
  // Set new team wallet
  let tx = await v1.setTeamWallet(NEW_WALLET);
  await tx.wait();
  console.log("✓ setTeamWallet →", NEW_WALLET);
  
  // Distribute any balance
  try {
    tx = await v1.distribute();
    await tx.wait();
    console.log("✓ Distributed V1 balance");
  } catch (e) {
    console.log("  distribute() skipped:", e.shortMessage || e.message);
  }

  // === V2 Treasury ===
  console.log("\n=== V2 Treasury ===");
  const v2 = new ethers.Contract(V2_TREASURY, ABI, signer);
  const v2wallet = await v2.teamWallet();
  console.log("Current teamWallet:", v2wallet);
  
  // Set new team wallet
  tx = await v2.setTeamWallet(NEW_WALLET);
  await tx.wait();
  console.log("✓ setTeamWallet →", NEW_WALLET);
  
  // Distribute any balance
  try {
    tx = await v2.distribute();
    await tx.wait();
    console.log("✓ Distributed V2 balance");
  } catch (e) {
    console.log("  distribute() skipped:", e.shortMessage || e.message);
  }

  // Verify
  console.log("\n=== Verified ===");
  console.log("V1 teamWallet:", await v1.teamWallet());
  console.log("V2 teamWallet:", await v2.teamWallet());
}

main().catch(console.error);
