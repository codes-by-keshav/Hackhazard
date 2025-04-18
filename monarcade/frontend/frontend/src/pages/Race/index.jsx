import { Routes, Route, Navigate } from 'react-router-dom';
import { RaceProvider } from '../../context/RaceContext';
import RoomLobby from './RoomLobby';
import GameRoom from './GameRoom';
import RaceGame from './RaceGame';

export default function Race() {
  return (
    <RaceProvider>
      <Routes>
        <Route path="/" element={<RoomLobby />} />
        <Route path="/room/:roomCode" element={<GameRoom />} />
        <Route path="/game/:roomCode" element={<RaceGame />} />
        <Route path="*" element={<Navigate to="/race" />} />
      </Routes>
    </RaceProvider>
  );
}
