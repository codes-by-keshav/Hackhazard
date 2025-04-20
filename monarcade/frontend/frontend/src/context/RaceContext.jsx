import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { ethers } from 'ethers';
import Peer from 'peerjs'; // Import PeerJS
import { ToastContainer, toast } from 'react-toastify';

const RaceContext = createContext();

export const useRaceContext = () => useContext(RaceContext);

// Helper to generate a more unique gameId
const generateGameId = (roomCode) => {
    const salt = Math.random().toString(36).substring(2, 15);
    const data = `${roomCode}-${Date.now()}-${salt}`;
    // Check for ethers v6 'id' function, fallback to v5 'utils.id'
    if (typeof ethers.id === 'function') {
        // ethers v6+
        return ethers.id(data);
    } else if (ethers.utils && typeof ethers.utils.id === 'function') {
        // ethers v5
        return ethers.utils.id(data);
    } else {
        console.error("Cannot find 'ethers.id' or 'ethers.utils.id'. Unable to generate game ID.");
        // Fallback or throw error - returning a simple hash might be problematic
        // Throwing an error is safer to prevent unexpected behavior.
        throw new Error("Unsupported ethers version for ID generation.");
    }
};

// Sanitize wallet address for use as PeerJS ID part (basic example)
const sanitizeForPeerId = (address) => {
    return address.replace(/[^a-zA-Z0-9_-]/g, '');
};

const MIN_PLAYERS = 2;

export const RaceProvider = ({ children }) => {
    // --- User State ---
    const [walletAddress, setWalletAddress] = useState('');
    const [balance, setBalance] = useState('0');
    const [signer, setSigner] = useState(null);

    // --- Room State ---
    const [roomCode, setRoomCode] = useState('');
    const [players, setPlayers] = useState([]); // { address, ready, color, isBot, hasStakedLocally, signature, peerId? }
    const [isHost, setIsHost] = useState(false);
    const [stakeAmount, setStakeAmount] = useState('0');
    const [isReady, setIsReady] = useState(false);

    // --- Game State ---
    const [gameId, setGameId] = useState(null);
    const [gameContractTimestamp, setGameContractTimestamp] = useState(null);
    const [onChainGameStatus, setOnChainGameStatus] = useState(0); // 0: NonExistent, 1: Created, 2: InProgress, 3: Completed
    const [gameStarted, setGameStarted] = useState(false);
    const [gameEnded, setGameEnded] = useState(false);
    const [winner, setWinner] = useState(null);
    const [currentLap, setCurrentLap] = useState(0);
    const [totalLaps] = useState(3);

    // --- Contract Interaction ---
    const [contract, setContract] = useState(null);
    const contractAddress = '0x0dfFacfEB3B20a64A90EdD175494367c6Ce1e866';
    const contractABI = [ /* ... ABI remains the same ... */
        "function createGame(bytes32 gameId, address[] calldata players, uint256 stakeAmount) external",
        "function stake(bytes32 gameId) external payable",
        "function submitResult(bytes32 gameId, address winner, bytes[] calldata signatures) external",
        "function getGamePlayers(bytes32 gameId) external view returns (address[])",
        "function hasPlayerStaked(bytes32 gameId, address player) external view returns (bool)",
        "function getGameStatus(bytes32 gameId) external view returns (uint8)",
        "function getGameExpiration(bytes32 gameId) external view returns (uint256)",
        "function games(bytes32 gameId) external view returns (uint8 status, uint256 totalStaked, uint256 requiredStake, uint256 createdAt, uint256 expiresAt)"
    ];
    const [isProcessing, setIsProcessing] = useState(false);

    // --- PeerJS State ---
    const peerRef = useRef(null); // Stores the PeerJS instance
    const hostConnectionRef = useRef(null); // Client's connection to the host
    const clientConnectionsRef = useRef({}); // Host's connections to clients { peerId: DataConnection }
    const localPeerIdRef = useRef(null); // This peer's ID

    // --- Wallet & Contract Initialization --- (Mostly Same)
    const fetchBalance = useCallback(async (address, provider) => {
        // ... (same as before) ...
        try {
            if (!address || !provider) {
                console.warn("fetchBalance skipped: Address or provider missing.");
                return;
            }
            console.log("Fetching balance for:", address);
            const rawBalance = await provider.getBalance(address);
            console.log("Raw balance:", rawBalance.toString());

            // Format the balance correctly based on ethers version
            let formattedBalance;
            if (typeof ethers.formatEther === 'function') {
                // ethers v6+
                formattedBalance = ethers.formatEther(rawBalance);
                console.log("Formatted balance (v6):", formattedBalance);
            } else if (ethers.utils && typeof ethers.utils.formatEther === 'function') {
                // ethers v5
                formattedBalance = ethers.utils.formatEther(rawBalance);
                console.log("Formatted balance (v5):", formattedBalance);
            } else {
                 console.error("Cannot determine ethers version to format balance.");
                 throw new Error("Unsupported ethers version for formatting.");
            }

            // Display the exact balance with 4 decimal places
            setBalance(parseFloat(formattedBalance).toFixed(4));
            console.log("Balance state updated to:", parseFloat(formattedBalance).toFixed(4));
        } catch (error) {
            console.error("Error fetching balance in RaceContext:", error);
            console.error("Error details:", error.message);
            setBalance("0.0000");
            toast.error("Failed to fetch balance."); // This toast should now only appear on genuine errors
        }
    }, []);

    const initializeContract = useCallback((currentSigner) => {
        // ... (same as before) ...
        if (!currentSigner) return;
        try {
            const gameContract = new ethers.Contract(contractAddress, contractABI, currentSigner);
            setContract(gameContract);
            console.log("Contract initialized");
        } catch (error) {
            console.error("Error initializing contract:", error);
            toast.error("Failed to initialize game contract.");
        }
    }, []);

    const connectWallet = useCallback(async () => {
        // ... (same as before, ensures signer is set) ...
        if (window.ethereum) {
            try {
                setIsProcessing(true);
                toast.info("Connecting wallet...");
                const provider = new ethers.BrowserProvider(window.ethereum);
                const accounts = await provider.send("eth_requestAccounts", []);
                if (accounts.length > 0) {
                    const currentSigner = await provider.getSigner();
                    setWalletAddress(currentSigner.address);
                    setSigner(currentSigner);
                    await fetchBalance(currentSigner.address, provider);
                    initializeContract(currentSigner);
                    toast.success("Wallet connected!");
                }
            } catch (error) {
                console.error("Error connecting wallet:", error);
                toast.error(`Wallet connection failed: ${error.message}`);
            } finally {
                setIsProcessing(false);
            }
        } else {
            toast.error("MetaMask not detected. Please install it.");
        }
    }, [fetchBalance, initializeContract]);

    const sendToHost = useCallback((message) => {
        if (hostConnectionRef.current && hostConnectionRef.current.open) {
            console.log("Client: Sending message to host:", message);
            hostConnectionRef.current.send(message);
        } else {
            console.error("Client: Cannot send message, no open connection to host.");
            toast.error("Not connected to host.");
        }
    }, []);

    const broadcastToClients = useCallback((message, excludePeerId = null) => {
        if (!isHost) return;
        console.log("Host: Broadcasting message:", message, "Excluding:", excludePeerId);
        Object.values(clientConnectionsRef.current).forEach(conn => {
            if (conn && conn.open && conn.peer !== excludePeerId) {
                conn.send(message);
            }
        });
    }, [isHost]);

    const resetGameLocally = useCallback((newGameId) => {
        setGameStarted(false);
        setGameEnded(false);
        setWinner(null);
        setCurrentLap(0);
        setIsReady(false);
        setPlayers(prev => prev.map(player => ({
            ...player,
            ready: player.isBot ? true : false,
            hasStakedLocally: false,
            signature: null
        })));
        setOnChainGameStatus(0);
        setGameId(newGameId); // Use provided or null
        setGameContractTimestamp(null);
        setIsProcessing(false);
        console.log("Local game state reset.");
        // Don't show toast here, let the calling function handle user feedback
    }, []); // No dependencies needed for local reset
    
    const checkAndSubmitResult = useCallback(async () => {
        // ... (validation: walletAddress === winner, contract, !isProcessing, status === 2) ...
        if (walletAddress !== winner || !contract || isProcessing || onChainGameStatus !== 2) return;

        const nonWinners = players.filter(p => p.address !== winner && !p.isBot); // Exclude bots
        const collectedSignatures = nonWinners.map(p => p.signature).filter(sig => sig);

        if (collectedSignatures.length === nonWinners.length && nonWinners.length > 0) {
            console.log("All signatures collected:", collectedSignatures);
            toast.info("All signatures collected. Submitting result...");
            setIsProcessing(true);
            try {
                const tx = await contract.submitResult(gameId, winner, collectedSignatures);
                await tx.wait();
                setOnChainGameStatus(3);
                toast.success("Result submitted successfully! Winnings distributed.");
                console.log("Result submitted to contract.");
                if(signer) await fetchBalance(walletAddress, signer.provider);
            } catch (error) {
                console.error("Error submitting result:", error);
                toast.error(`Result submission failed: ${error.message || error}`);
            } finally {
                setIsProcessing(false);
            }
        } else {
            console.log(`Waiting for signatures... Got ${collectedSignatures.length}/${nonWinners.length}`);
        }
    }, [contract, gameId, winner, players, isProcessing, onChainGameStatus, walletAddress, signer, fetchBalance]);
    
    const checkAllPlayersStaked = useCallback(async () => {
        // ... (validation: contract, isHost, status === 1) ...
        if (!contract || !isHost || onChainGameStatus !== 1) return;

        try {
            // Check contract status directly - more reliable than local counts
            const status = await contract.getGameStatus(gameId);
            setOnChainGameStatus(status);

            if (status === 2) { // GameStatus.InProgress
                console.log("All players staked (contract verified)! Starting race...");
                toast.success("All players ready! Starting race...");
                broadcastToClients({ type: 'StartRace' }); // Inform clients
                setGameStarted(true); // Start for host
            } else {
                console.log("Waiting for other players to stake (contract status check)...");
            }
        } catch (error) {
            console.error("Error checking game status:", error);
            toast.error("Failed to check game status.");
        }
    }, [contract, isHost, gameId, onChainGameStatus, broadcastToClients]);

    const callStake = useCallback(async () => {
        // ... (validation: contract, !isProcessing, status === 1) ...
        if (!contract || isProcessing || onChainGameStatus !== 1) return;
        const localPlayer = players.find(p => p.peerId === localPeerIdRef.current);
        if (!localPlayer || localPlayer.hasStakedLocally) return;

        let stakeAmountWei;
        let zeroValue; // Variable to hold the zero value for comparison

        if (typeof ethers.parseEther === 'function') {
            // ethers v6+
            stakeAmountWei = ethers.parseEther(stakeAmount || '0');
            zeroValue = ethers.Zero; // Use ethers.Zero for v6
        } else if (ethers.utils && typeof ethers.utils.parseEther === 'function') {
            // ethers v5
            stakeAmountWei = ethers.utils.parseEther(stakeAmount || '0');
            zeroValue = ethers.constants.Zero; // Use ethers.constants.Zero for v5
        } else {
            console.error("Cannot find 'ethers.parseEther' or 'ethers.utils.parseEther'.");
            toast.error("Unsupported ethers version for parsing stake.");
            return;
        }

        // Compare using the appropriate method/operator based on type
        let isStakeZeroOrLess;
        if (typeof stakeAmountWei === 'bigint') {
             // Use standard comparison for bigint (v6)
             isStakeZeroOrLess = stakeAmountWei <= zeroValue;
        } else {
             // Use .lte() method for BigNumber (v5)
             isStakeZeroOrLess = stakeAmountWei.lte(zeroValue);
        }

        if (isStakeZeroOrLess) { toast.error("Stake must be > 0."); return; }


        setIsProcessing(true);
        toast.info("Staking MON...");
        try {
            console.log("Calling stake with:", gameId, stakeAmountWei.toString());
            const tx = await contract.stake(gameId, { value: stakeAmountWei });
            await tx.wait();

            // Update local state
            setPlayers(prev => prev.map(p => p.peerId === localPeerIdRef.current ? { ...p, hasStakedLocally: true } : p));

            toast.success("Successfully staked!");
            console.log("Stake successful for", walletAddress);

            // P2P: Inform others about staking
            if (isHost) {
                // Host broadcasts confirmation
                broadcastToClients({ type: 'StakeConfirmed', payload: { peerId: localPeerIdRef.current, address: walletAddress } });
                checkAllPlayersStaked(); // Host checks if game can start
            } else {
                // Client informs host
                sendToHost({ type: 'ClientStakeConfirmed', payload: { address: walletAddress } });
            }

        } catch (error) {
            console.error("Error staking:", error);
            toast.error(`Staking failed: ${error.message || error}`);
            setIsReady(false); // Mark as not ready on failure
            setPlayers(prev => prev.map(p => p.peerId === localPeerIdRef.current ? { ...p, ready: false, hasStakedLocally: false } : p));
            // P2P: Send un-ready update
            if (isHost) {
                 broadcastToClients({ type: 'PlayerUpdate', payload: { peerId: localPeerIdRef.current, data: { ready: false } } });
            } else {
                 sendToHost({ type: 'ClientUpdate', payload: { data: { ready: false } } });
            }
        } finally {
            setIsProcessing(false);
        }
    }, [contract, gameId, stakeAmount, isProcessing, onChainGameStatus, walletAddress, players, isHost, broadcastToClients, sendToHost, checkAllPlayersStaked]);

    const callCreateGame = useCallback(async () => {
        // ... (validation: isHost, contract, !isProcessing, status === 0) ...
        if (!isHost || !contract || isProcessing || onChainGameStatus !== 0) return;
        // ... (check players >= MIN_PLAYERS) ...
        const playerAddresses = players.map(p => p.address);
        if (playerAddresses.length < MIN_PLAYERS) { toast.error(`Need at least ${MIN_PLAYERS} players.`); return; }


        let stakeAmountWei;
        let zeroValue; // Variable to hold the zero value for comparison

        if (typeof ethers.parseEther === 'function') {
            // ethers v6+
            stakeAmountWei = ethers.parseEther(stakeAmount || '0');
            zeroValue = ethers.Zero; // Use ethers.Zero for v6
        } else if (ethers.utils && typeof ethers.utils.parseEther === 'function') {
            // ethers v5
            stakeAmountWei = ethers.utils.parseEther(stakeAmount || '0');
            zeroValue = ethers.constants.Zero; // Use ethers.constants.Zero for v5
        } else {
            console.error("Cannot find 'ethers.parseEther' or 'ethers.utils.parseEther'.");
            toast.error("Unsupported ethers version for parsing stake.");
            return;
        }

        // Compare using the appropriate method/operator based on type
        let isStakeZeroOrLess;
        if (typeof stakeAmountWei === 'bigint') {
             // Use standard comparison for bigint (v6)
             isStakeZeroOrLess = stakeAmountWei <= zeroValue;
        } else {
             // Use .lte() method for BigNumber (v5)
             isStakeZeroOrLess = stakeAmountWei.lte(zeroValue);
        }

        if (isStakeZeroOrLess) { toast.error("Stake must be > 0."); return; }


        setIsProcessing(true);
        toast.info("Creating game on blockchain...");
        try {
            console.log("Calling createGame with:", gameId, playerAddresses, stakeAmountWei.toString());
            const tx = await contract.createGame(gameId, playerAddresses, stakeAmountWei);
            await tx.wait();

            const gameData = await contract.games(gameId);
            const creationTimestamp = gameData.createdAt.toNumber();
            setGameContractTimestamp(creationTimestamp);
            setOnChainGameStatus(1);

            console.log("Game created on chain, Timestamp:", creationTimestamp);
            toast.success("Game created on blockchain!");

            // P2P: Broadcast confirmation to clients
            broadcastToClients({ type: 'GameCreatedOnChain', payload: { gameId, timestamp: creationTimestamp } });

            if (isReady) { // If host was already ready, trigger stake now
                await callStake();
            }

        } catch (error) {
            console.error("Error creating game on contract:", error);
            toast.error(`Failed to create game: ${error.message || error}`);
            setOnChainGameStatus(0);
        } finally {
            setIsProcessing(false);
        }
    }, [contract, isHost, players, stakeAmount, gameId, isProcessing, onChainGameStatus, isReady, broadcastToClients, callStake]);

    const handleP2PMessage = useCallback((message, senderPeerId) => {
        console.log("Handling P2P Message:", message.type, "from", senderPeerId);
        switch (message.type) {
            // --- Client receiving messages from Host ---
            case 'RoomState': // Host sends full state to newly joined client
                if (!isHost) {
                    console.log("Client: Received initial room state", message.payload);
                    setPlayers(message.payload.players);
                    setGameId(message.payload.gameId);
                    setStakeAmount(message.payload.stakeAmount); // Use host's stake amount
                    setOnChainGameStatus(message.payload.onChainGameStatus);
                    setGameContractTimestamp(message.payload.gameContractTimestamp);
                    toast.success(`Joined room ${roomCode}!`);
                }
                break;
            case 'PlayerJoined': // Host informs clients about a new player
                 if (!isHost && message.payload.peerId !== localPeerIdRef.current) { // Don't add self again
                    setPlayers(prev => {
                        // Avoid duplicates
                        if (prev.some(p => p.peerId === message.payload.peerId)) return prev;
                        return [...prev, message.payload];
                    });
                 }
                break;
            case 'PlayerLeft': // Host informs clients that a player left
                if (!isHost) {
                    setPlayers(prev => prev.filter(p => p.peerId !== message.payload.peerId));
                }
                break;
            case 'PlayerUpdate': // Host relays updates about a player
                setPlayers(prev => prev.map(p => p.peerId === message.payload.peerId ? { ...p, ...message.payload.data } : p));
                // If the update is about the local player (e.g., host confirming stake), update local state too
                if (message.payload.peerId === localPeerIdRef.current) {
                    if (message.payload.data.ready !== undefined) setIsReady(message.payload.data.ready);
                    // Update other relevant local states if needed
                }
                break;
            case 'GameCreatedOnChain': // Host confirms game created on contract
                setGameId(message.payload.gameId);
                setGameContractTimestamp(message.payload.timestamp);
                setOnChainGameStatus(1);
                toast.info("Game created on chain. Ready to stake!");
                if (isReady) { // If local player was already ready, trigger stake
                    callStake();
                }
                break;
            case 'StakeConfirmed': // Host confirms a player staked (could also be direct from player in mesh)
                 setPlayers(prev => prev.map(p => p.peerId === message.payload.peerId ? { ...p, hasStakedLocally: true } : p));
                 // Host checks if game can start
                 if (isHost) checkAllPlayersStaked();
                break;
            case 'StartRace': // Host confirms all staked, game starts
                setGameStarted(true);
                break;
            case 'ResultSignature': // Host relays signature from another player
                 if (walletAddress === winner) { // Only winner needs to collect
                    setPlayers(prev => prev.map(p => p.peerId === message.payload.peerId ? { ...p, signature: message.payload.signature } : p));
                    checkAndSubmitResult(); // Winner checks if all signatures are collected
                 }
                break;
            case 'GameReset': // Host informs clients game is reset
                 if (!isHost) {
                    resetGameLocally(message.payload.newGameId); // Reset client state
                 }
                 break;

            // --- Host receiving messages from Client ---
            case 'RequestRoomState': // Client requests initial state
                if (isHost && clientConnectionsRef.current[senderPeerId]) {
                    console.log("Host: Sending room state to", senderPeerId);
                    const currentState = {
                        players: players, // Send current player list
                        gameId: gameId,
                        stakeAmount: stakeAmount,
                        onChainGameStatus: onChainGameStatus,
                        gameContractTimestamp: gameContractTimestamp
                    };
                    clientConnectionsRef.current[senderPeerId].send({ type: 'RoomState', payload: currentState });
                }
                break;
            case 'ClientUpdate': // Client sends its own update (e.g., ready status)
                if (isHost) {
                    // Validate sender is in the game?
                    const updatedPlayer = players.find(p => p.peerId === senderPeerId);
                    if (updatedPlayer) {
                        // Update host's state
                        const newPlayers = players.map(p => p.peerId === senderPeerId ? { ...p, ...message.payload.data } : p);
                        setPlayers(newPlayers);
                        // Broadcast the update to other clients
                        broadcastToClients({ type: 'PlayerUpdate', payload: { peerId: senderPeerId, data: message.payload.data } }, senderPeerId); // Exclude sender

                        // If the update was 'ready: true', check if host needs to create game
                        if (message.payload.data.ready === true && onChainGameStatus === 0) {
                             // Maybe trigger createGame if host is also ready? Logic depends on desired flow.
                             // For now, host creates game when THEY click ready.
                        }
                        // If the update was 'ready: true' and game is created, check if client needs to stake (handled by client itself)
                    }
                }
                break;
             case 'ClientStakeConfirmed': // Client informs host they staked successfully
                 if (isHost) {
                     const updatedPlayer = players.find(p => p.peerId === senderPeerId);
                     if (updatedPlayer) {
                         const newPlayers = players.map(p => p.peerId === senderPeerId ? { ...p, hasStakedLocally: true } : p);
                         setPlayers(newPlayers);
                         // Broadcast confirmation
                         broadcastToClients({ type: 'StakeConfirmed', payload: { peerId: senderPeerId, address: updatedPlayer.address } }, senderPeerId);
                         // Check if game can start
                         checkAllPlayersStaked();
                     }
                 }
                 break;
             case 'ClientSignature': // Client sends their signature to the host
                 if (isHost) {
                     // Host might relay this to the winner, or winner collects directly if connected
                     // Assuming host relays to winner for simplicity here
                     const winnerPlayer = players.find(p => p.address === winner);
                     if (winnerPlayer && winnerPlayer.peerId && clientConnectionsRef.current[winnerPlayer.peerId]) {
                         clientConnectionsRef.current[winnerPlayer.peerId].send({
                             type: 'ResultSignature',
                             payload: { peerId: senderPeerId, signature: message.payload.signature }
                         });
                     } else if (walletAddress === winner) {
                         // If host IS the winner, handle it directly
                         setPlayers(prev => prev.map(p => p.peerId === senderPeerId ? { ...p, signature: message.payload.signature } : p));
                         checkAndSubmitResult();
                     }
                 }
                 break;

            default:
                console.warn("Unknown P2P message type:", message.type);
        }
    }, [isHost, players, roomCode, gameId, stakeAmount, onChainGameStatus, gameContractTimestamp, isReady, winner, walletAddress, checkAndSubmitResult, checkAllPlayersStaked, callStake, resetGameLocally, broadcastToClients]); // Added dependencies

    const setupConnectionListeners = useCallback((conn) => {
        conn.on('data', (data) => {
            console.log(`Data received from ${conn.peer}:`, data);
            handleP2PMessage(data, conn.peer); // Pass peerId for context
        });

        conn.on('open', () => {
            console.log(`Data connection opened with ${conn.peer}`);
            // Client: Request initial state from host upon connection
            if (!isHost) {
                console.log("Client: Requesting room state from host", conn.peer);
                conn.send({ type: 'RequestRoomState' });
            }
        });

        conn.on('close', () => {
            console.log(`Data connection closed with ${conn.peer}`);
            toast.info(`Player ${conn.peer.slice(0,6)}... disconnected.`);
            // Host: Remove client connection and player
            if (isHost) {
                delete clientConnectionsRef.current[conn.peer];
                const leavingPlayerAddress = players.find(p => p.peerId === conn.peer)?.address;
                if (leavingPlayerAddress) {
                    const updatedPlayers = players.filter(p => p.peerId !== conn.peer);
                    setPlayers(updatedPlayers);
                    // Broadcast player left message
                    broadcastToClients({ type: 'PlayerLeft', payload: { address: leavingPlayerAddress, peerId: conn.peer } }, conn.peer); // Exclude sender
                }
            } else {
                // Client: Lost connection to host, handle appropriately (e.g., show error, try reconnecting, leave room)
                toast.error("Lost connection to host!");
                disconnectPeer(); // Simple cleanup for now
                // navigate('/race'); // Redirect to lobby
            }
        });

        conn.on('error', (err) => {
            console.error(`Data connection error with ${conn.peer}:`, err);
            toast.error(`P2P connection error with ${conn.peer.slice(0,6)}...`);
        });
    }, [isHost, players, handleP2PMessage]); // Include players to access player list when handling disconnect


    // --- P2P Communication Setup ---
    const initializePeer = useCallback((id) => {
        if (peerRef.current) {
            console.log("Peer already initialized, destroying old one.");
            peerRef.current.destroy(); // Clean up existing peer
        }
        console.log(`Initializing PeerJS with ID: ${id}`);
        localPeerIdRef.current = id;

        // Use default PeerServer for testing. For production, configure host/port/path.
        const peer = new Peer(id, {
            // debug: 2 // 0: Errors, 1: Warnings, 2: Info, 3: Debug
        });
        peerRef.current = peer;

        peer.on('open', (peerId) => {
            console.log('PeerJS connection open. My Peer ID is:', peerId);
            toast.info(`P2P Active: ${peerId.slice(0,10)}...`);
            localPeerIdRef.current = peerId; // Update with actual ID from server
        });

        peer.on('connection', (conn) => {
            console.log(`Incoming connection from ${conn.peer}`);
            toast.info(`Player ${conn.peer.slice(0,6)}... connected.`);
            setupConnectionListeners(conn); // Setup listeners for this new connection

            // Host: Store client connection
            if (isHost) {
                clientConnectionsRef.current[conn.peer] = conn;
                console.log("Host: Stored connection from", conn.peer);
            }
        });

        peer.on('disconnected', () => {
            console.warn('PeerJS disconnected from signaling server. Attempting to reconnect...');
            toast.warn("P2P connection lost. Reconnecting...");
            // PeerJS attempts reconnection automatically
            // peer.reconnect(); // Manual reconnect if needed
        });

        peer.on('close', () => {
            console.error('PeerJS connection closed permanently.');
            toast.error("P2P connection closed.");
            peerRef.current = null;
            localPeerIdRef.current = null;
            // TODO: Handle UI state reset or attempt re-initialization?
        });

        peer.on('error', (err) => {
            console.error('PeerJS error:', err);
            toast.error(`P2P Error: ${err.type}`);
            if (err.type === 'unavailable-id') {
                // Handle ID collision - maybe try a different ID?
                toast.error(`P2P ID ${id} is unavailable. Please try again.`);
                // Potentially call disconnectPeer() and prompt user action
            }
            // Handle other errors like network issues, server errors etc.
        });

    }, [isHost,setupConnectionListeners]); // isHost needed to differentiate connection handling

    const disconnectPeer = useCallback(() => {
        console.log("Disconnecting PeerJS...");
        if (peerRef.current) {
            peerRef.current.destroy(); // Destroys peer, closes connections
            peerRef.current = null;
        }
        hostConnectionRef.current = null;
        clientConnectionsRef.current = {};
        localPeerIdRef.current = null;
        setPlayers([]); // Clear players on disconnect
        setRoomCode('');
        setIsHost(false);
        // Reset other relevant states
        console.log("PeerJS disconnected and cleaned up.");
    }, []);

    // Setup listeners for a specific DataConnection
    
    // --- P2P Message Handling ---
    
    // Send message to Host (Client only)
    

    // Broadcast message to all connected clients (Host only)
    

    // --- Room Management ---
    const createRoom = useCallback(() => {
        if (!walletAddress) {
            toast.error("Connect wallet first!");
            return null;
        }
        if (peerRef.current) {
            toast.warn("Already in a room or P2P active. Disconnect first.");
            return null;
        }

        const newRoomCode = Math.floor(100000 + Math.random() * 900000).toString();
        const newGameId = generateGameId(newRoomCode);

        setRoomCode(newRoomCode);
        setGameId(newGameId);
        setIsHost(true);
        const hostPlayer = {
            address: walletAddress,
            peerId: newRoomCode, // Host uses roomCode as PeerJS ID
            ready: false,
            color: getRandomNeonColor(),
            hasStakedLocally: false,
            signature: null
        };
        setPlayers([hostPlayer]);
        resetGameLocally(newGameId); // Reset local game state

        // Initialize PeerJS with roomCode as ID
        initializePeer(newRoomCode);

        toast.success(`Room ${newRoomCode} created! Share the code.`);
        return newRoomCode;
    }, [walletAddress, initializePeer,resetGameLocally]); // Removed resetGameLocally dependency

    const joinRoom = useCallback((code) => {
        if (!walletAddress) {
            toast.error("Connect wallet first!");
            return;
        }
         if (peerRef.current) {
            toast.warn("Already in a room or P2P active. Disconnect first.");
            return;
        }

        // Generate a unique PeerJS ID for the client
        const clientPeerId = `client-${sanitizeForPeerId(walletAddress.slice(2, 12))}-${Date.now().toString().slice(-4)}`;
        initializePeer(clientPeerId); // Initialize client's PeerJS

        // Wait briefly for peer to initialize before attempting connection
        setTimeout(() => {
            if (!peerRef.current) {
                toast.error("P2P initialization failed. Cannot join room.");
                disconnectPeer();
                return;
            }

            console.log(`Client: Attempting to connect to host Peer ID: ${code}`);
            const conn = peerRef.current.connect(code, { reliable: true }); // Connect to host (using roomCode as host's peerId)

            if (conn) {
                hostConnectionRef.current = conn; // Store connection to host
                setupConnectionListeners(conn); // Setup listeners for this connection

                setRoomCode(code); // Set room code locally
                setIsHost(false);
                resetGameLocally(null); // Reset local game state, gameId will come from host

                // Add self to player list temporarily, will be overwritten by host's RoomState
                const joiningPlayer = { address: walletAddress, peerId: clientPeerId, ready: false, color: getRandomNeonColor(), hasStakedLocally: false, signature: null };
                setPlayers([joiningPlayer]);

                toast.info(`Attempting to join room ${code}...`);
            } else {
                console.error("Failed to initiate connection to host.");
                toast.error("Failed to initiate connection to host.");
                disconnectPeer();
            }
        }, 1500); // Delay to allow PeerJS initialization

    }, [walletAddress, initializePeer, setupConnectionListeners, disconnectPeer, resetGameLocally]); // Removed resetGameLocally

    // --- Staking and Readiness ---
    const setPlayerStake = useCallback((amount) => {
        // Validate stake amount
        const parsedAmount = parseFloat(amount);
        if (isNaN(parsedAmount) || parsedAmount < 0) {
            toast.warn("Invalid stake amount.");
            setStakeAmount('0');
        } else {
            setStakeAmount(amount);
        }
        // Host broadcasts new stake amount? Or only when creating game?
        // Let's assume host sets it and it's fixed when game is created.
        // Clients will receive it in RoomState or GameCreatedOnChain.
    }, []);

    const setPlayerReady = useCallback(async (ready) => {
        if (isProcessing) {
            toast.warn("Please wait for the current action to complete.");
            return;
        }
        if (ready && parseFloat(stakeAmount) <= 0) {
             toast.warn("Stake amount must be greater than 0 to be ready.");
             return;
        }

        setIsReady(ready); // Update local state immediately

        // Update player list locally for immediate feedback
        setPlayers(prev =>
            prev.map(player =>
                player.peerId === localPeerIdRef.current
                    ? { ...player, ready }
                    : player
            )
        );

        // Send update via P2P
        if (isHost) {
            // Host updates self and broadcasts
            broadcastToClients({ type: 'PlayerUpdate', payload: { peerId: localPeerIdRef.current, data: { ready } } });
        } else {
            // Client sends update to host
            sendToHost({ type: 'ClientUpdate', payload: { data: { ready } } });
        }

        // Handle staking/game creation logic
        if (ready) {
            if (onChainGameStatus === 1) { // Game already created, try to stake
                await callStake();
            } else if (onChainGameStatus === 0 && isHost) { // Host is ready, game not created
                await callCreateGame(); // Create game, stake will trigger after confirmation
            } else if (onChainGameStatus === 0 && !isHost) { // Client is ready, game not created
                toast.info("Waiting for the host to create the game on the blockchain...");
            }
        } else {
            // Logic for un-readying (if needed, e.g., contract allows unstaking)
            console.log("Player marked as not ready.");
        }
    }, [isProcessing, stakeAmount, onChainGameStatus, isHost, broadcastToClients, sendToHost, callStake, callCreateGame]); // Added P2P functions

    // --- Contract Calls --- (Mostly Same, added P2P confirmations)
    
    
    
    // --- Game Lifecycle ---
    const startGame = useCallback(() => {
        // This is now mainly triggered by checkAllPlayersStaked or for bot games
        if (players.some(p => p.isBot)) {
             console.log("Starting bot game locally");
             setGameStarted(true);
        } else {
             console.warn("startGame called directly - should be triggered by contract status change via P2P");
             if (isHost) checkAllPlayersStaked(); // Host can re-check status
        }
    }, [players, isHost, checkAllPlayersStaked]);

    const endGame = useCallback(async (winnerAddress) => {
        // ... (validation: !gameEnded) ...
        if (gameEnded) return;

        setWinner(winnerAddress);
        setGameEnded(true);
        toast.info(`Race finished! Winner: ${winnerAddress.slice(0, 6)}...`);

        if (contract && onChainGameStatus === 2 && !players.some(p => p.isBot)) {
            setIsProcessing(true);
            toast.info("Collecting signatures...");
            try {
                // ... (Fetch timestamp if needed) ...
                if (!gameContractTimestamp) {
                    const gameData = await contract.games(gameId);
                    const ts = gameData.createdAt.toNumber();
                    if (!ts) throw new Error("Game creation timestamp not found!");
                    setGameContractTimestamp(ts);
                }
                const finalTimestamp = gameContractTimestamp || (await contract.games(gameId)).createdAt.toNumber(); // Ensure we have it

                // ... (Generate messageHash and ethSignedMessageHash - SAME AS BEFORE) ...
                const messageHash = ethers.utils.solidityKeccak256(
                    ["bytes32", "address", "address", "uint256", "uint256"],
                    [gameId, winnerAddress, contractAddress, (await signer.provider.getNetwork()).chainId, finalTimestamp]
                );
                const ethSignedMessageHash = ethers.utils.solidityKeccak256(
                    ["string", "bytes32"],
                    ["\x19Ethereum Signed Message:\n32", messageHash]
                );


                if (walletAddress !== winnerAddress) {
                    // Non-winner signs and sends signature
                    console.log("Signing result hash:", ethSignedMessageHash);
                    const signature = await signer.signMessage(ethers.utils.arrayify(ethSignedMessageHash));
                    console.log("My Signature:", signature);
                    // P2P: Send signature to Host (or directly to winner if mesh)
                    sendToHost({ type: 'ClientSignature', payload: { signature } });
                    setPlayers(prev => prev.map(p => p.peerId === localPeerIdRef.current ? { ...p, signature: signature } : p));
                    toast.info("Signature sent.");
                    setIsProcessing(false); // Done processing for non-winner
                } else {
                    // Winner waits to collect signatures (via handleP2PMessage)
                    checkAndSubmitResult(); // Check if signatures arrived
                }

            } catch (error) {
                console.error("Error during signature process:", error);
                toast.error(`Signature failed: ${error.message || error}`);
                setIsProcessing(false);
            }
        } else {
             console.log("Game ended (Bot game or contract not ready).");
             if (gameEnded && !isProcessing) setIsProcessing(false); // Ensure processing is false if no contract call needed
        }
    }, [contract, gameId, walletAddress, signer, gameEnded, onChainGameStatus, gameContractTimestamp, players, isHost, sendToHost, checkAndSubmitResult]); // Added P2P functions

    
    // Renamed to avoid conflict with context resetGame
    

    // Called by UI to reset for next game
    const resetGameForNextRound = useCallback(() => {
        const newGameId = generateGameId(roomCode);
        resetGameLocally(newGameId); // Reset local state
        toast.info("Ready for a new race!");
        // P2P: Host informs clients of reset and new gameId
        if (isHost) {
            broadcastToClients({ type: 'GameReset', payload: { newGameId } });
        }
    }, [roomCode, isHost, broadcastToClients, resetGameLocally]);


    // --- Bot Management --- (Mostly Same, added P2P broadcast)
    const addBotPlayer = useCallback(() => {
        if (!isHost) return;
        const botAddress = `0xBot${Math.floor(Math.random() * 1000000).toString().padStart(6, '0')}`;
        const botColor = getRandomNeonColor();
        const newBot = {
            address: botAddress,
            peerId: botAddress, // Bots need a unique ID too
            ready: true,
            color: botColor,
            isBot: true,
            hasStakedLocally: true,
            signature: null
        };
        setPlayers(prev => [...prev, newBot]);
        // P2P: Broadcast new bot player
        broadcastToClients({ type: 'PlayerJoined', payload: newBot });
    }, [isHost, broadcastToClients]);

    // --- Misc ---
    const getRandomNeonColor = () => { /* ... same as before ... */
        const neonColors = [
          '#ff00ff', '#00ffff', '#ff3300', '#33ff00', '#ff0099',
          '#00ff99', '#9900ff', '#ffff00', '#2222f7', '#bd2046',
        ];
        return neonColors[Math.floor(Math.random() * neonColors.length)];
    };

    // --- Effects ---
    // Check wallet connection on mount (Mostly Same)
    useEffect(() => {
        // ... (checkWallet, handleAccountsChanged logic same as before) ...
        const checkWallet = async () => {
            if (window.ethereum) {
                try {
                    // Check if accounts are already available (user connected elsewhere)
                    const accounts = await window.ethereum.request({ method: 'eth_accounts' });
                    if (accounts.length > 0 && !walletAddress) { // Only set if not already set by context logic
                        console.log("RaceContext: Detected existing connection:", accounts[0]);
                        // Use ethers v6 BrowserProvider
                        let provider;
                        try {
                            provider = new ethers.BrowserProvider(window.ethereum);
                        } catch (error) {
                             // Fallback for older ethers versions if needed, though BrowserProvider is standard now
                             console.warn("Falling back to Web3Provider (might indicate older ethers version)");
                             provider = new ethers.providers.Web3Provider(window.ethereum);
                        }
                        const currentSigner = await provider.getSigner();
                        setWalletAddress(currentSigner.address);
                        setSigner(currentSigner);
                        await fetchBalance(currentSigner.address, provider);
                        initializeContract(currentSigner);
                        // Use a less intrusive notification or none at all for auto-sync
                        // toast.info("Wallet state synced.", { autoClose: 1500 });
                        console.log("RaceContext: Wallet state synced automatically.");
                    } else if (accounts.length === 0 && walletAddress) {
                        // User disconnected from MetaMask side while context was active
                        console.log("RaceContext: Detected disconnection via eth_accounts.");
                        // Reset relevant state, handled by accountsChanged listener as well
                        setWalletAddress('');
                        setSigner(null);
                        setBalance('0');
                        setContract(null);
                        // Optionally disconnect P2P if in a room
                        // disconnectPeer();
                    }
                } catch (error) {
                    console.error("RaceContext: Error checking existing connection:", error);
                    // Avoid showing error toast for this passive check
                }
            } else {
                 console.log("RaceContext: No window.ethereum detected on mount.");
            }
         };
        const handleAccountsChanged = async (accounts) => { 
            console.log("RaceContext: accountsChanged event detected", accounts);
            if (accounts.length === 0) {
                // Wallet disconnected externally (e.g., user locked MetaMask or disconnected site)
                if (walletAddress) { // Only show toast if we thought we were connected
                     toast.info("Wallet disconnected.");
                }
                // Reset context state
                setWalletAddress('');
                setSigner(null);
                setBalance('0');
                setContract(null);
                // If in a room, disconnecting P2P might be necessary
                // disconnectPeer();
            } else if (accounts[0] !== walletAddress) {
                // Switched account
                toast.info("Wallet account changed. Re-initializing context...");
                // Re-initialize with the new account
                let provider;
                 try {
                     provider = new ethers.BrowserProvider(window.ethereum);
                 } catch (error) {
                      console.warn("Falling back to Web3Provider (might indicate older ethers version)");
                      provider = new ethers.providers.Web3Provider(window.ethereum);
                 }
                const currentSigner = await provider.getSigner();
                setWalletAddress(currentSigner.address);
                setSigner(currentSigner);
                await fetchBalance(currentSigner.address, provider);
                initializeContract(currentSigner);
                // Resetting game/room state might be needed depending on game logic
                // resetGameLocally(null); // Example reset
                // disconnectPeer(); // Example reset
            }
        };
        checkWallet(); // Check on mount

        if (window.ethereum && window.ethereum.on) {
            window.ethereum.on('accountsChanged', handleAccountsChanged);
            console.log("RaceContext: Added accountsChanged listener.");
        }

        // Cleanup listener and PeerJS connection
        return () => {
            if (window.ethereum && window.ethereum.removeListener) {
                window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
                console.log("RaceContext: Removed accountsChanged listener.");
            }
            // Ensure PeerJS is disconnected on full context unmount
            // disconnectPeer(); // Keep this if context unmount means leaving the feature entirely
        };
    // Rerun effect if essential functions change, or if walletAddress changes externally
    // Avoid adding connectWallet here as it's not used for initialization anymore
    }, [fetchBalance, initializeContract, disconnectPeer, walletAddress]);

    // No separate P2P setup effect needed, handled by create/join room


    const value = {
        walletAddress, balance, signer,
        roomCode, players, isHost, stakeAmount, isReady,
        gameId, onChainGameStatus, gameStarted, gameEnded, winner,
        currentLap, totalLaps, contract, isProcessing,
        // Expose functions needed by components
        // connectWallet, // No longer expose connectWallet for lobby use
        createRoom, joinRoom, setPlayerStake, setPlayerReady,
        startGame, endGame,
        resetGame: resetGameForNextRound, // Expose the UI reset function
        setCurrentLap, addBotPlayer,
        disconnectPeer, // Expose disconnect function
    };

    return (
        <RaceContext.Provider value={value}>
            {children}
            {/* Moved ToastContainer to App.jsx or index.jsx if needed globally */}
        </RaceContext.Provider>
    );
};