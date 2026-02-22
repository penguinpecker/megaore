const { ethers } = require("hardhat");
async function main() {
  const treasury = await ethers.getContractAt(["function getStats() view returns (uint256,uint256,uint256,uint256,uint256)","function teamWallet() view returns (address)"], "0xF746406FE2c4d3eC9aFd227e298E398209405f04");
  const [received, distributed, burned, pendingBuyback, balance] = await treasury.getStats();
  const team = await treasury.teamWallet();
  console.log("Treasury:", "0xF746406FE2c4d3eC9aFd227e298E398209405f04");
  console.log("Balance:", ethers.formatEther(balance), "ETH");
  console.log("Total received:", ethers.formatEther(received), "ETH");
  console.log("Total distributed:", ethers.formatEther(distributed), "ETH");
  console.log("Pending buyback:", ethers.formatEther(pendingBuyback), "ETH");
  console.log("Team wallet:", team);
}
main();
