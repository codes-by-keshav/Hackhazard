import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useRaceContext } from '../../context/RaceContext';

export default function RoomLobby() {
  const { walletAddress, connectWallet, createRoom, joinRoom } = useRaceContext();
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleCreateRoom = () => {
    if (!walletAddress) {
      connectWallet();
      return;
    }
    
    const roomCode = createRoom();
    navigate(`/race/room/${roomCode}`);
  };

  const handleJoinRoom = () => {
    if (!walletAddress) {
      connectWallet();
      return;
    }
    
    if (joinCode.length !== 6 || isNaN(Number(joinCode))) {
      setError('Room code must be 6 digits');
      return;
    }
    
    joinRoom(joinCode);
    navigate(`/race/room/${joinCode}`);
  };

  return (
    <div className="min-h-screen bg-[#0f0f1a] text-white flex flex-col items-center">
      <div className="w-full bg-zinc-900/80 backdrop-blur-sm p-4 font-arcade shadow-lg">
        <div className="text-4xl ml-2">MONarcade Racing</div>
      </div>
      
      <div className="flex flex-col items-center justify-center flex-grow w-full max-w-md px-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[#000016]/80 backdrop-blur-sm rounded-2xl border-4 border-[#1efaf3] p-8 w-full"
        >
          <h2 className="text-3xl font-display text-[#1efaf3] text-center mb-8">Race Room</h2>
          
          {!walletAddress && (
            <div className="text-center mb-6">
              <p className="text-[#e55a32] mb-4">Connect your wallet to continue</p>
              <button 
                onClick={connectWallet}
                className="bg-[#00eff2] hover:bg-[#00c7cc] text-black font-bold py-2 px-6 rounded-full"
              >
                Connect Wallet
              </button>
            </div>
          )}
          
          <div className="space-y-6">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleCreateRoom}
              className="w-full bg-[#ff3e9d] hover:bg-[#e02e7c] text-white font-bold py-3 px-4 rounded-lg"
            >
              Create New Room
            </motion.button>
            
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
                      setJoinCode(e.target.value.slice(0, 6));
                    }}
                    placeholder="Enter 6-digit room code"
                    className="bg-zinc-900 border-2 border-[#1efaf3] rounded-lg px-4 py-2 text-white font-body"
                    maxLength={6}
                  />
                  {error && <p className="text-red-500 text-sm">{error}</p>}
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleJoinRoom}
                    className="w-full bg-[#1efaf3] hover:bg-[#00c7cc] text-black font-bold py-2 px-4 rounded-lg"
                  >
                    Join Room
                  </motion.button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
