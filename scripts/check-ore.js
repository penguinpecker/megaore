const { ethers } = require("hardhat");
async function main() {
  const g = await ethers.getContractAt(["function orePerRound() view returns (uint256)","function resolverReward() view returns (uint256)","function motherlodePerRound() view returns (uint256)","function nftBoostBps() view returns (uint256)","function protocolFeeBps() view returns (uint256)"], "0x273A6aFEd1aA076202Fa28333dE4c4a88f9477Dd");
  console.log("orePerRound:", ethers.formatEther(await g.orePerRound()));
  console.log("resolverReward:", ethers.formatEther(await g.resolverReward()));
  console.log("motherlodePerRound:", ethers.formatEther(await g.motherlodePerRound()));
  console.log("nftBoostBps:", Number(await g.nftBoostBps()));
  console.log("protocolFeeBps:", Number(await g.protocolFeeBps()));
}
main();
