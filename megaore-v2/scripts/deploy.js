const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying V2 contracts with:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

  // ─── Config ───
  const MEGABIT_NFT = "0xc3d803bd108be89ca9326c9e6e6199192bc90228"; // existing MegaBit NFT
  const TEAM_WALLET = deployer.address;
  // Goldsky Compose fulfiller — set this after running `goldsky compose callTask generate_wallet`
  const FULFILLER = process.env.FULFILLER_ADDRESS || deployer.address; // temp: deployer until goldsky is set up

  const DEPOSIT = ethers.parseEther("0.0001");
  const ROUND_DURATION = 30;
  const ORE_PER_ROUND = ethers.parseEther("1");
  const FEE_BPS = 1000; // 10%
  const MOTHERLODE_PER_ROUND = ethers.parseEther("0.2");
  const NFT_BOOST_BPS = 5000; // 50%
  const RESOLVER_REWARD = ethers.parseEther("0.01");

  // ─── Deploy OreToken ───
  console.log("\n1. Deploying OreToken...");
  const OreToken = await ethers.getContractFactory("OreToken");
  const oreToken = await OreToken.deploy();
  await oreToken.waitForDeployment();
  const oreAddr = await oreToken.getAddress();
  console.log("   OreToken:", oreAddr);

  // ─── Deploy NFTStaking ───
  console.log("2. Deploying NFTStaking...");
  const NFTStaking = await ethers.getContractFactory("NFTStaking");
  const nftStaking = await NFTStaking.deploy(MEGABIT_NFT);
  await nftStaking.waitForDeployment();
  const stakingAddr = await nftStaking.getAddress();
  console.log("   NFTStaking:", stakingAddr);

  // ─── Deploy OreTreasury ───
  console.log("3. Deploying OreTreasury...");
  const OreTreasury = await ethers.getContractFactory("OreTreasury");
  const treasury = await OreTreasury.deploy(oreAddr, TEAM_WALLET);
  await treasury.waitForDeployment();
  const treasuryAddr = await treasury.getAddress();
  console.log("   OreTreasury:", treasuryAddr);

  // ─── Deploy OreGrid V2 ───
  console.log("4. Deploying OreGrid V2 (with VRF)...");
  const OreGrid = await ethers.getContractFactory("OreGrid");
  const grid = await OreGrid.deploy(
    oreAddr, stakingAddr, treasuryAddr, FULFILLER,
    DEPOSIT, ROUND_DURATION, ORE_PER_ROUND, FEE_BPS,
    MOTHERLODE_PER_ROUND, NFT_BOOST_BPS, RESOLVER_REWARD
  );
  await grid.waitForDeployment();
  const gridAddr = await grid.getAddress();
  console.log("   OreGrid:", gridAddr);

  // ─── Wire up ───
  console.log("\n5. Wiring contracts...");
  let tx;

  tx = await oreToken.setMinter(gridAddr);
  await tx.wait();
  console.log("   ✓ OreToken.setMinter → OreGrid");

  tx = await nftStaking.setGridContract(gridAddr);
  await tx.wait();
  console.log("   ✓ NFTStaking.setGridContract → OreGrid");

  tx = await nftStaking.setTreasuryContract(treasuryAddr);
  await tx.wait();
  console.log("   ✓ NFTStaking.setTreasuryContract → OreTreasury");

  tx = await treasury.setGridContract(gridAddr);
  await tx.wait();
  console.log("   ✓ OreTreasury.setGridContract → OreGrid");

  tx = await treasury.setStakingContract(stakingAddr);
  await tx.wait();
  console.log("   ✓ OreTreasury.setStakingContract → NFTStaking");

  // ─── Save addresses ───
  const addresses = {
    oreToken: oreAddr,
    nftStaking: stakingAddr,
    oreTreasury: treasuryAddr,
    oreGrid: gridAddr,
    fulfiller: FULFILLER,
    megabitNFT: MEGABIT_NFT,
    teamWallet: TEAM_WALLET,
  };

  const fs = require("fs");
  fs.writeFileSync("deployed-addresses-v2.json", JSON.stringify(addresses, null, 2));
  console.log("\n═══════════════════════════════════");
  console.log("  MEGAORE V2 DEPLOYED (drand VRF)");
  console.log("═══════════════════════════════════");
  console.log(JSON.stringify(addresses, null, 2));
  console.log("\nNext steps:");
  console.log("1. Install Goldsky CLI: curl -fsSL https://goldsky.com/install | sh");
  console.log("2. Run: goldsky compose start");
  console.log("3. Get fulfiller wallet: goldsky compose callTask generate_wallet '{}'");
  console.log(`4. Update fulfiller: cast send ${gridAddr} "setFulfiller(address)" <FULFILLER_ADDR> --rpc-url https://mainnet.megaeth.com/rpc --private-key $PRIVATE_KEY`);
  console.log("5. Deploy compose: goldsky compose deploy");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
