const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("=".repeat(60));
  console.log("  MEGAORE PROTOCOL — Full Deployment");
  console.log("  Chain: MegaETH");
  console.log(`  Deployer: ${deployer.address}`);
  console.log("=".repeat(60));

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`  Balance: ${ethers.formatEther(balance)} ETH\n`);

  // ─── Config ───────────────────────────────────────────
  const MEGABIT_NFT = "0x79225A7a6c89CC05006a3eEb561D72F8f624aB4E";
  const TEAM_WALLET = deployer.address; // Change to multisig

  const DEPOSIT_AMOUNT = ethers.parseEther("0.01");
  const ROUND_DURATION = 30;
  const ORE_PER_ROUND = ethers.parseEther("1");
  const PROTOCOL_FEE_BPS = 1000;
  const MOTHERLODE_PER_ROUND = ethers.parseEther("0.2");
  const NFT_BOOST_BPS = 5000;
  const RESOLVER_REWARD = ethers.parseEther("0.01");

  // ─── 1. OreToken ──────────────────────────────────────
  console.log("1/5 Deploying OreToken...");
  const OreToken = await ethers.getContractFactory("OreToken");
  const oreToken = await OreToken.deploy();
  await oreToken.waitForDeployment();
  const tokenAddr = await oreToken.getAddress();
  console.log(`  ✅ OreToken: ${tokenAddr}`);

  // ─── 2. NFTStaking ────────────────────────────────────
  console.log("\n2/5 Deploying NFTStaking...");
  const NFTStaking = await ethers.getContractFactory("NFTStaking");
  const nftStaking = await NFTStaking.deploy(MEGABIT_NFT);
  await nftStaking.waitForDeployment();
  const stakingAddr = await nftStaking.getAddress();
  console.log(`  ✅ NFTStaking: ${stakingAddr}`);

  // ─── 3. OreTreasury ───────────────────────────────────
  console.log("\n3/5 Deploying OreTreasury...");
  const OreTreasury = await ethers.getContractFactory("OreTreasury");
  const treasury = await OreTreasury.deploy(tokenAddr, TEAM_WALLET);
  await treasury.waitForDeployment();
  const treasuryAddr = await treasury.getAddress();
  console.log(`  ✅ OreTreasury: ${treasuryAddr}`);

  // ─── 4. OreGrid ───────────────────────────────────────
  console.log("\n4/5 Deploying OreGrid...");
  const OreGrid = await ethers.getContractFactory("OreGrid");
  const oreGrid = await OreGrid.deploy(
    tokenAddr, stakingAddr, treasuryAddr,
    DEPOSIT_AMOUNT, ROUND_DURATION, ORE_PER_ROUND,
    PROTOCOL_FEE_BPS, MOTHERLODE_PER_ROUND, NFT_BOOST_BPS, RESOLVER_REWARD
  );
  await oreGrid.waitForDeployment();
  const gridAddr = await oreGrid.getAddress();
  console.log(`  ✅ OreGrid: ${gridAddr}`);

  // ─── 5. Wire contracts ────────────────────────────────
  console.log("\n5/5 Wiring contracts...");
  await oreToken.setMinter(gridAddr);
  console.log("  ✅ OreToken.setMinter → OreGrid");
  await nftStaking.setGridContract(gridAddr);
  console.log("  ✅ NFTStaking.setGridContract → OreGrid");
  await nftStaking.setTreasuryContract(treasuryAddr);
  console.log("  ✅ NFTStaking.setTreasuryContract → OreTreasury");
  await treasury.setGridContract(gridAddr);
  console.log("  ✅ OreTreasury.setGridContract → OreGrid");
  await treasury.setStakingContract(stakingAddr);
  console.log("  ✅ OreTreasury.setStakingContract → NFTStaking");

  // ─── Summary ──────────────────────────────────────────
  console.log("\n" + "=".repeat(60));
  console.log("  MEGAORE DEPLOYMENT COMPLETE");
  console.log("=".repeat(60));
  console.log(`  OreToken:    ${tokenAddr}`);
  console.log(`  NFTStaking:  ${stakingAddr}`);
  console.log(`  OreTreasury: ${treasuryAddr}`);
  console.log(`  OreGrid:     ${gridAddr}`);
  console.log("=".repeat(60));
  console.log("  Config:");
  console.log(`  Deposit:     0.01 ETH per cell`);
  console.log(`  Round:       ${ROUND_DURATION}s`);
  console.log(`  ORE/round:   1 ORE`);
  console.log(`  Fee:         10%`);
  console.log(`  NFT Boost:   +50%`);
  console.log(`  Motherlode:  0.2 ORE/round (1/625 odds)`);
  console.log(`  Resolver:    0.01 ORE reward`);
  console.log(`  MegaBit NFT: ${MEGABIT_NFT}`);
  console.log("=".repeat(60));

  const fs = require("fs");
  fs.writeFileSync("deployed-addresses.json", JSON.stringify({
    oreToken: tokenAddr, nftStaking: stakingAddr,
    oreTreasury: treasuryAddr, oreGrid: gridAddr,
    megabitNFT: MEGABIT_NFT, teamWallet: TEAM_WALLET,
    chainId: 6342, network: "megaeth",
  }, null, 2));
  console.log("\n📄 Addresses saved to deployed-addresses.json");
}

main().then(() => process.exit(0)).catch((e) => { console.error("❌", e); process.exit(1); });
