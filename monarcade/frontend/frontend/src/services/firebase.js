import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, onValue, onDisconnect, remove, update, get } from 'firebase/database';

// Your Firebase configuration from the Firebase Console
const firebaseConfig = {
    apiKey: "AIzaSyC1k7UWXudNt-_WHN_iRnWDycalnbeSHwc",
    authDomain: "monarcaderacing.firebaseapp.com",
    databaseURL: "https://monarcaderacing-default-rtdb.firebaseio.com",
    projectId: "monarcaderacing",
    storageBucket: "monarcaderacing.firebasestorage.app",
    messagingSenderId: "555389971819",
    appId: "1:555389971819:web:fab37ecca9c941a029b02e",
    measurementId: "G-V7VLDFD869"
  };



// Room management functions
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

// Room management functions
export const createGameRoom = async (roomCode, hostData) => {
  const roomRef = ref(database, `rooms/${roomCode}`);
  return await set(roomRef, {
    createdAt: Date.now(),
    gameId: hostData.gameId,
    stakeAmount: hostData.stakeAmount,
    onChainGameStatus: 0,
    gameStarted: false,
    gameEnded: false,
    players: {
      [hostData.address]: {
        ...hostData,
        isHost: true,
        lastActive: Date.now()
      }
    }
  });
};

export const joinGameRoom = async (roomCode, playerData) => {
  const playerRef = ref(database, `rooms/${roomCode}/players/${playerData.address}`);
  return await set(playerRef, {
    ...playerData,
    isHost: false,
    lastActive: Date.now()
  });
};

export const leaveGameRoom = async (roomCode, playerAddress) => {
  const playerRef = ref(database, `rooms/${roomCode}/players/${playerAddress}`);
  return await remove(playerRef);
};

// Player and game data updates
export const updatePlayerData = async (roomCode, playerAddress, updates) => {
  const playerRef = ref(database, `rooms/${roomCode}/players/${playerAddress}`);
  return await update(playerRef, {
    ...updates,
    lastActive: Date.now()
  });
};

export const updateGameData = async (roomCode, updates) => {
  const roomRef = ref(database, `rooms/${roomCode}`);
  return await update(roomRef, updates);
};

// Subscriptions
export const subscribeToRoom = (roomCode, callback) => {
    console.log(`[Firebase Service] Subscribing to room: ${roomCode}`); // Add this log
    const roomRef = ref(database, `rooms/${roomCode}`);
    
    // Attach the listener
    const unsubscribe = onValue(roomRef, (snapshot) => {
      // *** THIS LOG IS CRITICAL ***
      console.log(`%c [Firebase Service] onValue EVENT RECEIVED for rooms/${roomCode}`, 'color: green; font-weight: bold;'); 
      const roomData = snapshot.val();
      console.log(`[Firebase Service] Raw data from snapshot:`, roomData);
      
      try {
          console.log(`[Firebase Service] Calling the context callback function...`);
          callback(roomData); // This should trigger handleRoomUpdate
          console.log(`[Firebase Service] Context callback function finished.`);
      } catch (error) {
          console.error(`[Firebase Service] Error executing context callback:`, error);
      }
  
    }, (error) => {
        console.error(`[Firebase Service] Error attaching onValue listener to rooms/${roomCode}:`, error);
        // toast.error(`Listener error: ${error.message}`); // Optional: uncomment toast if needed
    });
    
    // Return the unsubscribe function provided by onValue
    console.log(`[Firebase Service] onValue listener attached for rooms/${roomCode}. Returning unsubscribe function.`);
    return unsubscribe; 
  };

// Set up automatic cleanup when player disconnects
export const setupDisconnect = async (roomCode, playerAddress, isHost) => {
  const playerRef = ref(database, `rooms/${roomCode}/players/${playerAddress}`);
  
  if (isHost) {
    // If host disconnects, the entire room is cleaned up
    const roomRef = ref(database, `rooms/${roomCode}`);
    return onDisconnect(roomRef).remove();
  } else {
    // Otherwise just remove the player
    return onDisconnect(playerRef).remove();
  }
};

// Check if room exists
export const checkRoomExists = async (roomCode) => {
  const roomRef = ref(database, `rooms/${roomCode}`);
  const snapshot = await get(roomRef);
  return snapshot.exists();
};

export default database;