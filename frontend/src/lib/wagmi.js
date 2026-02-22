import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { defineChain } from "viem";
import { cookieStorage, createStorage } from "wagmi";

export const projectId = process.env.NEXT_PUBLIC_PROJECT_ID || "ceeac0ac1dcd7ab6ec62bd574c219ac7";

export const megaethChain = defineChain({
  id: 4326,
  name: "MegaETH",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://megaeth.drpc.org", "https://mainnet.megaeth.com/rpc"] },
  },
  blockExplorers: {
    default: { name: "MegaETH Explorer", url: "https://megaethscan.io" },
  },
});

export const wagmiAdapter = new WagmiAdapter({
  storage: createStorage({ storage: cookieStorage }),
  ssr: true,
  networks: [megaethChain],
  projectId,
});

export const config = wagmiAdapter.wagmiConfig;
