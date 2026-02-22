const { ethers } = require("hardhat");
async function main() {
  const grid = await ethers.getContractAt(
    ["function joinRound(uint8) payable", "function getCurrentRound() view returns (uint256,uint64,uint64,uint256,uint16,bool)"],
    "0x23D682B07fFADf6F772E6A2310bD882E5B23982f"
  );
  const [roundId] = await grid.getCurrentRound();
  console.log("Joining round", Number(roundId), "on cell 12 (C3)...");
  const tx = await grid.joinRound(12, { value: ethers.parseEther("0.0001") });
  await tx.wait();
  console.log("✓ Joined! Wait for round to end and VRF to fulfill...");
}
main();
