const hre = require("hardhat");

async function main() {
  try {
    console.log("Getting signers...");
    const [deployer] = await hre.ethers.getSigners();
    
    if (!deployer) {
      throw new Error("No deployer account found. Check your network configuration and private key.");
    }
    
    console.log(`Deploying MON token with account: ${deployer.address}`);
    console.log(`Account balance: ${ethers.utils.formatEther(await deployer.getBalance())} ETH`);

    // Get the contract factory
    console.log("Getting contract factory...");
    const MONToken = await hre.ethers.getContractFactory("MONToken");
    
    // Deploy the contract
    console.log("Deploying MONToken...");
    const token = await MONToken.deploy();
    
    // Wait for deployment to complete
    console.log("Waiting for deployment to complete...");
    await token.deployed();
    
    console.log(`MON token deployed to: ${token.address}`);
  } catch (error) {
    console.error("Deployment error details:", error);
    throw error;
  }
}

// Execute the deployment
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Token deployment failed:", error);
    process.exit(1);
  });
