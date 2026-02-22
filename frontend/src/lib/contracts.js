import { parseAbi } from "viem";

export const CONTRACTS = {
  oreToken: "0xf06859C5A8028f957BEcA3b176510f6E00e68a26",
  nftStaking: "0x0BBb89e2A710c96D3459b43d87653446320AaCc8",
  oreTreasury: "0xD6f1c0b5C4ECFF143070060bC92aef61Ab51332A",
  oreGrid: "0x23D682B07fFADf6F772E6A2310bD882E5B23982f",
};

export const GRID_ABI = parseAbi([
  "function joinRound(uint8 cell) external payable",
  "function resolveRound() external",
  "function currentRoundId() view returns (uint256)",
  "function rounds(uint256) view returns (uint64,uint64,uint256,uint16,uint8,bool,bool)",
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
