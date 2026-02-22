import type { Chain } from "compose";

// MegaETH Mainnet
export const MEGAETH_MAINNET: Chain = {
  id: 4326,
  name: "MegaETH",
  testnet: false,
  nativeCurrency: {
    name: "Ether",
    symbol: "ETH",
    decimals: 18,
  },
  rpcUrls: {
    public: { http: ["https://mainnet.megaeth.com/rpc"] },
    default: { http: ["https://mainnet.megaeth.com/rpc"] },
  },
};

// REPLACE after deploy
export const CONTRACT_ADDRESS = "0x23D682B07fFADf6F772E6A2310bD882E5B23982f" as const;

export const WALLET_NAMES = {
  FULFILLER: "fulfiller",
} as const;

export const CONTRACT_FUNCTIONS = {
  FULFILL_RANDOMNESS:
    "function fulfillRandomness(uint256 requestId, bytes32 randomness, uint64 drandRound, bytes calldata signature)" as const,
} as const;
