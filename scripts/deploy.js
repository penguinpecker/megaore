const { ethers } = require("hardhat");
const fs = require("fs");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("=".repeat(60));
  console.log("  MEGAORE PROTOCOL — Full Deployment");
  console.log("  Deployer:", deployer.address);
  console.log("=".repeat(60));

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("  Balance:", ethers.formatEther(balance), "ETH\n");

  const MEGABIT_NFT = "0x79225A7a6c89CC05006a3eEb561D72F8f624aB4E";
  const TEAM_WALLET = deployer.address;

  console.log("1/5 Deploying OreToken...");
  const oreToken = await (await ethers.getContractFactory("OreToken")).deploy();
  await oreToken.waitForDeployment();
  const tokenAddr = await oreToken.getAddress();
  console.log("  OreToken:", tokenAddr);

  console.log("2/5 Deploying NFTStaking...");
  const nftStaking = await (await ethers.getContractFactory("NFTStaking")).deploy(MEGABIT_NFT);
  await nftStaking.waitForDeployment();
  const stakingAddr = await nftStaking.getAddress();
  console.log("  NFTStaking:", stakingAddr);

  console.log("3/5 Deploying OreTreasury...");
  const treasury = await (await ethers.getContractFactory("OreTreasury")).deploy(tokenAddr, TEAM_WALLET);
  await treasury.waitForDeployment();
  const treasuryAddr = await treasury.getAddress();
  console.log("  OreTreasury:", treasuryAddr);

  console.log("4/5 Deploying OreGrid...");
  const oreGrid = await (await ethers.getContractFactory("OreGrid")).deploy(
    tokenAddr, stakingAddr, treasuryAddr,
    ethers.parseEther("0.01"), 30, ethers.parseEther("1"),
    1000, ethers.parseEther("0.2"), 5000, ethers.parseEther("0.01")
  );
  await oreGrid.waitForDeployment();
  const gridAddr = await oreGrid.getAddress();
  console.log("  OreGrid:", gridAddr);

  console.log("5/5 Wiring contracts...");
  await oreToken.setMinter(gridAddr);
  await nftStaking.setGridContract(gridAddr);
  await nftStaking.setTreasuryContract(treasuryAddr);
  await treasury.setGridContract(gridAddr);
  await treasury.setStakingContract(stakingAddr);
  console.log("  All wired.");

  console.log("\n  MEGAORE DEPLOYMENT COMPLETE");
  console.log("  OreToken:   ", tokenAddr);
  console.log("  NFTStaking: ", stakingAddr);
  console.log("  OreTreasury:", treasuryAddr);
  console.log("  OreGrid:    ", gridAddr);

  fs.writeFileSync("deployed-addresses.json", JSON.stringify({
    oreToken: tokenAddr, nftStaking: stakingAddr,
    oreTreasury: treasuryAddr, oreGrid: gridAddr,
    megabitNFT: MEGABIT_NFT, teamWallet: TEAM_WALLET,
    chainId: 4326, network: "megaeth",
  }, null, 2));
  console.log("  Saved to deployed-addresses.json");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
