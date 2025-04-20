import { useState, useEffect } from 'react'; // Added useEffect
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useRaceContext } from '../../context/RaceContext';
import { ToastContainer, toast } from 'react-toastify';

export default function RoomLobby() {
    const { walletAddress, createRoom, joinRoom, isProcessing, disconnectPeer, roomCode } = useRaceContext(); // Add disconnectPeer, roomCode
    const [joinCode, setJoinCode] = useState('');
    const [error, setError] = useState('');
    const navigate = useNavigate();

    // Ensure P2P is disconnected when landing on this page if coming from a room
    useEffect(() => {
        // If the context still has a roomCode when mounting the lobby,
        // it means we likely came back from a game room without proper cleanup
        // or via browser back button. Call disconnectPeer to reset the P2P state.
        // The disconnectPeer function in the context handles checking if peerRef exists.
        // NOTE: This check should only happen ONCE on initial mount.
        const initialRoomCode = roomCode; // Capture roomCode on mount
        if (initialRoomCode) {
            console.log("RoomLobby mounted with existing roomCode in context, calling disconnectPeer.");
            disconnectPeer();
        }
    // Run ONLY when component mounts or if disconnectPeer function reference changes (unlikely)
    }, [disconnectPeer]);

    const handleCreateRoom = () => {
        if (!walletAddress) {
            toast.error("Please connect your wallet on the homepage first.");
            return;
        }
        if (isProcessing) return;

        const newRoomCode = createRoom(); // Context now handles P2P setup
        if (newRoomCode) {
            navigate(`/race/room/${newRoomCode}`);
        } else {
            // Handle potential error from createRoom (e.g., P2P already active)
            console.error("Failed to create room (check context logs).");
        }
    };

    const handleJoinRoom = () => {
        if (!walletAddress) {
            toast.error("Please connect your wallet on the homepage first.");
            return;
        }
        if (isProcessing) return;

        if (joinCode.length !== 6 || !/^\d{6}$/.test(joinCode)) {
            setError('Room code must be 6 digits');
            return;
        }

        joinRoom(joinCode); // Context handles P2P connection attempt
        // Navigation should ideally happen *after* successful P2P connection confirmation,
        // but for simplicity, navigate optimistically. Context/GameRoom handles redirects if connection fails.
        navigate(`/race/room/${joinCode}`);
    };

    return (
        <div className="min-h-screen bg-[#0f0f1a] text-white flex flex-col items-center">
            {/* Navbar */}
            <div className="w-full bg-zinc-900/80 backdrop-blur-sm p-4 font-arcade shadow-lg">
                <div className="text-4xl ml-2">MONarcade Racing</div>
            </div>

            {/* Main Content */}
            <div className="flex flex-col items-center justify-center flex-grow w-full max-w-md px-4">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-[#000016]/80 backdrop-blur-sm rounded-2xl border-4 border-[#1efaf3] p-8 w-full"
                >
                    <h2 className="text-3xl font-display text-[#1efaf3] text-center mb-8">Race Room</h2>

                    {/* Wallet Connect Button */}
                    {/* {!walletAddress && (
                        <div className="text-center mb-6">
                            <p className="text-[#e55a32] mb-4">Connect your wallet to continue</p>
                            {/* <button
                                onClick={connectWallet}
                                disabled={isProcessing}
                                className="bg-[#00eff2] hover:bg-[#00c7cc] text-black font-bold py-2 px-6 rounded-full disabled:opacity-50"
                            > */}
                  
                  

                    {/* Room Actions */}
                    {walletAddress && (
                         <div className="space-y-6">
                            {/* Create Room */}
                            <motion.button
                                whileHover={{ scale: isProcessing ? 1 : 1.05 }}
                                whileTap={{ scale: isProcessing ? 1 : 0.95 }}
                                onClick={handleCreateRoom}
                                disabled={isProcessing}
                                className="w-full bg-[#ff3e9d] hover:bg-[#e02e7c] text-white font-bold py-3 px-4 rounded-lg disabled:opacity-50"
                            >
                                {isProcessing ? "Processing..." : "Create New Room"}
                            </motion.button>

                            {/* Join Room */}
                            <div className="relative">
                                <div className="absolute inset-0 bg-gradient-to-r from-[#1efaf3] via-[#ff3e9d] to-[#1efaf3] rounded-lg opacity-50 blur"></div>
                                <div className="relative bg-[#000016] rounded-lg p-4">
                                    <h3 className="text-xl font-display text-[#1efaf3] mb-4">Join Existing Room</h3>
                                    <div className="flex flex-col space-y-4">
                                        <input
                                            type="text"
                                            value={joinCode}
                                            onChange={(e) => {
                                                setError('');
                                                const val = e.target.value.replace(/\D/g, '');
                                                setJoinCode(val.slice(0, 6));
                                            }}
                                            placeholder="Enter 6-digit room code"
                                            className="bg-zinc-900 border-2 border-[#1efaf3] rounded-lg px-4 py-2 text-white font-body disabled:opacity-50"
                                            maxLength={6}
                                            disabled={isProcessing}
                                        />
                                        {error && <p className="text-red-500 text-sm">{error}</p>}
                                        <motion.button
                                            whileHover={{ scale: isProcessing ? 1 : 1.05 }}
                                            whileTap={{ scale: isProcessing ? 1 : 0.95 }}
                                            onClick={handleJoinRoom}
                                            disabled={isProcessing || joinCode.length !== 6}
                                            className="w-full bg-[#1efaf3] hover:bg-[#00c7cc] text-black font-bold py-2 px-4 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {isProcessing ? "Processing..." : "Join Room"}
                                        </motion.button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </motion.div>
            </div>
            {/* Ensure ToastContainer is rendered */}
            <ToastContainer position="bottom-right" autoClose={5000} />
        </div>
    );
}