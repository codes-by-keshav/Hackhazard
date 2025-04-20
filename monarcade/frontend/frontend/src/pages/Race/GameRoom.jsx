import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useRaceContext } from '../../context/RaceContext';
import { ToastContainer, toast } from 'react-toastify'; // Ensure ToastContainer is imported

export default function GameRoom() {
    const {
        walletAddress,
        roomCode,
        players,
        isHost,
        stakeAmount,
        isReady,
        gameStarted,
        setPlayerStake,
        setPlayerReady,
        addBotPlayer,
        isProcessing,
        onChainGameStatus,
        disconnectPeer, // Function to leave room/disconnect P2P
        totalLaps // Get total laps from context
    } = useRaceContext();

    const { roomCode: urlRoomCode } = useParams();
    const navigate = useNavigate();
    const [singlePlayerMode, setSinglePlayerMode] = useState(false);

    useEffect(() => {
        // Redirect if context roomCode doesn't match URL or is missing after mount
        if (!roomCode || (roomCode && roomCode !== urlRoomCode)) {
            console.warn("Redirecting: Room code mismatch or missing.", { context: roomCode, url: urlRoomCode });
            // disconnectPeer(); // Clean up P2P if redirecting
            navigate('/race');
        }
    }, [roomCode, urlRoomCode, navigate]); // Removed disconnectPeer dependency to avoid loop

    useEffect(() => {
        // Navigate to game screen when gameStarted becomes true
        if (gameStarted) {
            console.log("Game started, navigating to game screen...");
            navigate(`/race/game/${roomCode}`);
        }
    }, [gameStarted, navigate, roomCode]);

    const handleStakeChange = (e) => {
        setPlayerStake(e.target.value);
    };

    const handleReadyToggle = () => {
        // Context function now handles P2P and staking logic
        setPlayerReady(!isReady);
    };

    const copyRoomCode = () => {
        navigator.clipboard.writeText(roomCode);
        toast.success("Room code copied!");
    };

    const handleLeaveRoom = () => {
        disconnectPeer(); // Disconnect P2P and reset context state
        navigate('/race'); // Go back to lobby selection
        toast.info("Left the room.");
    };

    const enableSinglePlayerMode = () => {
        if (!isHost || singlePlayerMode) return;
        setSinglePlayerMode(true);
        const botCount = Math.floor(Math.random() * 3) + 1;
        for (let i = 0; i < botCount; i++) {
            addBotPlayer(); // Context handles adding bot and P2P broadcast
        }
        // Automatically set stake for bot game?
        setPlayerStake("0.01"); // Example stake for bot game
        toast.info(`Test mode enabled with ${botCount} bot(s). Set stake and click Ready.`);
    };

    // Determine if the main action button should be enabled
    const canInteract = !isProcessing;
    const localPlayer = players.find(p => p.address === walletAddress);

    const getStatusMessage = () => {
        if (isProcessing) return "Processing transaction...";
        if (onChainGameStatus === 0 && isHost && !isReady) return "Set stake and click Ready to create game on chain.";
        if (onChainGameStatus === 0 && !isHost) return "Waiting for host to create game...";
        if (onChainGameStatus === 1 && !isReady) return "Game created. Click Ready to stake your MON.";
        if (onChainGameStatus === 1 && isReady && !localPlayer?.hasStakedLocally) return "Staking...";
        if (onChainGameStatus === 1 && isReady && localPlayer?.hasStakedLocally) return "Waiting for other players to stake...";
        if (onChainGameStatus === 2) return "Starting game...";
        return "";
    };


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
                                key={player.peerId || player.address} // Use peerId if available
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
                            {players.filter(p => !p.isBot).length === 1 && !singlePlayerMode && onChainGameStatus === 0 && (
                                <motion.button
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={enableSinglePlayerMode}
                                    disabled={!canInteract}
                                    className="mt-2 bg-[#ff3e9d] hover:bg-[#e02e7c] text-white font-bold py-2 px-4 rounded-lg disabled:opacity-50 text-sm"
                                >
                                    Test Mode (Add Bots)
                                </motion.button>
                            )}
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
                                disabled={!canInteract || (isReady && onChainGameStatus > 1)}
                                className={`px-8 py-3 rounded-full font-bold text-lg w-48 ${isReady
                                        ? 'bg-red-600 hover:bg-red-700 text-white'
                                        : 'bg-[#00eff2] hover:bg-[#00c7cc] text-black'
                                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                            >
                                {isProcessing ? "Processing..." : (isReady ? 'Cancel Ready' : 'Ready to Race!')}
                            </motion.button>
                            <p className="text-sm text-gray-400 mt-2 h-4">{getStatusMessage()}</p>
                        </div>

                        {/* Game Rules */}
                        <div className="border-t border-zinc-700 pt-4">
                            <h3 className="text-xl font-display text-[#1efaf3] mb-4">Game Rules</h3>
                            <ul className="list-disc list-inside space-y-2 text-gray-300 font-body">
                                <li>Race consists of {totalLaps} laps.</li>
                                <li>Use arrow keys to control your car.</li>
                                <li>First player to complete all laps wins the pot.</li>
                                <li>Winner takes all staked MON (contract fee: {0}%).</li> {/* Update if fee changes */}
                                <li>Click Ready to confirm participation (and stake if game is created).</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
            {/* Ensure ToastContainer is rendered, maybe move to App.jsx */}
            {/* <ToastContainer position="bottom-right" autoClose={5000} /> */}
        </div>
    );
}