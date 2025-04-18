require("@nomiclabs/hardhat-ethers");
require("dotenv").config();

const PRIVATE_KEY = process.env.PRIVATE_KEY || "767d80a6ab17b74317685c50190e33fec1374432b26297a36f748e054cf81e30";

if (!PRIVATE_KEY) {
  console.error("ERROR: PRIVATE_KEY is not set in .env file");
}

module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      },
      viaIR: true
    }
  },
  networks: {
    monad_testnet: {
      url: "https://testnet-rpc.monad.xyz",
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      chainId: 10143
    }
  },
  paths: {
    sources: "./contracts",
    artifacts: "./artifacts"
  }
};
