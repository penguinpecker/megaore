require("dotenv").config();
require("@nomicfoundation/hardhat-toolbox");

module.exports = {
  solidity: {
    version: "0.8.24",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    megaeth: {
      url: process.env.MEGAETH_RPC_URL || "https://mainnet.megaeth.com/rpc",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 4326,
    },
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY || "XNXYMW93UUJ63I912GZPEERNNUI1JP9J6Y",
    customChains: [
      {
        network: "megaeth",
        chainId: 4326,
        urls: {
          apiURL: "https://api.mega.etherscan.io/api",
          browserURL: "https://mega.etherscan.io",
        },
      },
    ],
  },
};
