import { useState } from 'react';
import { useRaceContext } from '../context/RaceContext';

export default function ConnectionStatus() {
    const { connectionState = 'disconnected', isConnecting = false, roomCode } = useRaceContext();
    const [showDetail, setShowDetail] = useState(false);
    
    const getStatusColor = () => {
        switch(connectionState) {
            case 'connected': return 'bg-green-500';
            case 'connecting': return 'bg-yellow-500';
            case 'disconnected': return 'bg-gray-500';
            case 'error': return 'bg-red-500';
            default: return 'bg-gray-500';
        }
    };
    
    return (
        <div className="fixed bottom-4 right-4 flex items-center cursor-pointer z-50">
            <div 
                className={`w-3 h-3 rounded-full ${getStatusColor()} mr-2 ${isConnecting ? 'animate-pulse' : ''}`}
                onClick={() => setShowDetail(!showDetail)}
            ></div>
            {showDetail && (
                <div className="bg-black bg-opacity-70 text-white text-xs p-2 rounded">
                    {connectionState === 'connected' 
                        ? `Connected to room ${roomCode || ''}` 
                        : connectionState === 'connecting' 
                        ? 'Connecting to room...' 
                        : connectionState === 'error' 
                        ? 'Connection error' 
                        : 'Not connected'}
                </div>
            )}
        </div>
    );
}