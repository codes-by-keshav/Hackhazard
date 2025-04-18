import React from 'react';

export default function GameControls({ 
  currentLap, 
  totalLaps, 
  playerPositions, 
  currentPlayerIndex,
  gameEnded,
  winner,
  onReturnToLobby
}) {
  return (
    <div className="absolute top-4 left-4 right-4 z-30 flex justify-between">
      {/* Lap counter */}
      <div className="bg-[#000016]/80 backdrop-blur-sm rounded-lg border-2 border-[#1efaf3] p-4">
        <div className="text-white font-arcade">
          Lap: {currentLap} / {totalLaps}
        </div>
      </div>
      
      {/* Player positions */}
      <div className="bg-[#000016]/80 backdrop-blur-sm rounded-lg border-2 border-[#1efaf3] p-4">
        <div className="text-white font-arcade mb-2">Positions</div>
        <div className="space-y-1">
          {playerPositions.map((player, index) => (
            <div 
              key={index}
              className={`flex items-center ${player.isCurrentPlayer ? 'text-[#1efaf3] font-bold' : 'text-white'}`}
            >
              <div className="mr-2">{index + 1}.</div>
              <div 
                className="w-3 h-3 rounded-full mr-2"
                style={{ backgroundColor: player.color }}
              ></div>
              <div className="font-body">
                {player.name.slice(0, 6)}...
                {player.isCurrentPlayer && " (You)"}
              </div>
            </div>
          ))}
        </div>
      </div>
      
      {/* Game end overlay */}
      {gameEnded && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-[#000016] border-4 border-[#1efaf3] rounded-xl p-8 max-w-md text-center">
            <h2 className="text-3xl font-arcade text-[#1efaf3] mb-6">
              Race Complete!
            </h2>
            
            {winner && (
              <div className="mb-6">
                <div className="text-xl font-display mb-2">
                  Winner:
                </div>
                <div 
                  className="text-2xl font-bold"
                  style={{ color: winner.color }}
                >
                  {winner.name.slice(0, 6)}...
                  {winner.isCurrentPlayer && " (You)"}
                </div>
              </div>
            )}
            
            <button
              onClick={onReturnToLobby}
              className="bg-[#1efaf3] hover:bg-[#00c7cc] text-black font-bold py-3 px-6 rounded-full"
            >
              Return to Lobby
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
