require('dotenv').config();
const { ethers } = require("ethers");

(async () => {
  try {
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    const net = await provider.getNetwork();
    console.log("Connected to:", net);
  } catch (err) {
    console.error("Connection failed:", err.message);
  }
})();