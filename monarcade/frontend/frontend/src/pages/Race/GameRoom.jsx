import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useRaceContext } from '../../context/RaceContext';

export default function GameRoom() {
  const { 
    walletAddress, 
    roomCode, 
    players, 
    isHost, 
    stakeAmount, 
    isReady, 
    allPlayersReady, 
    gameStarted,
    setPlayerStake, 
    setPlayerReady,
    // Add these functions
    addBotPlayer,
    startGame
  } = useRaceContext();
  
  const { roomCode: urlRoomCode } = useParams();
  const navigate = useNavigate();
  // Add state for single player mode
  const [singlePlayerMode, setSinglePlayerMode] = useState(false);

  useEffect(() => {
    // If room code from URL doesn't match context, redirect to lobby
    if (roomCode && roomCode !== urlRoomCode) {
      navigate('/race');
    }
    
    // If game has started, navigate to the game
    if (gameStarted) {
      navigate(`/race/game/${roomCode}`);
    }
  }, [roomCode, urlRoomCode, gameStarted, navigate]);

  const handleStakeChange = (e) => {
    // Allow any value including 0
    setPlayerStake(e.target.value);
  };

  const handleReadyToggle = () => {
    setPlayerReady(!isReady);
    
    // If in single player mode and player is ready, start the game
    if (singlePlayerMode && !isReady) {
      // Small delay to allow state to update
      setTimeout(() => {
        startGame();
      }, 500);
    }
  };

  const copyRoomCode = () => {
    navigator.clipboard.writeText(roomCode);
    // You could add a toast notification here
  };

  // Add function to enable single player mode
  const enableSinglePlayerMode = () => {
    setSinglePlayerMode(true);
    // Add 1-3 bot players
    const botCount = Math.floor(Math.random() * 3) + 1;
    for (let i = 0; i < botCount; i++) {
      addBotPlayer();
    }
  };

  return (
    <div className="min-h-screen bg-[#0f0f1a] text-white flex flex-col">
      <div className="w-full bg-zinc-900/80 backdrop-blur-sm p-4 font-arcade shadow-lg flex justify-between items-center">
        <div className="text-4xl ml-2">MONarcade Racing</div>
        <div className="flex items-center space-x-4">
          <div className="text-sm font-body">Room: {roomCode}</div>
          <button 
            onClick={copyRoomCode}
            className="text-[#1efaf3] hover:text-[#00c7cc]"
          >
            Copy
          </button>
        </div>
      </div>
      
      <div className="flex flex-col md:flex-row flex-grow p-4 gap-6">
        {/* Player list */}
        <div className="w-full md:w-1/3 bg-[#000016]/80 backdrop-blur-sm rounded-2xl border-4 border-[#1efaf3] p-6">
          <h2 className="text-2xl font-display text-[#1efaf3] mb-6">Players</h2>
          <div className="space-y-4">
            {players.map((player, index) => (
              <div 
                key={index} 
                className={`flex items-center justify-between p-3 rounded-lg ${
                  player.ready ? 'bg-[#1efaf3]/20' : 'bg-zinc-900/50'
                }`}
              >
                <div className="flex items-center">
                  <div 
                    className="w-6 h-6 rounded-full mr-3" 
                    style={{ backgroundColor: player.color }}
                  ></div>
                  <div className="font-body">
                    {player.address.slice(0, 6)}...{player.address.slice(-4)}
                    {player.address === walletAddress && " (You)"}
                    {player.isBot && " (Bot)"}
                  </div>
                </div>
                <div className={`text-sm ${player.ready ? 'text-green-400' : 'text-yellow-400'}`}>
                  {player.ready ? 'Ready' : 'Not Ready'}
                </div>
              </div>
            ))}
          </div>
          
          {isHost && (
            <div className="mt-6 text-center">
              <p className="text-[#e55a32] mb-2">You are the host</p>
              <p className="text-sm text-gray-400">
                Game will start when all players are ready
              </p>
              
              {/* Add single player mode button */}
              {players.length === 1 && !singlePlayerMode && (
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={enableSinglePlayerMode}
                  className="mt-4 bg-[#ff3e9d] hover:bg-[#e02e7c] text-white font-bold py-2 px-4 rounded-lg"
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
            <div>
              <label className="block text-[#e55a32] mb-2 font-body">Stake Amount (MON)</label>
              <input
                type="number"
                min="0"
                step="0.001"
                value={stakeAmount}
                onChange={handleStakeChange}
                disabled={isReady}
                className="w-full bg-zinc-900 border-2 border-[#1efaf3] rounded-lg px-4 py-2 text-white font-body"
                placeholder="Enter stake amount (can be 0)"
              />
              <p className="text-sm text-gray-400 mt-1">
                Enter the amount of MON you want to stake for this race
              </p>
            </div>
            
            <div className="flex justify-center">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleReadyToggle}
                className={`px-8 py-3 rounded-full font-bold text-lg ${
                  isReady 
                    ? 'bg-red-600 hover:bg-red-700 text-white' 
                    : 'bg-[#00eff2] hover:bg-[#00c7cc] text-black'
                }`}
              >
                {isReady ? 'Cancel Ready' : 'Ready to Race!'}
              </motion.button>
            </div>
            
            {/* Add single player start button */}
            {singlePlayerMode && !isReady && (
              <div className="flex justify-center mt-4">
                <p className="text-[#e55a32] text-center mb-4">
                  Test mode enabled. Click Ready to start the race with bots!
                </p>
              </div>
            )}
            
            <div className="border-t border-zinc-700 pt-4">
              <h3 className="text-xl font-display text-[#1efaf3] mb-4">Game Rules</h3>
              <ul className="list-disc list-inside space-y-2 text-gray-300 font-body">
                <li>Race consists of 3 laps around the track</li>
                <li>Use arrow keys to control your car</li>
                <li>First player to complete all laps wins</li>
                <li>Winner takes all staked MON</li>
                <li>Avoid collisions with walls and other cars</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
