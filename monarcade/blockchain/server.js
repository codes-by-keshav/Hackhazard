// server.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables with explicit path
dotenv.config({ path: path.resolve(__dirname, '.env') });

const { ethers } = require('ethers');

const app = express();
app.use(cors());
app.use(express.json());

// Debug environment variables
console.log('Environment variables loaded:', {
  RPC_URL: process.env.RPC_URL || 'NOT DEFINED',
  NODE_ENV: process.env.NODE_ENV || 'NOT DEFINED'
});

// Add a simple test route
app.get('/', (req, res) => {
  res.json({ message: 'Server is running' });
});

app.get('/network-info', async (req, res) => {
  try {
    if (!process.env.RPC_URL) {
      // If RPC_URL is still not available, use a hardcoded fallback
      console.log('RPC_URL not found in environment, using fallback');
      process.env.RPC_URL = 'https://testnet-rpc.monad.xyz';
    }

    console.log('Using RPC URL:', process.env.RPC_URL);

    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    console.log('Provider created');

    const network = await provider.getNetwork();
    console.log('Network info retrieved:', network);

    // Convert the network object to a plain object with BigInt values converted to strings
    const networkData = {
      chainId: network.chainId.toString(),
      name: network.name,
    };

    res.json(networkData);
  } catch (err) {
    console.error('Error details:', err);
    res.status(500).json({ 
      error: 'Failed to fetch network info', 
      details: err.message 
    });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
