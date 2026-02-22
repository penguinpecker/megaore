require("@nomicfoundation/hardhat-toolbox");
require("@nomicfoundation/hardhat-verify");
module.exports = {
  solidity: {
    compilers: [
      {
        version: "0.8.24",
        settings: { evmVersion: "paris", optimizer: { enabled: true, runs: 200 } },
      },
      {
        version: "0.8.20",
        settings: { evmVersion: "paris", optimizer: { enabled: true, runs: 200 } },
      },
    ],
  },
  networks: {
    megaeth: {
      url: "https://mainnet.megaeth.com/rpc",
      accounts: [process.env.PRIVATE_KEY],
      chainId: 4326,
    },
  },
  etherscan: {
    apiKey: "XNXYMW93UUJ63I912GZPEERNNUI1JP9J6Y",
    customChains: [
      {
        network: "megaeth",
        chainId: 4326,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api?chainid=4326",
          browserURL: "https://mega.etherscan.io",
        },
      },
    ],
  },
};
