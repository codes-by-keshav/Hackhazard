import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { ethers } from 'ethers';
import { toast } from 'react-toastify';
import {
    createGameRoom, joinGameRoom, updatePlayerData, updateGameData,
    subscribeToRoom, leaveGameRoom, setupDisconnect, checkRoomExists
} from '../services/firebase';

// --- Helper Functions (Outside Component) ---
const generateGameId = (roomCode) => {
    const salt = Math.random().toString(36).substring(2, 15);
    const data = `${roomCode}-${Date.now()}-${salt}`;
    // Use ethers v6 or v5 id function
    return typeof ethers.id === 'function' ? ethers.id(data) : ethers.utils.id(data);
};

const getRandomNeonColor = () => {
    const neonColors = [
        '#ff00ff', '#00ffff', '#ff3300', '#33ff00', '#ff0099',
        '#00ff99', '#9900ff', '#ffff00', '#2222f7', '#bd2046',
    ];
    return neonColors[Math.floor(Math.random() * neonColors.length)];
};

// --- Constants ---
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 10; // Match contract if needed
const CONTRACT_ADDRESS = '0x0dfFacfEB3B20a64A90EdD175494367c6Ce1e866'; // Your deployed contract address
const CONTRACT_ABI = [ // Replace with your actual ABI
    "event GameCreated(bytes32 indexed gameId, address[] players, uint256 stakeAmount, uint256 expiresAt)",
    "event PlayerStaked(bytes32 indexed gameId, address indexed player, uint256 amount)",
    "event GameResultSubmitted(bytes32 indexed gameId, address indexed winner, uint256 reward)",
    "event GameCancelled(bytes32 indexed gameId, string reason)",
    "function createGame(bytes32 gameId, address[] calldata players, uint256 stakeAmount) external",
    "function stake(bytes32 gameId) external payable",
    "function submitResult(bytes32 gameId, address winner, bytes[] calldata signatures) external",
    "function cancelGame(bytes32 gameId) external",
    "function getGamePlayers(bytes32 gameId) external view returns (address[])",
    "function hasPlayerStaked(bytes32 gameId, address player) external view returns (bool)",
    "function getGameStatus(bytes32 gameId) external view returns (uint8)", // Assuming GameStatus enum maps 0-3
    "function getTotalStaked(bytes32 gameId) external view returns (uint256)",
    "function getPlayerStake(bytes32 gameId, address player) external view returns (uint256)",
    "function getGameExpiration(bytes32 gameId) external view returns (uint256)",
    "function games(bytes32 gameId) external view returns (uint8 status, uint256 totalStaked, uint256 requiredStake, uint256 createdAt, uint256 expiresAt)" // Adjust based on exact struct order/types
];

// --- Context Definition ---
const RaceContext = createContext();
export const useRaceContext = () => useContext(RaceContext);

// --- Provider Component ---
export const RaceProvider = ({ children }) => {
    // --- State Definitions ---
    const [walletAddress, setWalletAddress] = useState('');
    const [balance, setBalance] = useState('0');
    const [signer, setSigner] = useState(null);
    const [contract, setContract] = useState(null);
    const [roomCode, setRoomCode] = useState('');
    const [players, setPlayers] = useState([]); // { address, ready, color, isBot, hasStakedLocally, signature }
    const [isHost, setIsHost] = useState(false);
    const [stakeAmount, setStakeAmount] = useState('0');
    const [isReady, setIsReady] = useState(false);
    const [hasStakedLocally, setHasStakedLocally] = useState(false); // <-- Add this line
    const [gameId, setGameId] = useState(null);
    const [gameContractTimestamp, setGameContractTimestamp] = useState(null);
    const [onChainGameStatus, setOnChainGameStatus] = useState(0); // 0: NonExistent, 1: Created, 2: InProgress, 3: Completed
    const [gameStarted, setGameStarted] = useState(false);
    const [gameEnded, setGameEnded] = useState(false);
    const [winner, setWinner] = useState(null); // Stores winner's address
    const [currentLap, setCurrentLap] = useState(0);
    const [totalLaps] = useState(3);
    const [isProcessing, setIsProcessing] = useState(false);
    const [connectionState, setConnectionState] = useState('disconnected');
    const [isConnecting, setIsConnecting] = useState(false);

    // --- Refs ---
    const roomSubscriptionRef = useRef(null);
    const previousPlayerCountRef = useRef(0); // Ref to store previous player count



    // --- Refs for Functions (to break dependency cycle) ---
    const checkAllPlayersStakedRef = useRef(null);
    const callStakeRef = useRef(null);
    const checkAndSubmitResultRef = useRef(null);
    const resetGameLocallyRef = useRef(null);
    const disconnectRoomRef = useRef(null);

    // --- Callbacks Definition ---

    // 1. Core Utilities & State Resets
    const resetGameLocally = useCallback((newGameId) => {
        console.log("Local game state reset for new game ID:", newGameId);
        setGameStarted(false);
        setGameEnded(false);
        setWinner(null);
        setCurrentLap(0);
        setIsReady(false); // Player needs to ready up again
        setPlayers(prev => prev.map(player => ({
            ...player,
            ready: player.isBot ? true : false, // Bots are always ready
            hasStakedLocally: false,
            signature: null
        })));
        setOnChainGameStatus(0); // Reset contract status assumption
        setGameId(newGameId); // Set the new game ID
        setGameContractTimestamp(null);
        setIsProcessing(false);
    }, []);
    useEffect(() => { resetGameLocallyRef.current = resetGameLocally; }, [resetGameLocally]);

    const handleRoomUpdate = useCallback((roomData) => {
        console.log(`%c RaceContext: handleRoomUpdate MINIMAL START - Raw Data:`, 'color: red; font-weight: bold;', roomData);

        if (!roomData || !roomData.players) {
            console.warn("RaceContext MINIMAL: No room data or no players node. Setting players to [].");
            setPlayers([]);
            console.log(`%c RaceContext MINIMAL: setPlayers([]) call completed.`, 'color: red;');
        } else {
            const playersArray = Object.entries(roomData.players).map(([addr, data]) => ({
                address: addr,
                ...data
            }));
            console.log(`%c RaceContext MINIMAL: Calling setPlayers with:`, 'color: red; font-weight: bold;', playersArray);
            setPlayers(playersArray); // ONLY set players
            console.log(`%c RaceContext MINIMAL: setPlayers call completed.`, 'color: red;');
        }
        console.log(`%c RaceContext: handleRoomUpdate MINIMAL END`, 'color: red; font-weight: bold;');

    // Minimal dependencies for this test: only setPlayers
    }, [setPlayers]); // Temporarily reduce dependencies drastically for testing

    // IMPORTANT: Remember to restore the original handleRoomUpdate and its dependencies after this test!

    // 2. Room Disconnection & Cleanup
    // 2. Room Disconnection & Cleanup
    const disconnectRoom = useCallback(async () => {
        console.log("Disconnecting from room...");
        const currentRoomCode = roomCodeRef.current; // Use a ref to get current room code reliably
        const currentWalletAddress = walletAddressRef.current; // Use a ref

        // Unsubscribe FIRST
        if (roomSubscriptionRef.current) {
            console.log("Unsubscribing Firebase listener.");
            roomSubscriptionRef.current(); // Call the unsubscribe function
            roomSubscriptionRef.current = null;
        } else {
             console.log("No active Firebase subscription to unsubscribe.");
        }

        // If in a room, remove player from Firebase
        if (currentRoomCode && currentWalletAddress) {
            try {
                console.log(`Leaving Firebase room ${currentRoomCode} for ${currentWalletAddress}`);
                await leaveGameRoom(currentRoomCode, currentWalletAddress);
            } catch (err) {
                console.error("Error leaving room:", err);
            }
        } else {
             console.log("Not in a room or no wallet address, skipping Firebase leave.");
        }

        // Reset state
        console.log("Resetting local state after disconnect.");
        setPlayers([]);
        setRoomCode('');
        setIsHost(false);
        setGameId(null);
        setGameStarted(false);
        setGameEnded(false);
        setWinner(null);
        setIsReady(false);
        setHasStakedLocally(false); // Reset local stake status
        setOnChainGameStatus(0);
        setGameContractTimestamp(null);
        setIsProcessing(false);
        setConnectionState('disconnected');

        console.log("Room disconnected and state reset complete.");
        return true;
    // Use refs for values needed only during disconnect to avoid extra dependencies
    }, [/* Keep dependencies minimal, rely on refs for disconnect values */]);
    // Use refs to store values needed only for cleanup, avoiding dependency loops
    const roomCodeRef = useRef(roomCode);
    const walletAddressRef = useRef(walletAddress);
    useEffect(() => { roomCodeRef.current = roomCode; }, [roomCode]);
    useEffect(() => { walletAddressRef.current = walletAddress; }, [walletAddress]);
    useEffect(() => { disconnectRoomRef.current = disconnectRoom; }, [disconnectRoom]);

    const disconnectWallet = useCallback(async () => {
        console.log("Disconnecting wallet...");
        // Disconnect from the room first if connected
        await disconnectRoomRef.current?.();

        // Reset wallet-related state
        setWalletAddress('');
        setBalance('0');
        setSigner(null);
        setContract(null);

        // Optionally clear provider state if needed (e.g., disconnect from MetaMask)
        // This depends on how you want to handle full wallet disconnection vs. just clearing app state
        // For now, just clearing app state and marking as disconnected locally
        localStorage.setItem('walletDisconnected', 'true'); // Mark as manually disconnected
        toast.info("Wallet disconnected.");
    }, []);

    // 3. Wallet & Contract Initialization
    const fetchBalance = useCallback(async (address, provider) => {
        if (!address || !provider) return;
        try {
            const rawBalance = await provider.getBalance(address);
            const formattedBalance = typeof ethers.formatEther === 'function'
                ? ethers.formatEther(rawBalance)
                : ethers.utils.formatUnits(rawBalance, 18);
            setBalance(parseFloat(formattedBalance).toFixed(4));
        } catch (error) {
            console.error("Error fetching balance:", error);
            setBalance("0.0000");
        }
    }, []);

    const initializeContract = useCallback((currentSigner) => {
        if (!currentSigner) {
            setContract(null);
            return;
        }
        try {
            const connectedContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, currentSigner);
            setContract(connectedContract);
            console.log("Contract initialized:", CONTRACT_ADDRESS);
        } catch (error) {
            console.error("Error initializing contract:", error);
            setContract(null);
            toast.error("Failed to initialize game contract.");
        }
    }, []);

    const connectWallet = useCallback(async () => {
        console.log("Attempting to connect wallet...");
        if (!window.ethereum) {
            toast.error("No Ethereum wallet detected. Please install MetaMask.");
            return;
        }
        try {
            const provider = typeof ethers.BrowserProvider === 'function'
                ? new ethers.BrowserProvider(window.ethereum)
                : new ethers.providers.Web3Provider(window.ethereum);

            const accounts = await provider.send("eth_requestAccounts", []);
            if (accounts.length > 0) {
                const currentAddress = accounts[0];
                const currentSigner = await provider.getSigner();

                setWalletAddress(currentAddress);
                setSigner(currentSigner);
                await fetchBalance(currentAddress, provider);
                initializeContract(currentSigner);

                localStorage.removeItem('walletDisconnected');
                toast.success("Wallet connected!");
                console.log("Wallet connected:", currentAddress);
            } else {
                toast.warn("No accounts found.");
            }
        } catch (error) {
            console.error("Error connecting wallet:", error);
            toast.error(`Wallet connection failed: ${error.message || 'Unknown error'}`);
            setWalletAddress('');
            setSigner(null);
            setContract(null);
            setBalance('0');
        }
    }, [fetchBalance, initializeContract]);

    // 4. Contract Interaction Callbacks
    const checkAndSubmitResult = useCallback(async () => {
        const winnerPlayer = players.find(p => p.address === winner);
        if (!winnerPlayer || walletAddress !== winner || !contract || isProcessing || onChainGameStatus !== 2) {
            console.log("Conditions not met for submitting result:", { winner, walletAddress, contractExists: !!contract, isProcessing, onChainGameStatus });
            return;
        }

        const nonWinners = players.filter(p => p.address !== winner && !p.isBot);
        const collectedSignatures = nonWinners.map(p => p.signature).filter(Boolean);

        console.log(`Checking signatures: Got ${collectedSignatures.length}/${nonWinners.length}`);

        // Ensure we have signatures from ALL non-bot, non-winner players
        if (nonWinners.length > 0 && collectedSignatures.length === nonWinners.length) {
            console.log("All required signatures collected:", collectedSignatures);
            toast.info("All signatures collected. Submitting result...");
            setIsProcessing(true);
            try {
                console.log("Submitting result to contract:", { gameId, winner, collectedSignatures });
                const tx = await contract.submitResult(gameId, winner, collectedSignatures);
                await tx.wait();
                setOnChainGameStatus(3); // Mark as Completed
                toast.success("Result submitted successfully! Winnings distributed.");
                console.log("Result submitted to contract. Tx:", tx.hash);
                if (signer) await fetchBalance(walletAddress, signer.provider);
            } catch (error) {
                console.error("Error submitting result:", error);
                toast.error(`Result submission failed: ${error.reason || error.message || 'Unknown contract error'}`);
            } finally {
                setIsProcessing(false);
            }
        } else if (nonWinners.length === 0) {
            console.log("No non-bot opponents, submitting result without signatures...");
            setIsProcessing(true);
            try {
                const tx = await contract.submitResult(gameId, winner, []);
                await tx.wait();
                setOnChainGameStatus(3);
                toast.success("Result submitted successfully! Winnings distributed.");
                if (signer) await fetchBalance(walletAddress, signer.provider);
            } catch (error) {
                console.error("Error submitting result (no opponents):", error);
                toast.error(`Result submission failed: ${error.reason || error.message || 'Unknown contract error'}`);
            } finally {
                setIsProcessing(false);
            }
        } else {
            console.log(`Waiting for more signatures... Got ${collectedSignatures.length}/${nonWinners.length}`);
        }
    }, [contract, gameId, winner, players, isProcessing, onChainGameStatus, walletAddress, signer, fetchBalance]);
    useEffect(() => { checkAndSubmitResultRef.current = checkAndSubmitResult; }, [checkAndSubmitResult]);

    const checkAllPlayersStaked = useCallback(async () => {
        if (!contract || !isHost || onChainGameStatus !== 1) return;

        console.log("Host: Checking if all players have staked on-chain...");
        try {
            // Alternative: Check local state first for optimization
            const allLocallyStaked = players.every(p => p.hasStakedLocally || p.isBot);
            if (!allLocallyStaked) {
                console.log("Host: Not all players marked as staked locally yet.");
                return;
            }

            // If all seem staked locally, verify with contract status
            const status = await contract.getGameStatus(gameId);
            setOnChainGameStatus(status); // Update local status based on contract

            if (status === 2) { // GameStatus.InProgress
                console.log("Contract confirms: All players staked! Starting race...");
                toast.success("All players ready! Starting race...");

                // Update Firebase with game started state
                if (roomCode) {
                    updateGameData(roomCode, { gameStarted: true }).catch(err => {
                        console.error("Error updating game start state:", err);
                    });
                }

                setGameStarted(true);
            } else {
                console.log("Contract status still 'Created'. Waiting for contract state update or more stakes.");
            }
        } catch (error) {
            console.error("Error checking game status:", error);
            toast.error("Failed to check game status on contract.");
        }
    }, [contract, isHost, gameId, onChainGameStatus, players, roomCode]);
    useEffect(() => { checkAllPlayersStakedRef.current = checkAllPlayersStaked; }, [checkAllPlayersStaked]);

    const callStake = useCallback(async () => {
        if (!contract || isProcessing || onChainGameStatus !== 1 || walletAddress === '' || players.find(p => p.address === walletAddress)?.hasStakedLocally) {
            console.log("Conditions not met for staking:", {
                contractExists: !!contract,
                isProcessing,
                onChainGameStatus,
                walletAddressValid: walletAddress !== '',
                hasStaked: players.find(p => p.address === walletAddress)?.hasStakedLocally
            });
            return;
        }

        let stakeAmountWei;
        try {
            stakeAmountWei = typeof ethers.parseEther === 'function'
                ? ethers.parseEther(stakeAmount || '0')
                : ethers.utils.parseEther(stakeAmount || '0');
        } catch {
            toast.error("Invalid stake amount format.");
            return;
        }

        const isStakeZeroOrLess = (typeof stakeAmountWei === 'bigint') ? stakeAmountWei <= 0n : stakeAmountWei.lte(0);
        if (isStakeZeroOrLess) {
            toast.error("Stake amount must be greater than 0.");
            return;
        }

        setIsProcessing(true);
        toast.info(`Staking ${stakeAmount} MON...`);
        try {
            console.log("Calling contract stake function for game:", gameId, "Amount:", stakeAmountWei.toString());
            const tx = await contract.stake(gameId, { value: stakeAmountWei });
            await tx.wait();

            // Update Firebase that player has staked
            if (roomCode) {
                await updatePlayerData(roomCode, walletAddress, { hasStakedLocally: true });
            }

            toast.success("Successfully staked!");
            console.log("Stake successful for", walletAddress);

            if (isHost) {
                checkAllPlayersStakedRef.current?.();
            }

        } catch (error) {
            console.error("Error staking:", error);
            toast.error(`Staking failed: ${error.reason || error.message || 'Unknown contract error'}`);

            // Revert ready state if stake failed
            setIsReady(false);

            // Update Firebase with ready false
            if (roomCode) {
                updatePlayerData(roomCode, walletAddress, { ready: false }).catch(err => {
                    console.error("Error updating ready state:", err);
                });
            }
        } finally {
            setIsProcessing(false);
        }
    }, [contract, gameId, stakeAmount, isProcessing, onChainGameStatus, walletAddress, players, isHost, roomCode]);
    useEffect(() => { callStakeRef.current = callStake; }, [callStake]);

    const callCreateGame = useCallback(async () => {
        if (!isHost || !contract || isProcessing || onChainGameStatus !== 0) {
            console.log("Conditions not met for creating game:", { isHost, contractExists: !!contract, isProcessing, onChainGameStatus });
            return;
        }
        const playerAddresses = players.filter(p => !p.isBot).map(p => p.address);
        if (playerAddresses.length < MIN_PLAYERS) {
            toast.error(`Need at least ${MIN_PLAYERS} real players to create game on chain.`);
            return;
        }
        if (playerAddresses.length > MAX_PLAYERS) {
            toast.error(`Cannot exceed ${MAX_PLAYERS} real players.`);
            return;
        }

        let stakeAmountWei;
        try {
            stakeAmountWei = typeof ethers.parseEther === 'function'
                ? ethers.parseEther(stakeAmount || '0')
                : ethers.utils.parseEther(stakeAmount || '0');
        } catch {
            toast.error("Invalid stake amount format.");
            return;
        }
        const isStakeZeroOrLess = (typeof stakeAmountWei === 'bigint') ? stakeAmountWei <= 0n : stakeAmountWei.lte(0);
        if (isStakeZeroOrLess) {
            toast.error("Stake amount must be greater than 0.");
            return;
        }

        setIsProcessing(true);
        toast.info("Creating game on blockchain...");
        try {
            console.log("Calling contract createGame:", { gameId, playerAddresses, stakeAmount: stakeAmountWei.toString() });
            const tx = await contract.createGame(gameId, playerAddresses, stakeAmountWei);
            const receipt = await tx.wait();

            // Fetch creation timestamp from contract state
            const gameData = await contract.games(gameId);
            const creationTimestamp = typeof gameData.createdAt === 'bigint' ? Number(gameData.createdAt) : gameData.createdAt.toNumber();

            // Update Firebase game state
            if (roomCode) {
                await updateGameData(roomCode, {
                    onChainGameStatus: 1,
                    gameContractTimestamp: creationTimestamp
                });
            }

            setGameContractTimestamp(creationTimestamp);
            setOnChainGameStatus(1);

            console.log("Game created on chain. Tx:", receipt.transactionHash, "Timestamp:", creationTimestamp);
            toast.success("Game created on blockchain!");

            // If host was already 'Ready', proceed to stake
            if (isReady) {
                await callStakeRef.current?.();
            }

        } catch (error) {
            console.error("Error creating game on contract:", error);
            toast.error(`Failed to create game: ${error.reason || error.message || 'Unknown contract error'}`);
            setOnChainGameStatus(0);
        } finally {
            setIsProcessing(false);
        }
    }, [contract, isHost, players, stakeAmount, gameId, isProcessing, onChainGameStatus, isReady, roomCode]);

    // 5. Room Management Functions
    // Update createRoom to properly return the room code
    const createRoom = useCallback(async () => {
        if (!walletAddress) {
            toast.error("Connect wallet first!");
            return null;
        }

        if (roomCode) {
            console.log("createRoom: Already in a room, disconnecting first.");
            await disconnectRoomRef.current?.(); // Use the ref
            await new Promise(resolve => setTimeout(resolve, 300)); // Short delay
        }

        setIsConnecting(true);
        setConnectionState('connecting');
        let newRoomCode = '';

        try {

            // Generate room code and game ID
            const newRoomCode = Math.floor(100000 + Math.random() * 900000).toString();
            const newGameId = generateGameId(newRoomCode);

            // Create host player data
            const hostPlayer = {
                address: walletAddress,
                ready: false,
                color: getRandomNeonColor(),
                hasStakedLocally: false,
                signature: null,
                isBot: false
            };

            // Create room in Firebase
            await createGameRoom(newRoomCode, {
                ...hostPlayer,
                gameId: newGameId,
                stakeAmount: '0'
            });
            console.log(`Firebase: Room ${newRoomCode} created.`);


            // Setup disconnect handler
            await setupDisconnect(newRoomCode, walletAddress, true);
            console.log(`Firebase: Disconnect handler set for host.`);

            // Update local state
            setRoomCode(newRoomCode);
            setGameId(newGameId);
            setIsHost(true);
            // setPlayers([{ ...hostPlayer, address: walletAddress }]);

            // Subscribe to room updates
            if (roomSubscriptionRef.current) roomSubscriptionRef.current(); // Unsubscribe old one if any
            console.log(`RaceContext: Subscribing to new room ${newRoomCode} after creation.`);
            roomSubscriptionRef.current = subscribeToRoom(newRoomCode, handleRoomUpdate); // Use the stable callback

            setConnectionState('connected');
            setIsConnecting(false);
            toast.success(`Room ${newRoomCode} created!`);
            console.log("createRoom process complete.");
            return newRoomCode;
        } catch (error) {
            console.error("Error creating room:", error);
            toast.error("Failed to create room. Try again.");
            setConnectionState('error');
            setIsConnecting(false);
            if (roomCode === newRoomCode) {
                await disconnectRoomRef.current?.();
           }
           return null;
        }
    }, [walletAddress, roomCode, handleRoomUpdate]);

    const joinRoom = useCallback(async (code) => {
        if (!walletAddress) {
            toast.error("Connect wallet first!");
            return false;
        }

        if (roomCode === code) {
            console.log("Already in this room. No need to join again.");
            return true;
        }

        if (roomCode && roomCode !== code) {
            console.log("joinRoom: In a different room, disconnecting first.");
            await disconnectRoomRef.current?.(); // Use the ref
            await new Promise(resolve => setTimeout(resolve, 300)); // Short delay
        }

        if (!code || code.length !== 6 || !/^\d{6}$/.test(code)) {
            toast.error("Invalid room code format.");
            return false;
        }

            setIsConnecting(true);
            setConnectionState('connecting');
            // Check if room exists
            try {
            const roomExists = await checkRoomExists(code);
            if (!roomExists) {
                toast.error(`Room ${code} doesn't exist!`);
                setConnectionState('error');
                setIsConnecting(false);
                return false;
            }

            // Create player data
            const playerData = {
                address: walletAddress,
                ready: false,
                color: getRandomNeonColor(),
                hasStakedLocally: false,
                signature: null,
                isBot: false
            };

            // Join room in Firebase
            await joinGameRoom(code, playerData);
            console.log(`Firebase: Player ${walletAddress} added to room ${code}.`);

            // Setup disconnect handler
            await setupDisconnect(code, walletAddress, false);
            console.log(`Firebase: Disconnect handler set for joiner.`);

            // Update minimal local state
            setRoomCode(code);
            setIsHost(false);
            // DO NOT set players here - rely on subscription

            // Subscribe using the stable callback
            if (roomSubscriptionRef.current) roomSubscriptionRef.current(); // Unsubscribe old one if any
            console.log(`RaceContext: Subscribing to room ${code} after joining.`);
            roomSubscriptionRef.current = subscribeToRoom(code, handleRoomUpdate); // Use the stable callback

            // Small delay to allow subscription to potentially fire once
            await new Promise(resolve => setTimeout(resolve, 150));

            setConnectionState('connected');
            setIsConnecting(false);
            toast.success(`Joined room ${code}!`);
            console.log("Join room process complete.");
            return true;

        } catch (error) {
            console.error("Error joining room:", error);
            toast.error("Failed to join room.");
            setConnectionState('error');
            setIsConnecting(false);
            // Attempt cleanup if room was partially joined locally
            if (roomCode === code) {
                 await disconnectRoomRef.current?.();
            }
            return false;
        }
    // Add handleRoomUpdate dependency
    }, [walletAddress, roomCode, handleRoomUpdate, isReady, hasStakedLocally]);
    // 6. Game Actions
    const setPlayerStake = useCallback((amount) => {
        if (!isHost || onChainGameStatus > 0) {
            toast.warn("Stake can only be set by the host before the game is created.");
            return;
        }

        const parsedAmount = parseFloat(amount);
        if (isNaN(parsedAmount) || parsedAmount < 0) {
            toast.warn("Invalid stake amount.");
            setStakeAmount('0');

            // Update Firebase
            if (roomCode) {
                updateGameData(roomCode, { stakeAmount: '0' }).catch(err => {
                    console.error("Error updating stake amount:", err);
                });
            }
        } else {
            setStakeAmount(amount);

            // Update Firebase
            if (roomCode) {
                updateGameData(roomCode, { stakeAmount: amount }).catch(err => {
                    console.error("Error updating stake amount:", err);
                });
            }
        }
    }, [isHost, onChainGameStatus, roomCode]);

    const setPlayerReady = useCallback(async (ready) => {
        if (isProcessing) {
            toast.warn("Please wait for the current action to complete.");
            return;
        }

        if (ready) {
            const currentStake = parseFloat(stakeAmount);
            if (isNaN(currentStake) || currentStake <= 0) {
                toast.warn("Stake amount must be set to a value greater than 0 before readying up.");
                return;
            }
        }

        // Update local state first for responsiveness
        setIsReady(ready);

        // Update Firebase
        try {
            await updatePlayerData(roomCode, walletAddress, { ready });

            // If host is readying up, potentially create game on chain
            if (ready && isHost && onChainGameStatus === 0) {
                await callCreateGame();
            }

            // If player is readying up and game exists, stake
            if (ready && onChainGameStatus === 1) {
                await callStakeRef.current?.();
            }
        } catch (error) {
            console.error("Error updating ready state:", error);
            toast.error("Failed to update ready state.");

            // Revert local state
            setIsReady(!ready);
        }
    }, [isProcessing, stakeAmount, onChainGameStatus, isHost, walletAddress, roomCode, callCreateGame]);

    const addBotPlayer = useCallback(() => {
        if (!isHost) return;
        if (players.length >= MAX_PLAYERS) {
            toast.warn(`Cannot exceed ${MAX_PLAYERS} players.`);
            return;
        }

        const botAddress = `0xBot${Math.floor(Math.random() * 1000000).toString().padStart(6, '0')}`;
        const newBot = {
            address: botAddress,
            ready: true,
            color: getRandomNeonColor(),
            isBot: true,
            hasStakedLocally: true,
            signature: null
        };

        // Add directly to Firebase - the subscription will update local state
        if (roomCode) {
            updatePlayerData(roomCode, botAddress, newBot).catch(err => {
                console.error("Error adding bot:", err);
                toast.error("Failed to add bot player.");
            });
        }
    }, [isHost, players.length, roomCode]);

    const startGame = useCallback(() => {
        if (gameStarted || !isHost) return;

        if (players.some(p => p.isBot)) {
            console.log("Starting bot game locally");

            // Update Firebase
            if (roomCode) {
                updateGameData(roomCode, {
                    gameStarted: true,
                    onChainGameStatus: 2 // Assume InProgress for bot games
                }).catch(err => {
                    console.error("Error updating game start state:", err);
                });
            }

            setGameStarted(true);
            setOnChainGameStatus(2);
        } else if (onChainGameStatus === 2) {
            // Just update Firebase
            if (roomCode) {
                updateGameData(roomCode, { gameStarted: true }).catch(err => {
                    console.error("Error updating game start state:", err);
                });
            }
            setGameStarted(true);
        } else {
            console.warn("Cannot start game - conditions not met (contract not InProgress).");
            checkAllPlayersStakedRef.current?.();
        }
    }, [gameStarted, isHost, players, onChainGameStatus, roomCode]);

    const endGame = useCallback(async (winnerAddress) => {
        if (gameEnded) return;

        console.log("Attempting to end game. Winner:", winnerAddress);
        setWinner(winnerAddress);
        setGameEnded(true);

        // Update Firebase
        if (roomCode) {
            updateGameData(roomCode, {
                gameEnded: true,
                winner: winnerAddress
            }).catch(err => {
                console.error("Error updating game end state:", err);
            });
        }

        toast.info(`Race finished! Winner: ${winnerAddress.slice(0, 6)}...`);

        // Handle contract for real players (not bots)
        if (contract && onChainGameStatus === 2 && !players.some(p => p.isBot)) {
            setIsProcessing(true);
            toast.info("Collecting signatures for result submission...");

            try {
                let finalTimestamp = gameContractTimestamp;
                if (!finalTimestamp && contract.games) {
                    try {
                        const gameData = await contract.games(gameId);
                        finalTimestamp = typeof gameData.createdAt === 'bigint' ? Number(gameData.createdAt) : gameData.createdAt.toNumber();
                        setGameContractTimestamp(finalTimestamp);

                        // Update Firebase
                        if (roomCode) {
                            updateGameData(roomCode, { gameContractTimestamp: finalTimestamp }).catch(err => {
                                console.error("Error updating game timestamp:", err);
                            });
                        }
                    } catch (tsError) {
                        console.error("Failed to fetch game creation timestamp:", tsError);
                        toast.error("Failed to get game timestamp for signing.");
                        setIsProcessing(false);
                        return;
                    }
                }

                if (!finalTimestamp) {
                    toast.error("Game creation timestamp missing. Cannot sign result.");
                    setIsProcessing(false);
                    return;
                }

                // If current player is the winner, wait for signatures
                // If not, generate signature and update Firebase
                if (walletAddress !== winnerAddress) {
                    const chainId = (await signer.provider.getNetwork()).chainId;
                    const messageHasher = typeof ethers.solidityPackedKeccak256 === 'function'
                        ? ethers.solidityPackedKeccak256
                        : ethers.utils.solidityKeccak256;

                    const messageHash = messageHasher(
                        ["bytes32", "address", "address", "uint256", "uint256"],
                        [gameId, winnerAddress, CONTRACT_ADDRESS, chainId, BigInt(finalTimestamp)]
                    );

                    const ethSignedMessagePrefix = "\x19Ethereum Signed Message:\n32";
                    const ethSignedMessageHash = messageHasher(
                        ["string", "bytes32"],
                        [ethSignedMessagePrefix, messageHash]
                    );

                    console.log("Signing result hash:", ethSignedMessageHash);
                    const signature = await signer.signMessage(ethers.getBytes ? ethers.getBytes(ethSignedMessageHash) : ethSignedMessageHash);
                    console.log("My Signature:", signature);

                    // Update signature in Firebase
                    if (roomCode) {
                        await updatePlayerData(roomCode, walletAddress, { signature });
                    }

                    toast.info("Signature sent to winner.");
                    setIsProcessing(false);
                } else {
                    // I'm the winner - check for existing signatures or wait
                    console.log("Winner: Waiting for signatures from other players...");
                    checkAndSubmitResultRef.current?.();
                    setIsProcessing(false);
                }
            } catch (error) {
                console.error("Error during signature process:", error);
                toast.error(`Signature failed: ${error.message || 'Unknown error'}`);
                setIsProcessing(false);
            }
        } else {
            console.log("Game ended (Bot game or contract not involved/ready). No signatures needed.");
        }
    }, [gameEnded, contract, onChainGameStatus, players, gameId, gameContractTimestamp, walletAddress, winner, signer, roomCode]);

    const resetGameForNextRound = useCallback(() => {
        if (!isHost) {
            toast.warn("Only the host can start a new round.");
            return;
        }

        console.log("Host: Resetting game for next round.");
        const newGameId = generateGameId(roomCode);

        // Update Firebase with new game state
        if (roomCode) {
            updateGameData(roomCode, {
                gameId: newGameId,
                gameStarted: false,
                gameEnded: false,
                winner: null,
                onChainGameStatus: 0,
                gameContractTimestamp: null
            }).then(() => {
                // Reset all players' ready and staked states
                const playerUpdates = players.reduce((updates, player) => {
                    if (!player.isBot) {
                        updates[`players/${player.address}/ready`] = false;
                        updates[`players/${player.address}/hasStakedLocally`] = false;
                        updates[`players/${player.address}/signature`] = null;
                    }
                    return updates;
                }, {});

                return updateGameData(roomCode, playerUpdates);
            }).catch(err => {
                console.error("Error resetting game:", err);
                toast.error("Failed to reset game.");
            });
        }

        resetGameLocallyRef.current?.(newGameId);
        toast.info("Ready for a new race!");
    }, [isHost, roomCode, players]);

    // 9. useEffect Hooks for setup and cleanup

    // Wallet connection/disconnection
    useEffect(() => {
        const handleAccountsChanged = async (accounts) => {
            console.log("RaceContext: accountsChanged event detected", accounts);
            if (accounts.length === 0) {
                toast.info("Wallet disconnected.");
                setWalletAddress("");
                setBalance("0");
                setSigner(null);
                setContract(null);
                disconnectRoomRef.current?.();
            } else if (accounts[0] !== walletAddress) {
                toast.info("Wallet account changed. Re-initializing...");
                disconnectRoomRef.current?.();
                setTimeout(async () => {
                    await connectWallet();
                }, 100);
            }
        };

        const checkInitialConnection = async () => {
            if (window.ethereum) {
                const wasDisconnected = localStorage.getItem('walletDisconnected') === 'true';
                if (!wasDisconnected) {
                    try {
                        const accounts = await window.ethereum.request({ method: "eth_accounts" });
                        if (accounts.length > 0) {
                            console.log("RaceContext: Found existing wallet connection.");
                            await connectWallet();
                        } else {
                            console.log("RaceContext: No existing wallet connection found.");
                        }
                    } catch (error) {
                        console.error("Error checking initial wallet connection:", error);
                    }
                } else {
                    console.log("RaceContext: Wallet was previously disconnected manually.");
                }
            }
        };
        checkInitialConnection();

        if (window.ethereum?.on) {
            window.ethereum.on('accountsChanged', handleAccountsChanged);
        }

        return () => {
            if (window.ethereum?.removeListener) {
                window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
            }
        };
    }, [walletAddress, connectWallet]);

    // Clean up Firebase subscription when provider unmounts
    useEffect(() => {
        return () => {
            if (roomSubscriptionRef.current) {
                roomSubscriptionRef.current();
            }

            // If in a room when unmounting, leave it
            if (roomCode && walletAddress) {
                leaveGameRoom(roomCode, walletAddress).catch(console.error);
            }
        };
    }, [roomCode, walletAddress]);

    // --- Context Value ---
    const value = {
        // State
        walletAddress, balance, signer, contract, roomCode, players, isHost, // Ensure 'players' is here
        stakeAmount, isReady, hasStakedLocally,
        gameId, onChainGameStatus, gameStarted, gameEnded,
        winner, currentLap, totalLaps, isProcessing, gameContractTimestamp,
        connectionState, isConnecting,

        // Functions (ensure all needed functions are included)
        connectWallet, disconnectWallet, // Assuming these exist
        createRoom, joinRoom, setPlayerStake, setPlayerReady, addBotPlayer,
        startGame, endGame, setCurrentLap,
        resetGame: resetGameForNextRound, // Assuming this exists
        disconnectPeer: disconnectRoomRef.current // Provide the function via ref
   };
   console.log('%c RaceContext Provider Value:', 'color: blue; font-weight: bold;', value);

    return (
        <RaceContext.Provider value={value}>
            {children}
        </RaceContext.Provider>
    );
};