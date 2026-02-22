const { ethers } = require("hardhat");
async function main() {
  const ore = await ethers.getContractAt(["function balanceOf(address) view returns (uint256)","function totalSupply() view returns (uint256)"], "0xf432bAca7C6CA54a2D02B6b30ccdE9d2cD104538");
  const grid = await ethers.getContractAt(["function getCurrentRound() view returns (uint256,uint64,uint64,uint256,uint16,bool)","function motherlodePool() view returns (uint256)","function orePerRound() view returns (uint256)"], "0x273A6aFEd1aA076202Fa28333dE4c4a88f9477Dd");
  const supply = await ore.totalSupply();
  const player = await ore.balanceOf("0x31fC857D467AEEc23d31EF7C89b0054Eec49f711");
  const resolver = await ore.balanceOf("0xB022Cb7a3CA469B1846eEe93B69ceF57084e1410");
  const round = await grid.getCurrentRound();
  const ml = await grid.motherlodePool();
  console.log("Total ORE minted:", ethers.formatEther(supply));
  console.log("Player ORE:", ethers.formatEther(player));
  console.log("Resolver ORE:", ethers.formatEther(resolver));
  console.log("Current Round:", Number(round[0]), "| Players:", Number(round[4]));
  console.log("Motherlode Pool:", ethers.formatEther(ml), "ORE");
}
main();
