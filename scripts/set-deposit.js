const { ethers } = require("hardhat");

async function main() {
  const gridAddress = "0x273A6aFEd1aA076202Fa28333dE4c4a88f9477Dd";
  
  const grid = await ethers.getContractAt(
    ["function setDepositAmount(uint256) external", "function depositAmount() view returns (uint256)"],
    gridAddress
  );

  const oldAmount = await grid.depositAmount();
  console.log("Current deposit:", ethers.formatEther(oldAmount), "ETH");

  const tx = await grid.setDepositAmount(ethers.parseEther("0.0001"));
  await tx.wait();

  const newAmount = await grid.depositAmount();
  console.log("New deposit:", ethers.formatEther(newAmount), "ETH");
  console.log("Done!");
}

main().catch(console.error);
