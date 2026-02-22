const { ethers, run } = require("hardhat");
const fs = require("fs");

async function main() {
  const addresses = JSON.parse(fs.readFileSync("deployed-addresses-v2.json", "utf8"));
  const MEGABIT_NFT = "0xc3d803bd108be89ca9326c9e6e6199192bc90228";

  console.log("═══════════════════════════════════");
  console.log("  VERIFYING V2 CONTRACTS");
  console.log("═══════════════════════════════════\n");

  // 1. OreToken (no constructor args)
  console.log("1. Verifying OreToken...");
  try {
    await run("verify:verify", { address: addresses.oreToken, constructorArguments: [] });
    console.log("   ✓ OreToken verified");
  } catch (e) { console.log("   ⚠", e.message.slice(0, 80)); }

  // 2. NFTStaking
  console.log("2. Verifying NFTStaking...");
  try {
    await run("verify:verify", { address: addresses.nftStaking, constructorArguments: [MEGABIT_NFT] });
    console.log("   ✓ NFTStaking verified");
  } catch (e) { console.log("   ⚠", e.message.slice(0, 80)); }

  // 3. OreTreasury
  console.log("3. Verifying OreTreasury...");
  try {
    await run("verify:verify", { address: addresses.oreTreasury, constructorArguments: [addresses.oreToken, addresses.teamWallet] });
    console.log("   ✓ OreTreasury verified");
  } catch (e) { console.log("   ⚠", e.message.slice(0, 80)); }

  // 4. OreGrid V2
  console.log("4. Verifying OreGrid V2...");
  try {
    await run("verify:verify", {
      address: addresses.oreGrid,
      constructorArguments: [
        addresses.oreToken,
        addresses.nftStaking,
        addresses.oreTreasury,
        addresses.fulfiller,
        ethers.parseEther("0.0001"),   // depositAmount
        30,                             // roundDuration
        ethers.parseEther("1"),         // orePerRound
        1000,                           // protocolFeeBps
        ethers.parseEther("0.2"),       // motherlodePerRound
        5000,                           // nftBoostBps
        ethers.parseEther("0.01"),      // resolverReward
      ],
    });
    console.log("   ✓ OreGrid verified");
  } catch (e) { console.log("   ⚠", e.message.slice(0, 80)); }

  console.log("\n✅ Done! Check https://mega.etherscan.io/");
}

main().catch(console.error);
