require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

module.exports = {
  solidity: "0.8.24",
  networks: {
    megaeth: {
      url: "https://mainnet.megaeth.com/rpc",
      chainId: 4326,
      accounts: [process.env.PRIVATE_KEY],
    },
  },
};
