import { useEffect, useState, useRef } from 'react';
import { useParams, Navigate, useNavigate } from 'react-router-dom';
import { useRaceContext } from '../../context/RaceContext';
// Removed RoomLobby import
import RaceGame from './RaceGame';
import { toast } from 'react-toastify';
import { motion } from 'framer-motion'; // Import motion

// --- Game Lobby UI Component ---
const GameLobbyUI = () => {
    const {
        players, roomCode, isHost, stakeAmount, setPlayerStake,
        isReady, setPlayerReady, addBotPlayer, startGame,
        walletAddress, isProcessing, onChainGameStatus, totalLaps,
        disconnectPeer // Assuming disconnectPeer is the function to leave the room
    } = useRaceContext();
    const navigate = useNavigate();
    //const [singlePlayerMode, setSinglePlayerMode] = useState(false); // Example state for test mode
    console.log(`%c GameLobbyUI Render:`, 'color: orange; font-weight: bold;', { 
        playersFromContext: players, 
        stakeAmountFromContext: stakeAmount,
        roomCodeFromContext: roomCode,
        isHostFromContext: isHost,
        isReadyFromContext: isReady,
        onChainGameStatusFromContext: onChainGameStatus
    });
    
    const handleStakeChange = (e) => {
        if (isHost && onChainGameStatus === 0) {
            setPlayerStake(e.target.value);
        }
    };

    const handleReadyToggle = () => {
        // Prevent un-readying if game is already created/staked on chain
        if (isReady && onChainGameStatus > 0) {
            toast.warn("Cannot un-ready after game is created/staked on chain.");
            return;
        }
        setPlayerReady(!isReady);
    };

    const copyRoomCode = () => {
        if (roomCode) {
            navigator.clipboard.writeText(roomCode)
                .then(() => toast.success("Room code copied!"))
                .catch(() => toast.error("Failed to copy code."));
        }
    };

    const handleLeaveRoom = () => {
        disconnectPeer();
        navigate('/race'); // Navigate back to the main race lobby
    };

    const enableSinglePlayerMode = () => {
        setSinglePlayerMode(true);
        // Add bots automatically or provide a button
        addBotPlayer(); // Example: Add one bot
        toast.info("Test Mode Enabled: Added a bot. Add more if needed.");
    };

    const getStatusMessage = () => {
        if (isProcessing) return "Processing...";
        if (onChainGameStatus === 0 && isHost && parseFloat(stakeAmount) <= 0) return "Host must set a stake amount > 0.";
        if (onChainGameStatus === 0 && !isHost && parseFloat(stakeAmount) <= 0) return "Waiting for host to set stake amount.";
        if (onChainGameStatus === 1 && !isReady) return "Game created. Click Ready to stake!";
        if (onChainGameStatus === 1 && isReady) return "Staking in progress...";
        if (onChainGameStatus === 2 && !isHost) return "All players staked. Waiting for host to start.";
        if (onChainGameStatus === 2 && isHost && !players.every(p => p.ready)) return "All players staked. Waiting for players to ready up.";
        if (onChainGameStatus === 2 && isHost && players.every(p => p.ready)) return "Ready to start the race!";
        return ""; // Default empty message
    };

    // Determine if user can interact with buttons
    const canInteract = !isProcessing;
    // Host can start if game is created (status 1 or 2), enough players, and all are ready
    const canStartGame = isHost && 
                         players.length >= 2 && 
                         players.every(p => p.ready) && 
                         (onChainGameStatus === 2 || (singlePlayerMode && onChainGameStatus === 0)); // Allow start in test mode immediately

    return (
        <div className="min-h-screen bg-[#0f0f1a] text-white flex flex-col">
            {/* Navbar */}
            <div className="w-full bg-zinc-900/80 backdrop-blur-sm p-4 font-arcade shadow-lg flex justify-between items-center">
                <div className="text-4xl ml-2">MONarcade Racing</div>
                <div className="flex items-center space-x-4">
                    <div className="text-sm font-body">Room: {roomCode}</div>
                    <button
                        onClick={copyRoomCode}
                        className="text-[#1efaf3] hover:text-[#00c7cc] text-xs px-2 py-1 border border-[#1efaf3] rounded"
                        disabled={!roomCode}
                    >
                        Copy Code
                    </button>
                     <button
                        onClick={handleLeaveRoom}
                        className="text-red-500 hover:text-red-400 text-xs px-2 py-1 border border-red-500 rounded"
                    >
                        Leave Room
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex flex-col md:flex-row flex-grow p-4 gap-6">
                {/* Player list */}
                <div className="w-full md:w-1/3 bg-[#000016]/80 backdrop-blur-sm rounded-2xl border-4 border-[#1efaf3] p-6">
                    <h2 className="text-2xl font-display text-[#1efaf3] mb-6">Players ({players.length})</h2>
                    <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2"> {/* Added scroll */}
                        {players.map((player) => (
                            <div
                                key={player.address} // Use address as key
                                className={`flex items-center justify-between p-3 rounded-lg ${player.ready ? 'bg-[#1efaf3]/20' : 'bg-zinc-900/50'
                                    }`}
                            >
                                <div className="flex items-center overflow-hidden">
                                    <div
                                        className="w-6 h-6 rounded-full mr-3 flex-shrink-0"
                                        style={{ backgroundColor: player.color }}
                                    ></div>
                                    <div className="font-body truncate" title={player.address}>
                                        {player.isBot ? player.address.slice(0, 10) : `${player.address.slice(0, 6)}...${player.address.slice(-4)}`}
                                        {player.address === walletAddress && " (You)"}
                                        {player.isBot && " (Bot)"}
                                    </div>
                                </div>
                                <div className={`text-sm font-semibold flex-shrink-0 ml-2 ${player.ready ? 'text-green-400' : 'text-yellow-400'}`}>
                                    {player.hasStakedLocally && <span title="Staked">💰 </span>}
                                    {player.ready ? 'Ready' : 'Not Ready'}
                                </div>
                            </div>
                        ))}
                    </div>

                    {isHost && (
                        <div className="mt-6 text-center border-t border-zinc-700 pt-4">
                            <p className="text-[#e55a32] mb-2">You are the host</p>
                            {/* Simplified Add Bot button */}
                             <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={addBotPlayer}
                                disabled={!canInteract || players.length >= 10} // Max players check
                                className="mt-2 bg-purple-500 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-lg disabled:opacity-50 text-sm"
                            >
                                Add Bot
                            </motion.button>
                        </div>
                    )}
                </div>

                {/* Game settings */}
                <div className="w-full md:w-2/3 bg-[#000016]/80 backdrop-blur-sm rounded-2xl border-4 border-[#1efaf3] p-6">
                    <h2 className="text-2xl font-display text-[#1efaf3] mb-6">Game Settings</h2>

                    <div className="space-y-6">
                        {/* Stake Amount Input */}
                        <div>
                            <label className="block text-[#e55a32] mb-2 font-body">Stake Amount (MON)</label>
                            <input
                                type="number"
                                min="0"
                                step="0.001"
                                value={stakeAmount}
                                onChange={handleStakeChange}
                                // Host can set stake only before game creation, clients see host's value
                                disabled={!isHost || isReady || isProcessing || onChainGameStatus > 0}
                                className="w-full bg-zinc-900 border-2 border-[#1efaf3] rounded-lg px-4 py-2 text-white font-body disabled:opacity-50 disabled:cursor-not-allowed"
                                placeholder="Enter stake amount (must be > 0)"
                            />
                            <p className="text-sm text-gray-400 mt-1">
                                Amount each player will stake. Set by host before game creation.
                            </p>
                        </div>

                        {/* Ready Button */}
                        <div className="flex flex-col items-center">
                             <motion.button
                                whileHover={{ scale: canInteract ? 1.05 : 1 }}
                                whileTap={{ scale: canInteract ? 0.95 : 1 }}
                                onClick={handleReadyToggle}
                                disabled={!canInteract || (isReady && onChainGameStatus > 0) || (parseFloat(stakeAmount) <= 0 && onChainGameStatus === 0)} // Disable ready if stake is 0 before creation
                                className={`px-8 py-3 rounded-full font-bold text-lg w-48 ${isReady
                                        ? 'bg-red-600 hover:bg-red-700 text-white'
                                        : 'bg-[#00eff2] hover:bg-[#00c7cc] text-black'
                                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                            >
                                {isProcessing ? "Processing..." : (isReady ? 'Cancel Ready' : 'Ready to Race!')}
                            </motion.button>
                            <p className="text-sm text-gray-400 mt-2 h-4">{getStatusMessage()}</p>
                        </div>

                         {/* Start Game Button (Host Only) */}
                         {isHost && (
                            <div className="flex flex-col items-center border-t border-zinc-700 pt-4">
                                <motion.button
                                    whileHover={{ scale: canStartGame ? 1.05 : 1 }}
                                    whileTap={{ scale: canStartGame ? 0.95 : 1 }}
                                    onClick={startGame}
                                    disabled={!canStartGame || isProcessing}
                                    className="bg-[#ff3e9d] hover:bg-[#e02e7c] text-white font-bold py-3 px-6 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isProcessing ? "Processing..." : "Start Race"}
                                </motion.button>
                                {!canStartGame && onChainGameStatus === 2 && <p className="text-sm text-yellow-400 mt-2">Waiting for all players to be ready.</p>}
                                {!canStartGame && onChainGameStatus < 2 && players.length < 2 && <p className="text-sm text-yellow-400 mt-2">Need at least 2 players to start.</p>}
                            </div>
                        )}


                        {/* Game Rules */}
                        <div className="border-t border-zinc-700 pt-4">
                            <h3 className="text-xl font-display text-[#1efaf3] mb-4">Game Rules</h3>
                            <ul className="list-disc list-inside space-y-2 text-gray-300 font-body">
                                <li>Race consists of {totalLaps} laps.</li>
                                <li>Use arrow keys to control your car.</li>
                                <li>First player to complete all laps wins the pot.</li>
                                <li>Winner takes all staked MON (minus contract fee).</li>
                                <li>Click Ready to confirm participation (and stake if game is created).</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
// --- End Game Lobby UI ---


// --- Main GameRoom Component ---
export default function GameRoom() {
    const { roomCode: roomId } = useParams();
    // Destructure all necessary values from context
    const { 
        roomCode, joinRoom, gameStarted, disconnectPeer, isConnecting, 
        // Add other context values needed by GameLobbyUI if not already included
        players, isHost, stakeAmount, setPlayerStake, isReady, setPlayerReady, 
        addBotPlayer, startGame, walletAddress, isProcessing, onChainGameStatus, totalLaps 
    } = useRaceContext(); 
    
    const [isLoading, setIsLoading] = useState(true);
    const [isJoining, setIsJoining] = useState(false);
    const [shouldRedirect, setShouldRedirect] = useState(false);
    const navigate = useNavigate();
    const joinAttemptedRef = useRef(false);

    // useEffect for connection logic remains the same
    useEffect(() => {
        let isMounted = true;
        
        const connectToRoom = async () => {
            console.log("GameRoom: Checking room connection. URL:", roomId, "Context:", roomCode);
            
            if (!roomId) {
                console.error("No roomId in URL parameters");
                if (isMounted) setShouldRedirect(true);
                return;
            }
            
            if (roomCode === roomId) {
                console.log("Already in the correct room");
                if (isMounted) setIsLoading(false);
                return;
            }
            
            if (joinAttemptedRef.current) return;
            joinAttemptedRef.current = true;
            
            console.log("Attempting to join room:", roomId);
            if (isMounted) setIsJoining(true);
            
            try {
                const success = await joinRoom(roomId);
                if (success) {
                    console.log("Successfully joined room:", roomId);
                    if (isMounted) setIsLoading(false);
                } else {
                    console.error("Failed to join room:", roomId);
                    toast.error("Failed to join room");
                    if (isMounted) setShouldRedirect(true);
                }
            } catch (error) {
                console.error("Error joining room:", error);
                toast.error("Failed to join room");
                if (isMounted) setShouldRedirect(true);
            } finally {
                if (isMounted) setIsJoining(false);
            }
        };
        
        connectToRoom();
        
        return () => { isMounted = false; };
    }, [roomId, roomCode, joinRoom, navigate]);


    if (shouldRedirect) {
        return <Navigate to="/race" />;
    }

    // Loading UI remains the same
    if (isLoading || isJoining || isConnecting) {
        return (
            <div className="min-h-screen bg-[#0f0f1a] text-white flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-[#1efaf3] border-solid mx-auto mb-4"></div>
                    <h2 className="text-xl">
                        {isJoining ? `Joining room ${roomId}...` : 
                         isConnecting ? "Establishing connection..." : 
                         "Loading game room..."}
                    </h2>
                </div>
            </div>
        );
    }
    
    // Redirect check remains the same
    if (!roomCode || roomCode !== roomId) {
        console.log("Redirecting: Room code mismatch or missing.", {context: roomCode, url: roomId});
        return <Navigate to="/race" />;
    }

    // Render GameLobbyUI or RaceGame based on gameStarted state
    return gameStarted ? <RaceGame /> : <GameLobbyUI />; 
}