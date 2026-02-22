const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying OreGrid V3 with:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

  const NFT_STAKING  = "0x0BBb89e2A710c96D3459b43d87653446320AaCc8";
  const MEGABIT_NFT  = "0xc3d803bd108be89ca9326c9e6e6199192bc90228";

  const FEE_RECIPIENT = "0x9F9244ED9661d61fA2Da38Ec466823fbDf1D5b5e";
  const FULFILLER     = deployer.address;

  const DEPOSIT              = ethers.parseEther("0.0001");
  const ROUND_DURATION       = 30;
  const ORE_PER_ROUND        = ethers.parseEther("1");
  const FEE_BPS              = 1000;
  const MOTHERLODE_PER_ROUND = ethers.parseEther("0.2");
  const NFT_BOOST_BPS        = 5000;
  const RESOLVER_REWARD      = ethers.parseEther("0.01");

  console.log("\n1. Deploying OreToken V3...");
  const OreToken = await ethers.getContractFactory("OreToken");
  const oreToken = await OreToken.deploy();
  await oreToken.waitForDeployment();
  const oreAddr = await oreToken.getAddress();
  console.log("   OreToken V3:", oreAddr);

  console.log("\n2. Deploying OreGrid V3...");
  const OreGrid = await ethers.getContractFactory("OreGrid");
  const grid = await OreGrid.deploy(
    oreAddr, NFT_STAKING, FEE_RECIPIENT, FULFILLER,
    DEPOSIT, ROUND_DURATION, ORE_PER_ROUND, FEE_BPS,
    MOTHERLODE_PER_ROUND, NFT_BOOST_BPS, RESOLVER_REWARD
  );
  await grid.waitForDeployment();
  const gridAddr = await grid.getAddress();
  console.log("   OreGrid V3:", gridAddr);

  console.log("\n3. Wiring OreToken minter → V3 grid...");
  let tx = await oreToken.setMinter(gridAddr);
  await tx.wait();
  console.log("   ✓ OreToken.setMinter →", gridAddr);

  console.log("\n4. Wiring NFTStaking → V3...");
  const nftStaking = await ethers.getContractAt(
    ["function setGridContract(address) external"],
    NFT_STAKING
  );
  tx = await nftStaking.setGridContract(gridAddr);
  await tx.wait();
  console.log("   ✓ NFTStaking.setGridContract →", gridAddr);

  const addresses = {
    oreTokenV3: oreAddr,
    nftStaking: NFT_STAKING,
    megabitNFT: MEGABIT_NFT,
    oreGridV3: gridAddr,
    feeRecipient: FEE_RECIPIENT,
    fulfiller: FULFILLER,
    oreTokenV2_deprecated: "0xf06859C5A8028f957BEcA3b176510f6E00e68a26",
    oreGridV2_deprecated: "0x23D682B07fFADf6F772E6A2310bD882E5B23982f",
  };

  const fs = require("fs");
  fs.writeFileSync("deployed-addresses-v3.json", JSON.stringify(addresses, null, 2));

  console.log("\n═══════════════════════════════════");
  console.log("  MEGAORE V3 DEPLOYED");
  console.log("═══════════════════════════════════");
  console.log(JSON.stringify(addresses, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
