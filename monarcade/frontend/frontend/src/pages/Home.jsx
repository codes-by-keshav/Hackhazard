import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
// import { ToastContainer, toast } from 'react-toastify';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const Navbar = ({ userAddress, balance }) => (
  <div className="flex items-center justify-between p-4 bg-zinc-900/80 backdrop-blur-sm text-white font-arcade shadow-lg z-10 relative">
    <div className="text-4xl ml-2">MONarcade</div>
    {userAddress && (
      <div className="text-sm font-exo">
        {balance} MON
      </div>
    )}
  </div>
);

const GameCard = ({ title, description, icon, link, isWalletConnected, onCardClick }) => {
  const handleClick = (e) => {
    if (!isWalletConnected) {
      e.preventDefault();
      onCardClick();
    }
  };

  return (
    <motion.div
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.95 }}
      className="cursor-pointer p-4 m-4 bg-[#000016]/80 backdrop-blur-sm rounded-2xl border-4 border-[#1efaf3] text-center w-64 hover:shadow-2xl transition"
    >
      <Link to={link} onClick={handleClick}>
        <img src={icon} alt={title} className="mx-auto mb-2" />
        <div className="font-bold font-display text-[#1efaf3] text-2xl mb-1">{title}</div>
        <motion.div
          initial={{ opacity: 0.7 }}
          whileHover={{ opacity: 1 }}
          className="text-sm font-exo text-[#e55a32]"
        >
          {description}
        </motion.div>
      </Link>
    </motion.div>
  );
};

// Modal component for wallet disconnection
const DisconnectModal = ({ isOpen, onClose, onDisconnect }) => {
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-[#0f0f1a] border-2 border-[#1efaf3] rounded-lg p-6 max-w-sm w-full mx-4">
        <h3 className="text-xl font-body text-[#1efaf3] mb-4">Disconnect Wallet</h3>
        <p className="text-white font-body mb-6">Are you sure you want to disconnect your wallet?</p>
        <div className="flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600 transition"
          >
            Cancel
          </button>
          <button
            onClick={onDisconnect}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition"
          >
            Disconnect
          </button>
        </div>
      </div>
    </div>
  );
};

export default function HomePage() {
  const [walletAddress, setWalletAddress] = useState("");
  const [balance, setBalance] = useState("0");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isWalletDisconnected, setIsWalletDisconnected] = useState(false);

  // Function to fetch token balance
  const fetchBalance = async (address) => {
    try {
      if (!address || !window.ethereum) return;
      
      // Create provider based on ethers version
      let provider;
      try {
        provider = new ethers.BrowserProvider(window.ethereum);
      } catch (error) {
        provider = new ethers.providers.Web3Provider(window.ethereum);
      }
      
      // Get native MON balance
      const rawBalance = await provider.getBalance(address);
      
      // Format the balance correctly based on ethers version
      let formattedBalance;
      if (typeof ethers.formatEther === 'function') {
        // ethers v6
        formattedBalance = ethers.formatEther(rawBalance);
      } else {
        // ethers v5
        formattedBalance = ethers.utils.formatUnits(rawBalance, 18); // Native tokens typically have 18 decimals
      }
      
      // Display the exact balance with 4 decimal places for better precision with small amounts
      setBalance(parseFloat(formattedBalance).toFixed(4));
    } catch (error) {
      console.error("Error fetching balance:", error);
      console.error("Error details:", error.message);
      setBalance("0.0000");
    }
  };

  // Connect wallet function
  const connectWallet = async () => {
    console.log("Connect Wallet button clicked."); // Log 1: Button clicked

    if (walletAddress) {
      console.log("Wallet already connected, opening disconnect modal."); // Log 2a: Already connected
      setIsModalOpen(true);
      return;
    }

    console.log("Checking for window.ethereum..."); // Log 2b: Checking for provider
    if (window.ethereum) {
      console.log("window.ethereum detected."); // Log 3: Provider detected
      try {
        console.log("Requesting accounts via eth_requestAccounts..."); // Log 4: Requesting accounts
        const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
        console.log("Accounts received:", accounts); // Log 5: Accounts received

        if (accounts.length > 0) {
          console.log("Setting wallet address:", accounts[0]); // Log 6: Setting address
          setWalletAddress(accounts[0]);
          setIsWalletDisconnected(false);
          localStorage.removeItem('walletDisconnected');
          await fetchBalance(accounts[0]);
          toast.success("Wallet connected successfully!");
        } else {
           console.log("No accounts returned from request."); // Log 7: No accounts
           toast.warn("No accounts found. Please ensure your wallet is unlocked and accessible.");
        }
      } catch (error) {
        console.error("Error connecting wallet:", error); // Log 8: Error caught
        toast.error(`Failed to connect wallet: ${error.message || 'Unknown error'}`);
      }
    } else {
      console.log("window.ethereum not detected."); // Log 9: Provider not detected
      toast.error("No Ethereum wallet detected. Please install MetaMask.");
    }
  };

  // Disconnect wallet function
  const disconnectWallet = () => {
    setWalletAddress("");
    setBalance("0");
    setIsModalOpen(false);
    setIsWalletDisconnected(true);
    
    // Store disconnection state in localStorage
    localStorage.setItem('walletDisconnected', 'true');
    
    // Remove event listeners
    if (window.ethereum && window.ethereum.removeListener) {
      window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
    }
    
    toast.info("Wallet disconnected successfully");
  };

  // Handle account changes
  const handleAccountsChanged = async (accounts) => {
    if (accounts.length === 0) {
      // User disconnected their wallet
      setWalletAddress("");
      setBalance("0");
      toast.info("Wallet disconnected");
    } else if (accounts[0] !== walletAddress) {
      // User switched accounts
      setWalletAddress(accounts[0]);
      await fetchBalance(accounts[0]);
      toast.info("Wallet account changed");
    }
  };

  // Check if wallet is already connected on component mount
  useEffect(() => {
    const checkWalletConnection = async () => {
      // Check if user manually disconnected previously
      const wasDisconnected = localStorage.getItem('walletDisconnected') === 'true';
      setIsWalletDisconnected(wasDisconnected);
      
      if (window.ethereum && !wasDisconnected) {
        try {
          const accounts = await window.ethereum.request({ method: "eth_accounts" });
          if (accounts.length > 0) {
            setWalletAddress(accounts[0]);
            await fetchBalance(accounts[0]);
          }
          
          // Set up event listener for account changes
          window.ethereum.on('accountsChanged', handleAccountsChanged);
        } catch (error) {
          console.error("Error checking wallet connection:", error);
        }
      }
    };

    checkWalletConnection();

    // Cleanup event listener on component unmount
    return () => {
      if (window.ethereum && window.ethereum.removeListener) {
        window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
      }
    };
  }, []);

  // Handle game card click when wallet is not connected
  const handleGameCardClick = () => {
    toast.warning("Please connect your wallet before playing games!", {
      position: "top-center",
      autoClose: 3000,
    });
  };

  return (
    <div 
      className="min-h-screen relative overflow-hidden"
      style={{
        backgroundImage: `
          radial-gradient(circle at 50% 50%, rgba(41, 209, 255, 0.3) 0%, transparent 30%),
          radial-gradient(circle at 0% 0%, transparent 50%, rgba(255, 0, 255, 0.05) 50%, rgba(255, 0, 255, 0.1) 56%, transparent 56%),
          radial-gradient(circle at 100% 100%, transparent 50%, rgba(0, 255, 255, 0.05) 50%, rgba(0, 255, 255, 0.1) 56%, transparent 56%)
        `,
        backgroundColor: '#0f0f1a',
        backgroundSize: '100% 100%, 50px 50px, 50px 50px',
        backgroundPosition: 'center center, 0 0, 0 0',
        animation: 'backgroundShift 20s ease infinite'
      }}
    >
      <Navbar userAddress={walletAddress} balance={balance} />

      <div className="text-center mt-10 relative z-10">
        <button 
          className={`text-2xl font-display w-64 p-4 rounded-full font-bold shadow-[0_0_15px_rgba(0,239,242,0.7)] transition ${
            walletAddress 
              ? "bg-[#ff3e9d] hover:bg-[#e02e7c] text-white" 
              : "bg-[#00eff2] hover:bg-[#00c7cc] text-black"
          }`}
          onClick={connectWallet}
        >
          {walletAddress ? "Wallet Connected" : "Connect Wallet"}
        </button>
      </div>

      <div className="flex flex-wrap font-body justify-center mt-12 relative z-10">
        <GameCard
          title="Car Racing"
          description="Dodge and race on neon tracks."
          icon="/icons/car.jpeg"
          link="/race"
          isWalletConnected={!!walletAddress}
          onCardClick={handleGameCardClick}
        />
        <GameCard
          title="MonadUNO"
          description="Engaging UNO-inspired card game."
          icon="/icons/uno.jpeg"
          link="/monaduno"
          isWalletConnected={!!walletAddress}
          onCardClick={handleGameCardClick}
        />
        <GameCard
          title="Bluff"
          description="Bluff your way to victory."
          icon="/icons/bluff.jpeg"
          link="/bluff"
          isWalletConnected={!!walletAddress}
          onCardClick={handleGameCardClick}
        />
      </div>
      
      {/* Disconnect Modal */}
      <DisconnectModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onDisconnect={disconnectWallet}
      />
      
      {/* Toast container for notifications */}
      {/* <ToastContainer position="top-center" autoClose={3000} /> */}
    </div>
  );
}