const hre = require("hardhat");

async function main() {
  try {
    // Since MON is the native currency, we don't need a token address
    // We'll need to modify the contract to accept native currency instead
    
    // You can use your own wallet address as the fee collector
    const FEE_COLLECTOR_ADDRESS = "0xc98191d92aea5F09290F8240Fb98ED9cdB82B609";

    console.log("Getting signers...");
    const [deployer] = await hre.ethers.getSigners();
    console.log(`Deploying MONarcade with account: ${deployer.address}`);
    console.log(`Account balance: ${ethers.utils.formatEther(await deployer.getBalance())} MON`);

    console.log("Getting contract factory...");
    const MONarcade = await hre.ethers.getContractFactory("MONarcade");
    
    console.log("Deploying MONarcade...");
    // Deploy with fee collector only, no token address needed
    const contract = await MONarcade.deploy(FEE_COLLECTOR_ADDRESS);
    
    console.log("Waiting for deployment to complete...");
    await contract.deployed();
    
    console.log(`MONarcade deployed to: ${contract.address}`);
  } catch (error) {
    console.error("Deployment error details:", error);
    throw error;
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
  });


// MONarcade deployed to: 0x0dfFacfEB3B20a64A90EdD175494367c6Ce1e866