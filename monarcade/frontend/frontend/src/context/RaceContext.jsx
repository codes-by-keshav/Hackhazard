import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { ethers } from 'ethers';
import Peer from 'peerjs';
import { toast } from 'react-toastify';

// --- Helper Functions (Outside Component) ---
const generateGameId = (roomCode) => {
    const salt = Math.random().toString(36).substring(2, 15);
    const data = `${roomCode}-${Date.now()}-${salt}`;
    // Use ethers v6 or v5 id function
    return typeof ethers.id === 'function' ? ethers.id(data) : ethers.utils.id(data);
};

const sanitizeForPeerId = (address) => {
    // PeerJS IDs can only contain alphanumeric characters, underscores, and hyphens.
    return address.replace(/[^a-zA-Z0-9_-]/g, '');
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
    const [players, setPlayers] = useState([]); // { address, peerId, ready, color, isBot, hasStakedLocally, signature }
    const [isHost, setIsHost] = useState(false);
    const [stakeAmount, setStakeAmount] = useState('0');
    const [isReady, setIsReady] = useState(false);
    const [gameId, setGameId] = useState(null);
    const [gameContractTimestamp, setGameContractTimestamp] = useState(null);
    const [onChainGameStatus, setOnChainGameStatus] = useState(0); // 0: NonExistent, 1: Created, 2: InProgress, 3: Completed
    const [gameStarted, setGameStarted] = useState(false);
    const [gameEnded, setGameEnded] = useState(false);
    const [winner, setWinner] = useState(null); // Stores winner's address
    const [currentLap, setCurrentLap] = useState(0);
    const [totalLaps] = useState(3);
    const [isProcessing, setIsProcessing] = useState(false);

    // --- Refs ---
    const peerRef = useRef(null);
    const hostConnectionRef = useRef(null);
    const clientConnectionsRef = useRef({});
    const localPeerIdRef = useRef(null);

    // --- Refs for Functions (to break dependency cycle) ---
    const checkAllPlayersStakedRef = useRef(null);
    const callStakeRef = useRef(null);
    const checkAndSubmitResultRef = useRef(null);
    const resetGameLocallyRef = useRef(null);
    const broadcastToClientsRef = useRef(null);
    const disconnectPeerRef = useRef(null);
    const handleP2PMessageRef = useRef(null);
    const setupConnectionListenersRef = useRef(null);

    let connectionTimeout = setTimeout(() => {
        if (hostConnectionRef.current && !hostConnectionRef.current.open) {
          console.error("Connection to host timed out after 10 seconds");
          toast.error("Connection to host timed out. Please try again.");
          disconnectPeerRef.current?.();
        }
      }, 10000);

    // --- Callbacks Definition Order ---

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
        // Note: stakeAmount might persist or be reset based on desired UX
    }, []); // No external dependencies needed for local reset logic itself
    useEffect(() => { resetGameLocallyRef.current = resetGameLocally; }, [resetGameLocally]);

    // 2. P2P Cleanup
    const disconnectPeer = useCallback(() => {
        console.log("Attempting to disconnect PeerJS...");
        if (peerRef.current) {
            console.log("Destroying existing PeerJS instance:", peerRef.current.id);
            peerRef.current.destroy();
            peerRef.current = null;
        } else {
            console.log("No active PeerJS instance to destroy.");
        }
        hostConnectionRef.current = null;
        clientConnectionsRef.current = {};
        localPeerIdRef.current = null;

        // Reset relevant state
        setPlayers([]);
        setRoomCode('');
        setIsHost(false);
        setGameId(null);
        setGameStarted(false);
        setGameEnded(false);
        setWinner(null);
        setIsReady(false);
        setOnChainGameStatus(0);
        setGameContractTimestamp(null);
        setIsProcessing(false);
        console.log("PeerJS disconnected and relevant context state reset.");
    }, []); // No dependencies
    useEffect(() => { disconnectPeerRef.current = disconnectPeer; }, [disconnectPeer]);

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
    }, []); // Dependencies: CONTRACT_ADDRESS, CONTRACT_ABI (constants)

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
                initializeContract(currentSigner); // Initialize contract after getting signer

                localStorage.removeItem('walletDisconnected');
                toast.success("Wallet connected!");
                console.log("Wallet connected:", currentAddress);
            } else {
                toast.warn("No accounts found.");
            }
        } catch (error) {
            console.error("Error connecting wallet:", error);
            toast.error(`Wallet connection failed: ${error.message || 'Unknown error'}`);
            // Reset state if connection fails
            setWalletAddress('');
            setSigner(null);
            setContract(null);
            setBalance('0');
        }
    }, [fetchBalance, initializeContract]); // Dependencies

    // 4. P2P Communication Primitives
    const sendToHost = useCallback((message) => {
        if (hostConnectionRef.current && hostConnectionRef.current.open) {
            console.log("Client: Sending message to host:", message);
            hostConnectionRef.current.send(message);
        } else {
            console.warn("Client: Cannot send message, no open connection to host.");
        }
    }, []); // Depends only on ref

    const broadcastToClients = useCallback((message, excludePeerId = null) => {
        if (!isHost) return;
        console.log("Host: Broadcasting message:", message, "Excluding:", excludePeerId);
        Object.entries(clientConnectionsRef.current).forEach(([peerId, conn]) => {
            if (peerId !== excludePeerId && conn && conn.open) {
                conn.send(message);
            }
        });
    }, [isHost]); // Depends only on ref and isHost state
    useEffect(() => { broadcastToClientsRef.current = broadcastToClients; }, [broadcastToClients]);

    // 5. Contract Interaction Callbacks
    const checkAndSubmitResult = useCallback(async () => {
        const winnerPlayer = players.find(p => p.address === winner);
        if (!winnerPlayer || walletAddress !== winner || !contract || isProcessing || onChainGameStatus !== 2) {
            console.log("Conditions not met for submitting result:", { winner, walletAddress, contractExists: !!contract, isProcessing, onChainGameStatus });
            return;
        }

        const nonWinners = players.filter(p => p.address !== winner && !p.isBot);
        const collectedSignatures = nonWinners.map(p => p.signature).filter(Boolean); // Filter out null/undefined

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
                if (signer) await fetchBalance(walletAddress, signer.provider); // Update winner's balance
            } catch (error) {
                console.error("Error submitting result:", error);
                toast.error(`Result submission failed: ${error.reason || error.message || 'Unknown contract error'}`);
                // Should we reset status or allow retry? Depends on contract logic.
            } finally {
                setIsProcessing(false);
            }
        } else if (nonWinners.length === 0) {
             // Only one player (or only bots + winner), submit without signatures?
             // Contract needs to handle this case (e.g., if signatures array is empty)
             console.log("No non-bot opponents, submitting result without signatures...");
             setIsProcessing(true);
             try {
                 const tx = await contract.submitResult(gameId, winner, []); // Submit empty array
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
            // Optionally show a toast or status update
            // toast.info(`Waiting for signatures... ${collectedSignatures.length}/${nonWinners.length}`);
        }
    }, [contract, gameId, winner, players, isProcessing, onChainGameStatus, walletAddress, signer, fetchBalance, setOnChainGameStatus, setIsProcessing]);
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
                broadcastToClientsRef.current?.({ type: 'StartRace' }); // Use ref
                setGameStarted(true); // Start game locally for host too
            } else {
                console.log("Contract status still 'Created'. Waiting for contract state update or more stakes.");
                // Maybe some players haven't staked on chain yet, or event propagation delay
            }
        } catch (error) {
            console.error("Error checking game status:", error);
            toast.error("Failed to check game status on contract.");
        }
    }, [contract, isHost, gameId, onChainGameStatus, players, setOnChainGameStatus, setGameStarted]); // Removed broadcastToClients from deps
    useEffect(() => { checkAllPlayersStakedRef.current = checkAllPlayersStaked; }, [checkAllPlayersStaked]);

    const callStake = useCallback(async () => {
        const localPlayer = players.find(p => p.peerId === localPeerIdRef.current);
        if (!contract || isProcessing || onChainGameStatus !== 1 || !localPlayer || localPlayer.hasStakedLocally) {
            console.log("Conditions not met for staking:", { contractExists: !!contract, isProcessing, onChainGameStatus, localPlayerExists: !!localPlayer, hasStaked: localPlayer?.hasStakedLocally });
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

            // Update local state first for responsiveness
            setPlayers(prev => prev.map(p => p.peerId === localPeerIdRef.current ? { ...p, hasStakedLocally: true } : p));
            toast.success("Successfully staked!");
            console.log("Stake successful for", walletAddress);

            // Inform others via P2P
            if (isHost) {
                broadcastToClientsRef.current?.({ type: 'StakeConfirmed', payload: { peerId: localPeerIdRef.current, address: walletAddress } }); // Use ref
                checkAllPlayersStakedRef.current?.(); // Use ref
            } else {
                sendToHost({ type: 'ClientStakeConfirmed', payload: { address: walletAddress } });
            }

        } catch (error) {
            console.error("Error staking:", error);
            toast.error(`Staking failed: ${error.reason || error.message || 'Unknown contract error'}`);
            // Revert ready state if stake failed
            setIsReady(false);
            setPlayers(prev => prev.map(p => p.peerId === localPeerIdRef.current ? { ...p, ready: false, hasStakedLocally: false } : p));
            if (isHost) {
                 broadcastToClientsRef.current?.({ type: 'PlayerUpdate', payload: { peerId: localPeerIdRef.current, data: { ready: false } } }); // Use ref
            } else {
                 sendToHost({ type: 'ClientUpdate', payload: { data: { ready: false } } });
            }
        } finally {
            setIsProcessing(false);
        }
    }, [contract, gameId, stakeAmount, isProcessing, onChainGameStatus, walletAddress, players, isHost, sendToHost, setPlayers, setIsProcessing, setIsReady]); // Removed broadcastToClients, checkAllPlayersStaked from deps
    useEffect(() => { callStakeRef.current = callStake; }, [callStake]);

    const callCreateGame = useCallback(async () => {
        if (!isHost || !contract || isProcessing || onChainGameStatus !== 0) {
             console.log("Conditions not met for creating game:", { isHost, contractExists: !!contract, isProcessing, onChainGameStatus });
             return;
        }
        const playerAddresses = players.filter(p => !p.isBot).map(p => p.address); // Only real players for contract
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

            // Fetch creation timestamp from contract state (more reliable than event sometimes)
            const gameData = await contract.games(gameId);
            // Ensure gameData.createdAt is treated as BigInt if using ethers v6
            const creationTimestamp = typeof gameData.createdAt === 'bigint' ? Number(gameData.createdAt) : gameData.createdAt.toNumber();
            setGameContractTimestamp(creationTimestamp);
            setOnChainGameStatus(1); // Mark as Created

            console.log("Game created on chain. Tx:", receipt.transactionHash, "Timestamp:", creationTimestamp);
            toast.success("Game created on blockchain!");

            // Inform clients via P2P
            broadcastToClientsRef.current?.({ type: 'GameCreatedOnChain', payload: { gameId, timestamp: creationTimestamp } }); // Use ref

            // If host was already 'Ready', proceed to stake
            if (isReady) {
                await callStakeRef.current?.(); // Use ref
            }

        } catch (error) {
            console.error("Error creating game on contract:", error);
            toast.error(`Failed to create game: ${error.reason || error.message || 'Unknown contract error'}`);
            setOnChainGameStatus(0); // Revert status if creation failed
        } finally {
            setIsProcessing(false);
        }
    }, [contract, isHost, players, stakeAmount, gameId, isProcessing, onChainGameStatus, isReady, setGameContractTimestamp, setOnChainGameStatus, setIsProcessing]); // Removed broadcastToClients, callStake from deps
    // No need for callCreateGame ref unless it's called from handleP2PMessage

    // 6. P2P Core Logic (handleP2PMessage now uses refs for problematic functions)
    const handleP2PMessage = useCallback((message, senderPeerId) => {
        try{
            console.log(`Handling P2P Message from ${senderPeerId}:`, message);
            switch (message.type) {
                // --- Client receiving messages from Host ---
                case 'RoomState':
                    if (!isHost) {
                        console.log("Client: Received initial room state from host.");
                        setPlayers(message.payload.players);
                        setGameId(message.payload.gameId); // Sync gameId
                        setStakeAmount(message.payload.stakeAmount); // Sync stake amount
                        setOnChainGameStatus(message.payload.onChainGameStatus); // Sync contract status
                        setGameContractTimestamp(message.payload.gameContractTimestamp); // Sync timestamp
                    }
                    break;
                case 'PlayerJoined':
                    if (message.payload.peerId !== localPeerIdRef.current) { // Don't add self again
                        console.log("PlayerJoined message received for:", message.payload.address);
                        setPlayers(prev => {
                            // Avoid duplicates if state update is slightly delayed
                            if (prev.some(p => p.peerId === message.payload.peerId)) {
                                return prev;
                            }
                            return [...prev, message.payload];
                        });
                    }
                    break;
                case 'PlayerLeft':
                    console.log("Player left:", message.payload.address);
                    setPlayers(prev => prev.filter(p => p.peerId !== message.payload.peerId));
                    if (message.payload.peerId === roomCode && !isHost) { // Host's peerId is the roomCode
                        toast.error("Host disconnected! Leaving room.");
                        disconnectPeerRef.current?.(); // Use ref
                    }
                    break;
                case 'PlayerUpdate':
                    console.log("Player updated:", message.payload.peerId, message.payload.data);
                    setPlayers(prev => prev.map(p =>
                        p.peerId === message.payload.peerId ? { ...p, ...message.payload.data } : p
                    ));
                    if (message.payload.peerId === localPeerIdRef.current && message.payload.data.ready !== undefined) {
                        setIsReady(message.payload.data.ready);
                    }
                    break;
                case 'GameCreatedOnChain':
                    if (!isHost) {
                        console.log("Client: Received GameCreatedOnChain from host.");
                        setGameId(message.payload.gameId);
                        setGameContractTimestamp(message.payload.timestamp);
                        setOnChainGameStatus(1); // Status becomes 'Created'
                        toast.info("Game created on blockchain. Ready to stake!");
                        if (isReady) {
                            callStakeRef.current?.(); // Use ref
                        }
                    }
                    break;
                case 'StakeConfirmed':
                    console.log("Stake confirmed for:", message.payload.address);
                    setPlayers(prev => prev.map(p =>
                        p.peerId === message.payload.peerId ? { ...p, hasStakedLocally: true } : p
                    ));
                    if (isHost) {
                        checkAllPlayersStakedRef.current?.(); // Use ref
                    }
                    break;
                case 'StartRace':
                    console.log("Received StartRace signal.");
                    setGameStarted(true);
                    setOnChainGameStatus(2); // Status becomes 'InProgress'
                    break;
                case 'ResultSignature':
                    if (walletAddress === winner) { // Only the winner processes signatures
                        console.log("Winner: Received signature from", message.payload.peerId);
                        setPlayers(prev => prev.map(p =>
                            p.peerId === message.payload.peerId ? { ...p, signature: message.payload.signature } : p
                        ));
                        checkAndSubmitResultRef.current?.(); // Use ref
                    }
                    break;
                case 'GameReset':
                    if (!isHost) {
                        console.log("Client: Received GameReset signal.");
                        resetGameLocallyRef.current?.(message.payload.newGameId); // Use ref
                        toast.info("Host started a new round!");
                    }
                    break;

                // --- Host receiving messages from Client ---
                case 'RequestRoomState':
                    if (isHost && clientConnectionsRef.current[senderPeerId]) {
                        console.log("Host: Received RequestRoomState from", senderPeerId, "Payload:", message.payload);

                        let updatedPlayers = [...players]; // Create a mutable copy
                        const playerExists = players.some(p => p.peerId === senderPeerId);

                        if (!playerExists && message.payload?.address) {
                            const newPlayer = {
                                address: message.payload.address,
                                peerId: senderPeerId,
                                ready: false,
                                color: getRandomNeonColor(), // Host assigns color
                                hasStakedLocally: false,
                                signature: null,
                                isBot: false
                            };
                            updatedPlayers.push(newPlayer);
                            setPlayers(updatedPlayers); // Update host's state *before* sending

                            // Broadcast PlayerJoined to OTHERS immediately after adding
                            broadcastToClientsRef.current?.({ type: 'PlayerJoined', payload: newPlayer }, senderPeerId); // Use ref
                            console.log("Host: Added new player to state and broadcasting PlayerJoined:", newPlayer);
                        } else if (!playerExists) {
                            console.warn("Host: Received RequestRoomState but missing player address in payload. Cannot add player.");
                        }

                        // Send the potentially updated state back to the requesting client
                        const currentState = {
                            players: updatedPlayers, // Send the updated list
                            gameId: gameId,
                            stakeAmount: stakeAmount,
                            onChainGameStatus: onChainGameStatus,
                            gameContractTimestamp: gameContractTimestamp
                        };
                        clientConnectionsRef.current[senderPeerId].send({ type: 'RoomState', payload: currentState });
                        console.log("Host: Sent RoomState back to", senderPeerId);
                    }
                    break;
                case 'ClientUpdate':
                    if (isHost) {
                        console.log("Host: Received ClientUpdate from", senderPeerId, message.payload.data);
                        const updatedPlayer = players.find(p => p.peerId === senderPeerId);
                        if (updatedPlayer) {
                            const newPlayers = players.map(p => p.peerId === senderPeerId ? { ...p, ...message.payload.data } : p);
                            setPlayers(newPlayers);
                            broadcastToClientsRef.current?.({ type: 'PlayerUpdate', payload: { peerId: senderPeerId, data: message.payload.data } }, senderPeerId); // Use ref
                        }
                    }
                    break;
                case 'ClientStakeConfirmed':
                    if (isHost) {
                        console.log("Host: Received ClientStakeConfirmed from", senderPeerId);
                        const updatedPlayer = players.find(p => p.peerId === senderPeerId);
                        if (updatedPlayer) {
                            const newPlayers = players.map(p => p.peerId === senderPeerId ? { ...p, hasStakedLocally: true } : p);
                            setPlayers(newPlayers);
                            broadcastToClientsRef.current?.({ type: 'StakeConfirmed', payload: { peerId: senderPeerId, address: updatedPlayer.address } }, senderPeerId); // Use ref
                            checkAllPlayersStakedRef.current?.(); // Use ref
                        }
                    }
                    break;
                case 'ClientSignature':
                    if (isHost) {
                        console.log("Host: Received ClientSignature from", senderPeerId);
                        const winnerPlayer = players.find(p => p.address === winner);
                        if (winnerPlayer && winnerPlayer.peerId && clientConnectionsRef.current[winnerPlayer.peerId]) {
                            console.log("Host: Forwarding signature to winner", winnerPlayer.address);
                            clientConnectionsRef.current[winnerPlayer.peerId].send({
                                type: 'ResultSignature',
                                payload: { peerId: senderPeerId, signature: message.payload.signature }
                            });
                        } else if (walletAddress === winner) {
                            console.log("Host (Winner): Processing signature from", senderPeerId);
                            setPlayers(prev => prev.map(p =>
                                p.peerId === senderPeerId ? { ...p, signature: message.payload.signature } : p
                            ));
                            checkAndSubmitResultRef.current?.(); // Use ref
                        } else {
                            console.warn("Host: Received signature but couldn't find winner's connection or host is not winner.");
                        }
                    }
                    break;

                default:
                    console.warn("Unknown P2P message type:", message.type);
            }
        }
        catch (error) {
            console.error("Error handling P2P message:", error, "Message was:", message);
            toast.error("Error processing P2P message");
          }
    }, [
        // REMOVE the problematic functions from this dependency array
        isHost, players, roomCode, gameId, stakeAmount, onChainGameStatus, gameContractTimestamp,
        isReady, winner, walletAddress,
        // Keep state setters and non-problematic functions/helpers
        getRandomNeonColor, // This is a simple helper, safe here
        setPlayers, setGameId, setStakeAmount, setOnChainGameStatus, setGameContractTimestamp, setIsReady,
        setGameStarted
        // Note: resetGameLocally, broadcastToClients, disconnectPeer, checkAllPlayersStaked, callStake, checkAndSubmitResult are accessed via refs now
    ]);
    useEffect(() => { handleP2PMessageRef.current = handleP2PMessage; }, [handleP2PMessage]);

    const setupConnectionListeners = useCallback((conn) => {
        conn.on('data', (data) => {
            console.log(`Data received from ${conn.peer}:`, data);
            handleP2PMessageRef.current?.(data, conn.peer); // Use ref
        });

        conn.on('open', () => {
            clearTimeout(connectionTimeout);
            console.log(`%cData connection OPEN with ${conn.peer}`, 'color: blue; font-weight: bold;');
            if (!isHost) {
                toast.success(`Connected to room ${roomCode}!`);
                console.log("Client: Sending RequestRoomState with address", walletAddress);
                conn.send({ type: 'RequestRoomState', payload: { address: walletAddress } });
            }
        });

        conn.on('close', () => {
            console.warn(`Data connection CLOSED with ${conn.peer}`);
            toast.warn(`Player ${conn.peer.slice(0, 6)}... disconnected.`);
            if (isHost) {
                const leavingPlayer = players.find(p => p.peerId === conn.peer);
                delete clientConnectionsRef.current[conn.peer];
                if (leavingPlayer) {
                    setPlayers(prev => prev.filter(p => p.peerId !== conn.peer));
                    broadcastToClientsRef.current?.({ type: 'PlayerLeft', payload: { peerId: conn.peer, address: leavingPlayer.address } }); // Use ref
                }
            } else {
                if (conn.peer === roomCode) {
                    toast.error("Lost connection to host!");
                    disconnectPeerRef.current?.(); // Use ref
                }
            }
        });

        conn.on('error', (err) => {
            console.error(`Data connection error with ${conn.peer}:`, err);
            toast.error(`P2P connection error: ${err.type}`);
        });
    }, [
        // Update dependencies - handleP2PMessage is stable via ref, refs handle others
        isHost, players, roomCode, walletAddress, setPlayers // Added setPlayers
        // Removed handleP2PMessage, disconnectPeer, broadcastToClients as they are accessed via refs inside
    ]);
    useEffect(() => { setupConnectionListenersRef.current = setupConnectionListeners; }, [setupConnectionListeners]);

    // 2. Fix the PeerJS initialization function to handle connections better
    const initializePeer = useCallback((id) => {
        if (peerRef.current) {
            console.log("Destroying existing PeerJS instance before initializing new one.");
            peerRef.current.destroy();
        }
        console.log(`Initializing PeerJS with ID: ${id}`);
        localPeerIdRef.current = id; // Store intended ID initially

        try { // Start of try block
            const peerJsConfig = {
                debug: 2,
                config: {
                    iceServers: [
                        { urls: 'stun:stun.l.google.com:19302' },
                        { urls: 'stun:stun1.l.google.com:19302' },
                        { urls: 'stun:stun2.l.google.com:19302' },
                    ],
                }
            };

            const peer = new Peer(id, peerJsConfig);
            peerRef.current = peer;

            peer.on('open', (peerId) => {
                console.log(`%cPeerJS connection to signaling server OPEN. My Peer ID is: ${peerId}`, 'color: green; font-weight: bold;');
                localPeerIdRef.current = peerId;
                if (isHost && peerId === roomCode) {
                    setPlayers(prev => prev.map(p => p.address === walletAddress ? { ...p, peerId: peerId } : p));
                }
                toast.info(`P2P Active: ${peerId.slice(0, 10)}...`);
            });

            peer.on('connection', (conn) => {
                console.log(`Incoming connection request from ${conn.peer}`);
                const thisPeerId = localPeerIdRef.current;
                const amITheHost = thisPeerId && !thisPeerId.startsWith('client-');

                console.log(`Connection check: My Confirmed Peer ID = ${thisPeerId}, Am I Host? = ${amITheHost}`);

                if (amITheHost) {
                    console.log(`Host: Accepting connection from ${conn.peer}`);
                    clientConnectionsRef.current[conn.peer] = conn;
                    setupConnectionListenersRef.current?.(conn);
                } else {
                    console.warn("Client received unexpected connection request. Rejecting.");
                    conn.close();
                }
            });

            peer.on('disconnected', () => {
                console.warn('PeerJS DISCONNECTED from signaling server. Attempting to reconnect...');
                toast.warn("P2P signaling connection lost. Reconnecting...");
                // PeerJS attempts reconnection automatically by default
            });

            peer.on('close', () => {
                console.error('PeerJS connection to signaling server CLOSED permanently.');
                toast.error("P2P connection closed.");
                disconnectPeerRef.current?.();
            });

            peer.on('error', (err) => {
                console.error('PeerJS Error:', err);
                toast.error(`P2P Error: ${err.type}`);
                if (err.type === 'unavailable-id') {
                    toast.error(`Room code ${id} is already in use. Try creating again.`);
                    disconnectPeerRef.current?.();
                } else if (err.type === 'peer-unavailable') {
                    const targetPeerId = err.message?.match(/Could not connect to peer\s(.*?)$/)?.[1] || id;
                    toast.error(`Could not find room ${targetPeerId}. It may not exist or host is offline.`);
                    disconnectPeerRef.current?.();
                } else if (err.type === 'network' || err.type === 'webrtc') {
                    toast.error('Network/WebRTC error preventing P2P connection. Check internet/firewall.');
                    // Consider if disconnect is needed here
                }
                // Consider calling disconnectPeerRef.current?.() for other critical errors too
            });

        // --- FIX: Add the missing catch block ---
        } catch (error) {
            console.error("Failed to initialize PeerJS:", error);
            toast.error("Failed to initialize P2P system.");
            disconnectPeerRef.current?.(); // Ensure cleanup on initialization failure
        }
        // --- End Fix ---

    }, [isHost, walletAddress, roomCode, setPlayers]); // Dependencies

    // 7. Room Management
    const createRoom = useCallback(() => {
        if (!walletAddress) {
            toast.error("Connect wallet first!"); return null;
        }
        if (peerRef.current) {
            toast.warn("Already in a room or P2P active. Disconnect first."); return null;
        }

        const newRoomCode = Math.floor(100000 + Math.random() * 900000).toString();
        const newGameId = generateGameId(newRoomCode);

        setRoomCode(newRoomCode);
        setGameId(newGameId);
        setIsHost(true);
        const hostPlayer = {
            address: walletAddress,
            peerId: newRoomCode, // Host's PeerJS ID is the room code
            ready: false,
            color: getRandomNeonColor(),
            hasStakedLocally: false,
            signature: null,
            isBot: false
        };
        setPlayers([hostPlayer]);
        resetGameLocallyRef.current?.(newGameId); // Use ref

        initializePeer(newRoomCode); // Call initializePeer directly

        toast.success(`Room ${newRoomCode} created! Share the code.`);
        return newRoomCode; // Return code for navigation
    }, [walletAddress, initializePeer, setRoomCode, setGameId, setIsHost, setPlayers]); // Removed resetGameLocally from deps

    // 1. Fix the joinRoom function to ensure connection happens after PeerJS is fully initialized
const joinRoom = useCallback((code) => {
  if (!walletAddress) {
    toast.error("Connect wallet first!"); return;
  }
  if (peerRef.current) {
    toast.warn("Already in a room or P2P active. Disconnect first."); return;
  }
  if (!code || code.length !== 6 || !/^\d{6}$/.test(code)) {
    toast.error("Invalid room code format."); return;
  }

  setRoomCode(code);
  setIsHost(false);
  resetGameLocallyRef.current?.(null);

  // Generate a unique PeerJS ID for the client
  const clientPeerId = `client-${sanitizeForPeerId(walletAddress.slice(2, 10))}-${Date.now().toString().slice(-5)}`;
  const joiningPlayer = {
    address: walletAddress,
    peerId: clientPeerId,
    ready: false,
    color: getRandomNeonColor(),
    hasStakedLocally: false,
    signature: null,
    isBot: false
  };
  setPlayers([joiningPlayer]);

  toast.info(`Attempting to join room ${code}...`);
  
  // Initialize PeerJS first with improved waiting logic
  initializePeer(clientPeerId);
  
  // Create a connection attempt function with better timing
  const attemptConnection = () => {
    if (!peerRef.current) {
      console.error("PeerJS not initialized");
      toast.error("P2P initialization failed. Cannot join room.");
      disconnectPeerRef.current?.();
      return;
    }
    
    console.log(`Client: Attempting to connect to host Peer ID: ${code}`);
    try {
      // Explicitly check if peer is open before connecting
      if (!peerRef.current.open) {
        console.log("PeerJS not connected to signaling server yet. Waiting...");
        // Try again in 1 second (with a counter to limit attempts)
        if (!window.connectionAttempts) window.connectionAttempts = 0;
        window.connectionAttempts++;
        
        if (window.connectionAttempts < 15) { // Maximum 15 attempts (15 seconds)
          setTimeout(attemptConnection, 1000);
        } else {
          console.error("Failed to connect to PeerJS signaling server after 15 attempts");
          toast.error("Connection to PeerJS server failed. Please try again later.");
          disconnectPeerRef.current?.();
          window.connectionAttempts = 0;
        }
        return;
      }
      
      window.connectionAttempts = 0; // Reset counter on success
      
      console.log(`Client: PeerJS ready! My ID: ${peerRef.current.id}, connecting to host: ${code}`);
      const conn = peerRef.current.connect(code, { 
        reliable: true, 
        serialization: 'json',
        metadata: { clientAddress: walletAddress }
      });
      
      if (conn) {
        console.log("Client: Connection object created, setting up listeners...");
        hostConnectionRef.current = conn;
        
        // Clear any existing timeout first
        if (window.connectionTimeout) {
          clearTimeout(window.connectionTimeout);
        }
        
        // Setup basic listeners right away
        conn.on('open', () => {
          clearTimeout(window.connectionTimeout);  // Clear timeout again to be safe
          console.log(`%cData connection OPEN with host ${conn.peer}`, 'color: blue; font-weight: bold;');
          toast.success(`Connected to room ${code}!`);
          console.log("Client: Sending RequestRoomState with address", walletAddress);
          conn.send({ type: 'RequestRoomState', payload: { address: walletAddress } });
        });
        
        // Use the setupConnectionListeners function for consistent listener setup
        setupConnectionListenersRef.current?.(conn);
        
        // Set up a connection timeout with a global reference
        window.connectionTimeout = setTimeout(() => {
          if (conn && !conn.open) {
            console.error("Connection to host timed out after 10 seconds");
            toast.error("Connection to host timed out. Please try again.");
            disconnectPeerRef.current?.();
          }
        }, 10000);
      } else {
        console.error("peer.connect() returned null/undefined");
        toast.error("Failed to initiate connection to host.");
        disconnectPeerRef.current?.();
      }
    } catch (error) {
      console.error("Error during peer.connect():", error);
      toast.error("Error trying to connect to host.");
      disconnectPeerRef.current?.();
    }
  };

  // Wait a bit for PeerJS to initialize before trying to connect
  setTimeout(attemptConnection, 2000);
}, [walletAddress, initializePeer, setRoomCode, setIsHost, setPlayers]);


    // 8. UI Callbacks & Game State Changers
    const setPlayerStake = useCallback((amount) => {
        if (!isHost || onChainGameStatus > 0) {
            toast.warn("Stake can only be set by the host before the game is created.");
            return;
        }
        const parsedAmount = parseFloat(amount);
        if (isNaN(parsedAmount) || parsedAmount < 0) {
            toast.warn("Invalid stake amount.");
            setStakeAmount('0');
        } else {
            setStakeAmount(amount);
            // Optionally broadcast stake change to clients immediately?
            // broadcastToClientsRef.current?.({ type: 'StakeAmountUpdate', payload: { amount } });
        }
    }, [isHost, onChainGameStatus, setStakeAmount]); // Added setStakeAmount

    const setPlayerReady = useCallback(async (ready) => {
        if (isProcessing) {
            toast.warn("Please wait for the current action to complete."); return;
        }
        if (ready) {
            const currentStake = parseFloat(stakeAmount);
             if (isNaN(currentStake) || currentStake <= 0) {
                 toast.warn("Stake amount must be set to a value greater than 0 before readying up.");
                 return;
             }
        }

        setIsReady(ready); // Update local state immediately
        setPlayers(prev =>
            prev.map(player =>
                player.peerId === localPeerIdRef.current ? { ...player, ready } : player
            )
        );

        // Send update via P2P
        if (isHost) {
            broadcastToClientsRef.current?.({ type: 'PlayerUpdate', payload: { peerId: localPeerIdRef.current, data: { ready } } }); // Use ref
        } else {
            sendToHost({ type: 'ClientUpdate', payload: { data: { ready } } }); // Fine
        }

        // Trigger contract actions if readying up
        if (ready) {
            if (onChainGameStatus === 1) {
                await callStakeRef.current?.(); // Use ref
            } else if (onChainGameStatus === 0 && isHost) {
                await callCreateGame(); // Fine (assuming callCreateGame doesn't cause issues)
            } else if (onChainGameStatus === 0 && !isHost) {
                toast.info("Ready! Waiting for host to create the game on chain.");
            }
        } else {
            console.log("Player marked as not ready.");
        }
    }, [isProcessing, stakeAmount, onChainGameStatus, isHost, sendToHost, callCreateGame, setIsReady, setPlayers]); // Removed broadcastToClients, callStake from deps

    const addBotPlayer = useCallback(() => {
        if (!isHost) return;
        if (players.length >= MAX_PLAYERS) {
             toast.warn(`Cannot exceed ${MAX_PLAYERS} players.`);
             return;
        }
        const botAddress = `0xBot${Math.floor(Math.random() * 1000000).toString().padStart(6, '0')}`;
        const newBot = {
            address: botAddress,
            peerId: botAddress, // Use address as unique ID for simplicity
            ready: true, // Bots are always ready
            color: getRandomNeonColor(),
            isBot: true,
            hasStakedLocally: true, // Assume bots 'staked' (no real funds)
            signature: null
        };
        setPlayers(prev => [...prev, newBot]);
        broadcastToClientsRef.current?.({ type: 'PlayerJoined', payload: newBot }); // Use ref
    }, [isHost, players, setPlayers]); // Removed broadcastToClients from deps

    const startGame = useCallback(() => {
        console.log("startGame function called (should be triggered by P2P/contract event)");
        if (gameStarted) return;

        if (players.some(p => p.isBot) && isHost) {
             console.log("Starting bot game locally (Host override)");
             setGameStarted(true);
             setOnChainGameStatus(2); // Assume InProgress for bot games
             broadcastToClientsRef.current?.({ type: 'StartRace' }); // Use ref
        } else if (onChainGameStatus === 2) {
             setGameStarted(true);
        } else {
             console.warn("Cannot start game - conditions not met (not host, or contract not InProgress).");
             if (isHost) checkAllPlayersStakedRef.current?.(); // Use ref
        }
    }, [gameStarted, isHost, players, onChainGameStatus, setGameStarted, setOnChainGameStatus]); // Removed checkAllPlayersStaked, broadcastToClients from deps

    const endGame = useCallback(async (winnerAddress) => {
        if (gameEnded) return; // Prevent multiple calls

        console.log("Attempting to end game. Winner:", winnerAddress);
        setWinner(winnerAddress); // Set winner address in state
        setGameEnded(true);       // Mark game as ended locally
        toast.info(`Race finished! Winner: ${winnerAddress.slice(0, 6)}...`);

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

                const chainId = (await signer.provider.getNetwork()).chainId;
                const messageHasher = typeof ethers.solidityPackedKeccak256 === 'function' ? ethers.solidityPackedKeccak256 : ethers.utils.solidityKeccak256;
                const messageHash = messageHasher(
                    ["bytes32", "address", "address", "uint256", "uint256"],
                    [gameId, winnerAddress, CONTRACT_ADDRESS, chainId, BigInt(finalTimestamp)] // Ensure timestamp is BigInt for ethers v6
                );
                const ethSignedMessagePrefix = "\x19Ethereum Signed Message:\n32";
                const ethSignedMessageHash = messageHasher(
                    ["string", "bytes32"],
                    [ethSignedMessagePrefix, messageHash]
                );

                if (walletAddress !== winnerAddress) {
                    console.log("Signing result hash:", ethSignedMessageHash);
                    const signature = await signer.signMessage(ethers.getBytes(ethSignedMessageHash)); // Use getBytes for v6+
                    console.log("My Signature:", signature);
                    setPlayers(prev => prev.map(p => p.peerId === localPeerIdRef.current ? { ...p, signature: signature } : p));
                    sendToHost({ type: 'ClientSignature', payload: { signature } }); // Fine
                    toast.info("Signature sent to host.");
                    setIsProcessing(false);
                } else {
                    console.log("Winner: Waiting for signatures from other players...");
                    checkAndSubmitResultRef.current?.(); // Use ref
                }
            } catch (error) {
                console.error("Error during signature process:", error);
                toast.error(`Signature failed: ${error.message || 'Unknown error'}`);
                setIsProcessing(false);
            }
        } else {
             console.log("Game ended (Bot game or contract not involved/ready). No signatures needed.");
             setIsProcessing(false);
        }
    }, [
        gameEnded, contract, onChainGameStatus, players, gameId, gameContractTimestamp,
        walletAddress, winner, signer, // Winner state is set just before this call
        sendToHost, // Fine
        setWinner, setGameEnded, setIsProcessing, setGameContractTimestamp, setPlayers // State setters
        // Removed checkAndSubmitResult from deps
    ]);

    const resetGameForNextRound = useCallback(() => {
        if (!isHost) {
            toast.warn("Only the host can start a new round.");
            return;
        }
        console.log("Host: Resetting game for next round.");
        const newGameId = generateGameId(roomCode); // Generate new ID for the next game
        resetGameLocallyRef.current?.(newGameId); // Use ref
        toast.info("Ready for a new race!");
        broadcastToClientsRef.current?.({ type: 'GameReset', payload: { newGameId } }); // Use ref
    }, [isHost, roomCode]); // Removed resetGameLocally, broadcastToClients from deps

    // 9. useEffect Hooks
    useEffect(() => {
        const handleAccountsChanged = async (accounts) => {
            console.log("RaceContext: accountsChanged event detected", accounts);
            if (accounts.length === 0) {
                toast.info("Wallet disconnected.");
                setWalletAddress(""); setBalance("0"); setSigner(null); setContract(null);
                disconnectPeerRef.current?.(); // Use ref
            } else if (accounts[0] !== walletAddress) {
                toast.info("Wallet account changed. Re-initializing...");
                disconnectPeerRef.current?.(); // Use ref
                setTimeout(async () => {
                    await connectWallet(); // Fine
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
                             await connectWallet(); // Fine
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
            // Disconnect PeerJS when the provider unmounts
            // disconnectPeerRef.current?.(); // Consider if this cleanup is too aggressive
        };
    }, [walletAddress, connectWallet]); // Removed disconnectPeer from deps

    // --- Context Value ---
    const value = {
        // State
        walletAddress, balance, signer, contract, roomCode, players, isHost,
        stakeAmount, isReady, gameId, onChainGameStatus, gameStarted, gameEnded,
        winner, currentLap, totalLaps, isProcessing, gameContractTimestamp,

        // Functions (Provide original functions, not refs)
        createRoom, joinRoom, setPlayerStake, setPlayerReady, addBotPlayer,
        startGame, endGame, setCurrentLap,
        resetGame: resetGameForNextRound,
        disconnectPeer, // Provide the original disconnectPeer
    };

    return (
        <RaceContext.Provider value={value}>
            {children}
        </RaceContext.Provider>
    );
};