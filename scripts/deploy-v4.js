// scripts/deploy-v4.js
// Deploy The Grid V4 — rebranded contracts with bonus round mechanic
//
// Usage: npx hardhat run scripts/deploy-v4.js --network megaeth
//
// Prerequisites:
// - DEPLOYER_PRIVATE_KEY in .env
// - MegaETH network configured in hardhat.config

const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying The Grid V4 with:", deployer.address);
  console.log("Balance:", hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address)), "ETH");

  // ── Config ──
  const TEAM_WALLET = "0x9f9244ed58bcff8a68caac3c28bf7a6e26a0cc78";
  const NFT_STAKING = "0x0BBb89e2A710c96D3459b43d87653446320AaCc8"; // existing, unchanged
  const MEGABIT_NFT = "0xc3d803bd108be89ca9326c9e6e6199192bc90228"; // existing, unchanged

  const DEPOSIT_AMOUNT = hre.ethers.parseEther("0.0001");     // 0.0001 ETH per cell
  const ROUND_DURATION = 30;                                    // 30 seconds
  const GRID_PER_ROUND = hre.ethers.parseEther("1");           // 1 GRID per round
  const PROTOCOL_FEE_BPS = 1000;                                // 10%
  const MOTHERLODE_PER_ROUND = hre.ethers.parseEther("0.1");   // 0.1 GRID accumulates
  const NFT_BOOST_BPS = 5000;                                   // 50% boost
  const RESOLVER_REWARD = hre.ethers.parseEther("0.01");        // 0.01 GRID to resolver

  // ── 1. Deploy GridToken ──
  console.log("\n1/4 Deploying GridToken...");
  const GridToken = await hre.ethers.getContractFactory("GridToken");
  const gridToken = await GridToken.deploy();
  await gridToken.waitForDeployment();
  const gridTokenAddr = await gridToken.getAddress();
  console.log("   GridToken:", gridTokenAddr);

  // ── 2. Deploy TheGrid ──
  console.log("\n2/4 Deploying TheGrid...");
  const TheGrid = await hre.ethers.getContractFactory("TheGrid");
  const theGrid = await TheGrid.deploy(
    gridTokenAddr,
    NFT_STAKING,
    TEAM_WALLET,          // feeRecipient (direct, no treasury contract)
    deployer.address,     // fulfiller (temporary, will be BatchResolver)
    DEPOSIT_AMOUNT,
    ROUND_DURATION,
    GRID_PER_ROUND,
    PROTOCOL_FEE_BPS,
    MOTHERLODE_PER_ROUND,
    NFT_BOOST_BPS,
    RESOLVER_REWARD
  );
  await theGrid.waitForDeployment();
  const theGridAddr = await theGrid.getAddress();
  console.log("   TheGrid:", theGridAddr);

  // ── 3. Deploy GridBatchResolver ──
  console.log("\n3/4 Deploying GridBatchResolver...");
  const GridBatchResolver = await hre.ethers.getContractFactory("GridBatchResolver");
  const batchResolver = await GridBatchResolver.deploy(theGridAddr);
  await batchResolver.waitForDeployment();
  const batchResolverAddr = await batchResolver.getAddress();
  console.log("   GridBatchResolver:", batchResolverAddr);

  // ── 4. Deploy GridTreasury ──
  console.log("\n4/4 Deploying GridTreasury...");
  const GridTreasury = await hre.ethers.getContractFactory("GridTreasury");
  const gridTreasury = await GridTreasury.deploy(gridTokenAddr, TEAM_WALLET);
  await gridTreasury.waitForDeployment();
  const gridTreasuryAddr = await gridTreasury.getAddress();
  console.log("   GridTreasury:", gridTreasuryAddr);

  // ── Wire up permissions ──
  console.log("\nWiring permissions...");

  // GridToken: set TheGrid as minter
  const tx1 = await gridToken.setMinter(theGridAddr);
  await tx1.wait();
  console.log("   GridToken.setMinter → TheGrid ✓");

  // TheGrid: set BatchResolver as fulfiller
  const tx2 = await theGrid.setFulfiller(batchResolverAddr);
  await tx2.wait();
  console.log("   TheGrid.setFulfiller → GridBatchResolver ✓");

  // ── Summary ──
  const addresses = {
    gridToken: gridTokenAddr,
    theGrid: theGridAddr,
    gridBatchResolver: batchResolverAddr,
    gridTreasury: gridTreasuryAddr,
    nftStaking: NFT_STAKING,
    megabitNFT: MEGABIT_NFT,
    teamWallet: TEAM_WALLET,
    fulfiller: deployer.address,
    // V3 deprecated
    oreTokenV3_deprecated: "0x63Fb06feD80002818428673eE69D4dF1b1923e3A",
    oreGridV3_deprecated: "0xa3230e290205FfEf5a1f71e52b5aDba69a88208d",
    batchResolverV3_deprecated: "0xD0859F14324AB43B56Afe977241Fe4F7814CE7AC",
  };

  console.log("\n════════════════════════════════════════════");
  console.log("  THE GRID V4 — DEPLOYED");
  console.log("════════════════════════════════════════════");
  console.log(JSON.stringify(addresses, null, 2));
  console.log("════════════════════════════════════════════");

  // Save to file
  const fs = require("fs");
  fs.writeFileSync("deployed-addresses-v4.json", JSON.stringify(addresses, null, 2));
  console.log("\nSaved to deployed-addresses-v4.json");

  // ── Verification commands ──
  console.log("\n── Verify on explorer ──");
  console.log(`npx hardhat verify --network megaeth ${gridTokenAddr}`);
  console.log(`npx hardhat verify --network megaeth ${theGridAddr} ${gridTokenAddr} ${NFT_STAKING} ${TEAM_WALLET} ${deployer.address} ${DEPOSIT_AMOUNT} ${ROUND_DURATION} ${GRID_PER_ROUND} ${PROTOCOL_FEE_BPS} ${MOTHERLODE_PER_ROUND} ${NFT_BOOST_BPS} ${RESOLVER_REWARD}`);
  console.log(`npx hardhat verify --network megaeth ${batchResolverAddr} ${theGridAddr}`);
  console.log(`npx hardhat verify --network megaeth ${gridTreasuryAddr} ${gridTokenAddr} ${TEAM_WALLET}`);

  // ── Post-deploy checklist ──
  console.log("\n── POST-DEPLOY CHECKLIST ──");
  console.log("1. Update frontend TheGrid.js with new contract addresses");
  console.log("2. Update Railway resolver bot: GRID_ADDRESS + BATCH_RESOLVER_ADDRESS");
  console.log("3. Update Supabase backup function with new addresses");
  console.log("4. Verify all contracts on mega.etherscan.io");
  console.log("5. Test: join a round, resolve, check GRID minting");
  console.log("6. Transfer BatchResolver ownership if needed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
