import { parseAbi } from "viem";

export const CONTRACTS = {
  oreToken: "0xf432bAca7C6CA54a2D02B6b30ccdE9d2cD104538",
  nftStaking: "0x5AB3a027E6b2C3d2924ed3a6bB1935cc511fA8BF",
  oreTreasury: "0xF746406FE2c4d3eC9aFd227e298E398209405f04",
  oreGrid: "0x273A6aFEd1aA076202Fa28333dE4c4a88f9477Dd",
};

export const GRID_ABI = parseAbi([
  "function joinRound(uint8 cell) external payable",
  "function resolveRound() external",
  "function getCurrentRound() external view returns (uint256 roundId, uint64 startTime, uint64 endTime, uint256 totalDeposits, uint16 totalPlayers, bool resolved)",
  "function getCellCounts() external view returns (uint16[25])",
  "function getCellPlayers(uint256 roundId, uint8 cell) external view returns (address[])",
  "function canResolve() external view returns (bool)",
  "function hasJoined(uint256, address) external view returns (bool)",
  "function playerCell(uint256, address) external view returns (uint8)",
  "function depositAmount() external view returns (uint256)",
  "function motherlodePool() external view returns (uint256)",
  "function orePerRound() external view returns (uint256)",
  "event RoundStarted(uint256 indexed roundId, uint64 startTime, uint64 endTime)",
  "event PlayerJoined(uint256 indexed roundId, address indexed player, uint8 cell)",
  "event RoundResolved(uint256 indexed roundId, uint8 winningCell, uint256 winnersCount, uint256 potPerWinner, uint256 orePerWinner, bool motherlodeTriggered)",
  "event MotherlodeTriggered(uint256 indexed roundId, uint256 amount, uint256 winnersCount)",
]);

export const ORE_ABI = parseAbi([
  "function balanceOf(address) external view returns (uint256)",
  "function symbol() external view returns (string)",
  "function decimals() external view returns (uint8)",
]);

export const STAKING_ABI = parseAbi([
  "function isStaker(address) external view returns (bool)",
  "function stakedCount(address) external view returns (uint256)",
]);
