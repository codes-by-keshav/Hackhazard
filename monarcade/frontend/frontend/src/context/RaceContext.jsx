// src\context\RaceContext.js
import { createContext, useContext, useState, useEffect } from 'react';
import { ethers } from 'ethers';

const RaceContext = createContext();

export const useRaceContext = () => useContext(RaceContext);

export const RaceProvider = ({ children }) => {
  // User state
  const [walletAddress, setWalletAddress] = useState('');
  const [balance, setBalance] = useState('0');
  
  // Room state
  const [roomCode, setRoomCode] = useState('');
  const [players, setPlayers] = useState([]);
  const [isHost, setIsHost] = useState(false);
  const [stakeAmount, setStakeAmount] = useState('0');
  const [isReady, setIsReady] = useState(false);
  const [allPlayersReady, setAllPlayersReady] = useState(false);
  
  // Game state
  const [gameStarted, setGameStarted] = useState(false);
  const [gameEnded, setGameEnded] = useState(false);
  const [winner, setWinner] = useState(null);
  const [currentLap, setCurrentLap] = useState(0);
  const [totalLaps] = useState(3);
  
  // Contract interaction
  const [contract, setContract] = useState(null);
  const contractAddress = '0x0dfFacfEB3B20a64A90EdD175494367c6Ce1e866';
  const contractABI = [
    "function createGame(bytes32 gameId, address[] calldata players, uint256 stakeAmount) external",
    "function stake(bytes32 gameId) external payable",
    "function submitResult(bytes32 gameId, address winner, bytes[] calldata signatures) external",
    "function getGamePlayers(bytes32 gameId) external view returns (address[])",
    "function hasPlayerStaked(bytes32 gameId, address player) external view returns (bool)",
    "function getGameStatus(bytes32 gameId) external view returns (uint8)"
  ];

  // Connect wallet
  const connectWallet = async () => {
    if (window.ethereum) {
      try {
        const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
        if (accounts.length > 0) {
          setWalletAddress(accounts[0]);
          await fetchBalance(accounts[0]);
          initializeContract();
        }
      } catch (error) {
        console.error("Error connecting wallet:", error);
      }
    }
  };

  // Initialize contract
  const initializeContract = async () => {
    try {
      let provider;
      try {
        provider = new ethers.BrowserProvider(window.ethereum);
      } catch (error) {
        provider = new ethers.providers.Web3Provider(window.ethereum);
      }
      
      const signer = await provider.getSigner();
      const gameContract = new ethers.Contract(contractAddress, contractABI, signer);
      setContract(gameContract);
    } catch (error) {
      console.error("Error initializing contract:", error);
    }
  };
  const addBotPlayer = () => {
    const botAddress = `0xBot${Math.floor(Math.random() * 1000000).toString().padStart(6, '0')}`;
    const botColor = getRandomNeonColor();
    
    setPlayers(prev => [
      ...prev, 
      { 
        address: botAddress, 
        ready: true, 
        color: botColor, 
        isBot: true 
      }
    ]);
  };

  // Fetch balance
  const fetchBalance = async (address) => {
    try {
      if (!address || !window.ethereum) return;
      
      let provider;
      try {
        provider = new ethers.BrowserProvider(window.ethereum);
      } catch (error) {
        provider = new ethers.providers.Web3Provider(window.ethereum);
      }
      
      const rawBalance = await provider.getBalance(address);
      
      let formattedBalance;
      if (typeof ethers.formatEther === 'function') {
        formattedBalance = ethers.formatEther(rawBalance);
      } else {
        formattedBalance = ethers.utils.formatUnits(rawBalance, 18);
      }
      
      setBalance(parseFloat(formattedBalance).toFixed(4));
    } catch (error) {
      console.error("Error fetching balance:", error);
      setBalance("0.0000");
    }
  };

  // Create a new room
  const createRoom = () => {
    const newRoomCode = Math.floor(100000 + Math.random() * 900000).toString();
    setRoomCode(newRoomCode);
    setIsHost(true);
    setPlayers([{ address: walletAddress, ready: false, color: getRandomNeonColor() }]);
    return newRoomCode;
  };

  // Join an existing room
  const joinRoom = (code) => {
    setRoomCode(code);
    setIsHost(false);
    // In a real app, you would fetch players from a backend
    setPlayers(prev => [...prev, { address: walletAddress, ready: false, color: getRandomNeonColor() }]);
  };

  // Set stake amount
  const setPlayerStake = (amount) => {
    setStakeAmount(amount);
  };

  // Set player ready status
  const setPlayerReady = (ready) => {
    setIsReady(ready);
    setPlayers(prev => 
      prev.map(player => 
        player.address === walletAddress 
          ? { ...player, ready } 
          : player
      )
    );
    
    // Check if all players are ready
    const allReady = players.every(player => player.ready);
    setAllPlayersReady(allReady);
    
    if (allReady && isHost) {
      startGame();
    }
  };

  // Start the game
  const startGame = async () => {
    try {
    //   if (isHost && contract) {
    //     // Create game on blockchain
    //     const gameId = ethers.utils.id(roomCode);
    //     const playerAddresses = players.map(p => p.address);
    //     const stakeAmountWei = ethers.utils.parseEther(stakeAmount);
        
    //     await contract.createGame(gameId, playerAddresses, stakeAmountWei);
        
    //     // Stake tokens
    //     await contract.stake(gameId, { value: stakeAmountWei });
    //   } else if (contract) {
    //     // Non-host players stake
    //     const gameId = ethers.utils.id(roomCode);
    //     const stakeAmountWei = ethers.utils.parseEther(stakeAmount);
    //     await contract.stake(gameId, { value: stakeAmountWei });
    //   }
      
    //   setGameStarted(true);
    // } catch (error) {
    //   console.error("Error starting game:", error);
    // }
    setPlayers(prev => 
        prev.map(player => 
          player.isBot ? { ...player, ready: true } : player
        )
      );
      
      // Set all players ready for testing
      setAllPlayersReady(true);
      
      // Start the game
      setGameStarted(true);
    } catch (error) {
      console.error("Error starting game:", error);
    }
  };

  // End the game and distribute rewards
  const endGame = async (winnerAddress) => {
    try {
      setWinner(winnerAddress);
      setGameEnded(true);
      
      if (contract) {
        const gameId = ethers.utils.id(roomCode);
        // In a real app, you would collect signatures from all players
        // This is simplified for demo purposes
        await contract.submitResult(gameId, winnerAddress, []);
      }
    } catch (error) {
      console.error("Error ending game:", error);
    }
  };

  // Reset game state for a new race
  const resetGame = () => {
    setGameStarted(false);
    setGameEnded(false);
    setWinner(null);
    setCurrentLap(0);
    setIsReady(false);
    setPlayers(prev => prev.map(player => ({ ...player, ready: false })));
    setAllPlayersReady(false);
  };

  // Helper function to get random neon color
  const getRandomNeonColor = () => {
    const neonColors = [
      '#ff00ff', // Magenta
      '#00ffff', // Cyan
      '#ff3300', // Orange
      '#33ff00', // Lime
      '#ff0099', // Pink
      '#00ff99', // Spring Green
      '#9900ff', // Purple
      '#ffff00', // Yellow
      '#2222f7', // Blue
      '#bd2046', // maroon

    ];
    return neonColors[Math.floor(Math.random() * neonColors.length)];
  };

  // Check wallet connection on component mount
  useEffect(() => {
    const checkWalletConnection = async () => {
      if (window.ethereum) {
        try {
          const accounts = await window.ethereum.request({ method: "eth_accounts" });
          if (accounts.length > 0) {
            setWalletAddress(accounts[0]);
            await fetchBalance(accounts[0]);
            initializeContract();
          }
        } catch (error) {
          console.error("Error checking wallet connection:", error);
        }
      }
    };

    checkWalletConnection();
  }, []);

  const value = {
    walletAddress,
    balance,
    roomCode,
    players,
    isHost,
    stakeAmount,
    isReady,
    allPlayersReady,
    gameStarted,
    gameEnded,
    winner,
    currentLap,
    totalLaps,
    connectWallet,
    createRoom,
    joinRoom,
    setPlayerStake,
    setPlayerReady,
    startGame,
    endGame,
    resetGame,
    setCurrentLap,
    addBotPlayer,
  
  };

  return (
    <RaceContext.Provider value={value}>
      {children}
    </RaceContext.Provider>
  );
};
