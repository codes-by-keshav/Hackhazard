// import { useState, useEffect, useRef } from 'react';
// import { useParams, useNavigate } from 'react-router-dom';
// import { useRaceContext } from '../../context/RaceContext';
// import useGameControls from '../../hooks/useGameControls';
// import Track from './components/Track';
// import Car from './components/Car';
// import { checkCarCollision, handleCarCollision } from '../../utils/raceUtils';
// import GameControls from './components/GameControls';

// // Physics constants - tuned for better control
// const ACCELERATION = 0.25; // Increased for more responsive controls
// const MAX_SPEED = 6;      // Increased max speed for better gameplay feel
// const ROTATION_SPEED = 4; // Increased for more responsive steering
// const FRICTION = 0.92;    // Less friction for smoother movement

// export default function RaceGame() {
//     const {
//         walletAddress,
//         roomCode,
//         players,
//         currentLap,
//         totalLaps,
//         gameEnded,
//         winner,
//         setCurrentLap,
//         endGame,
//         resetGame
//     } = useRaceContext();

//     const { roomCode: urlRoomCode } = useParams();
//     const navigate = useNavigate();

//     // Game state
//     const [trackData, setTrackData] = useState(null);
//     const [playerPositions, setPlayerPositions] = useState([]);
//     const [gameInitialized, setGameInitialized] = useState(false);
//     const [carPositions, setCarPositions] = useState([]);
//     const [debug, setDebug] = useState({
//         fps: 0,
//         playerSpeed: 0,
//         keyState: {}
//     });

//     // Get keyboard controls - This is React state that updates from the hook
//     const keys = useGameControls();

//     // Refs for game engine
//     const gameEngineRef = useRef(null);
//     const playerCarsRef = useRef([]);
//     const currentPlayerIndexRef = useRef(-1);
//     const lastUpdateTimeRef = useRef(0);
//     const keysRef = useRef(keys);
//     const frameCounterRef = useRef(0);
//     const isGameRunningRef = useRef(false);
//     const fpsCounterRef = useRef(0);
//     const lastFpsUpdateRef = useRef(0);
//     const gameContainerRef = useRef(null);
//     const keyHandlersSetupRef = useRef(false);

//     // Also listen directly for key events on the component to ensure we capture them
//     useEffect(() => {
//         if (gameContainerRef.current && !keyHandlersSetupRef.current) {
//             const container = gameContainerRef.current;
            
//             // Make the container focusable
//             container.setAttribute('tabindex', '0');
//             container.focus();
            
//             // Set up direct key handlers
//             const handleKeyDown = (e) => {
//                 if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
//                     e.preventDefault();
//                     keysRef.current = {...keysRef.current, [e.key]: true};
//                     console.log("Direct keydown captured:", e.key);
//                 }
//             };
            
//             const handleKeyUp = (e) => {
//                 if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
//                     e.preventDefault();
//                     keysRef.current = {...keysRef.current, [e.key]: false};
//                     console.log("Direct keyup captured:", e.key);
//                 }
//             };
            
//             container.addEventListener('keydown', handleKeyDown);
//             container.addEventListener('keyup', handleKeyUp);
            
//             // Focus the container after a short delay
//             setTimeout(() => container.focus(), 100);
            
//             keyHandlersSetupRef.current = true;
            
//             return () => {
//                 container.removeEventListener('keydown', handleKeyDown);
//                 container.removeEventListener('keyup', handleKeyUp);
//             };
//         }
//     }, [gameContainerRef.current]);

//     // Update keys ref when keyboard controls change from the hook
//     useEffect(() => {
//         console.log("Keys updated from hook:", keys);
//         keysRef.current = keys;
//         setDebug(prev => ({...prev, keyState: keys}));
        
//         // Force focus on the game container when keys are used
//         if (gameContainerRef.current) {
//             gameContainerRef.current.focus();
//         }
//     }, [keys]);

//     // Initialize game when players are available
//     useEffect(() => {
//         console.log("Initializing game with players:", players);

//         if (players.length > 0 && !gameInitialized) {
//             // Find current player index
//             const index = players.findIndex(p => p.address === walletAddress);
//             currentPlayerIndexRef.current = index;
//             console.log("Current player index:", index);

//             // Initialize player cars
//             playerCarsRef.current = players.map((player, idx) => ({
//                 id: player.address,
//                 x: 0,
//                 y: 0,
//                 rotation: 0,
//                 speed: 0,
//                 lap: 0,
//                 checkpoints: [],
//                 color: player.color,
//                 name: player.address === walletAddress ? 'YOU' : `Player ${idx + 1}`,
//                 isCurrentPlayer: player.address === walletAddress,
//                 isBot: player.isBot || false,
//                 // Add vectors for physics
//                 velocityX: 0,
//                 velocityY: 0
//             }));

//             // Initialize car positions state for rendering
//             setCarPositions([...playerCarsRef.current]);

//             // Initialize player positions
//             setPlayerPositions(
//                 players.map(player => ({
//                     name: player.address,
//                     color: player.color,
//                     lap: 0,
//                     progress: 0,
//                     isCurrentPlayer: player.address === walletAddress
//                 }))
//             );

//             setGameInitialized(true);
//             console.log("Game initialized");
//         }

//         // Clean up game engine on unmount
//         return () => {
//             console.log("Cleaning up game engine");
//             isGameRunningRef.current = false;
//             if (gameEngineRef.current) {
//                 cancelAnimationFrame(gameEngineRef.current);
//                 gameEngineRef.current = null;
//             }
//         };
//     }, [players, walletAddress, gameInitialized]);

//     // Handle track loading and start game engine
//     const handleTrackLoad = (data) => {
//         console.log("Track loaded with data:", data);
//         setTrackData(data);

//         // Position cars at starting line
//         if (data && playerCarsRef.current.length > 0) {
//             const trackCenterRadius = (data.innerRadius + data.outerRadius) / 2;

//             // Position cars at the starting line with proper spacing
//             playerCarsRef.current.forEach((car, idx) => {
//                 // Calculate position on the track with better spacing
//                 const laneWidth = (data.outerRadius - data.innerRadius) / (playerCarsRef.current.length + 1);
//                 const lanePosition = data.innerRadius + laneWidth * (idx + 1);
                
//                 // Position slightly above the center line
//                 car.x = data.center.x;
//                 car.y = data.center.y - lanePosition;
//                 car.rotation = 0;
//                 car.speed = 0;
//                 car.velocityX = 0;
//                 car.velocityY = 0;
//                 car.lap = 0;
//                 car.checkpoints = [];
//             });

//             // Update car positions state for rendering - important to use spread/clone
//             setCarPositions([...playerCarsRef.current]);

//             console.log("Cars positioned:", playerCarsRef.current);

//             // Start game engine only if not already running
//             if (!isGameRunningRef.current) {
//                 setTimeout(startGameEngine, 500); // Short delay to ensure everything is ready
//             }
//         }
//     };

//     // Game engine with improved timing
//     const startGameEngine = () => {
//         if (!trackData) {
//             console.log("Cannot start game engine: track data not available");
//             return;
//         }

//         console.log("Starting game engine");
//         lastUpdateTimeRef.current = performance.now();
//         lastFpsUpdateRef.current = performance.now();
//         isGameRunningRef.current = true;

//         // Reset FPS counter
//         fpsCounterRef.current = 0;
//         frameCounterRef.current = 0;

//         const gameLoop = (timestamp) => {
//             // Stop the loop if game is no longer running
//             if (!isGameRunningRef.current) {
//                 console.log("Game engine stopped");
//                 return;
//             }

//             // Calculate accurate delta time in seconds
//             const now = timestamp || performance.now(); // Fallback if timestamp is not provided
//             const deltaTime = Math.min((now - lastUpdateTimeRef.current) / 1000, 0.05); // 50ms max to prevent huge jumps
//             lastUpdateTimeRef.current = now;

//             // FPS counter
//             fpsCounterRef.current++;
//             if (now - lastFpsUpdateRef.current >= 1000) {
//                 console.log(`FPS: ${fpsCounterRef.current}`);
//                 setDebug(prev => ({...prev, fps: fpsCounterRef.current}));
//                 fpsCounterRef.current = 0;
//                 lastFpsUpdateRef.current = now;
//             }

//             if (!gameEnded) {
//                 // Get current key state from ref
//                 const currentKeys = keysRef.current;
                
//                 // Debug key state
//                 if (frameCounterRef.current % 30 === 0) {
//                     console.log("Current keys:", currentKeys);
//                 }

//                 // Update all cars
//                 playerCarsRef.current.forEach((car, idx) => {
//                     // Handle player car
//                     if (idx === currentPlayerIndexRef.current) {
//                         // Store old position for collision detection
//                         const oldX = car.x;
//                         const oldY = car.y;
                        
//                         // Handle controls with delta time for smooth movement
//                         let acceleration = 0;
                        
//                         if (currentKeys.ArrowUp) {
//                             acceleration = ACCELERATION;
//                             console.log("Accelerating:", acceleration);
//                         } else if (currentKeys.ArrowDown) {
//                             acceleration = -ACCELERATION * 0.7; // Braking/reverse is slower
//                             console.log("Braking:", acceleration);
//                         }
                        
//                         // Apply acceleration to speed
//                         if (acceleration !== 0) {
//                             car.speed += acceleration;
//                             console.log("New speed after acceleration:", car.speed);
//                         } else {
//                             // Apply friction only when not accelerating
//                             car.speed *= FRICTION;
//                         }

//                         // Apply speed limits
//                         car.speed = Math.max(-MAX_SPEED / 2, Math.min(MAX_SPEED, car.speed));
                        
//                         // Apply steering only if the car is moving
//                         if (Math.abs(car.speed) > 0.1) {
//                             let steeringAmount = 0;
                            
//                             if (currentKeys.ArrowLeft) {
//                                 steeringAmount = -ROTATION_SPEED;
//                                 console.log("Steering left:", steeringAmount);
//                             } else if (currentKeys.ArrowRight) {
//                                 steeringAmount = ROTATION_SPEED;
//                                 console.log("Steering right:", steeringAmount);
//                             }
                            
//                             // Apply steering based on speed direction
//                             if (steeringAmount !== 0) {
//                                 car.rotation += steeringAmount * (car.speed > 0 ? 1 : -1);
//                             }
//                         }
                        
//                         // Update debug info
//                         setDebug(prev => ({...prev, playerSpeed: car.speed.toFixed(2)}));
//                     }
//                     // Handle bot cars
//                     else if (car.isBot) {
//                         // Simple AI: follow the track
//                         const centerX = trackData.center.x;
//                         const centerY = trackData.center.y;

//                         // Calculate angle to center
//                         const angleToCenter = Math.atan2(centerY - car.y, centerX - car.x);

//                         // Calculate current direction
//                         const currentDirection = car.rotation * Math.PI / 180;

//                         // Calculate tangent to circle (perpendicular to radius)
//                         const tangentAngle = angleToCenter + Math.PI / 2;

//                         // Adjust direction to follow tangent
//                         let targetDirection = tangentAngle;

//                         // Calculate distance from center
//                         const distanceFromCenter = Math.sqrt(
//                             Math.pow(car.x - centerX, 2) +
//                             Math.pow(car.y - centerY, 2)
//                         );

//                         // Stay in the middle of the track
//                         const trackCenterRadius = (trackData.innerRadius + trackData.outerRadius) / 2;
//                         if (distanceFromCenter < trackCenterRadius - 10) {
//                             // Too close to inner edge, steer outward
//                             targetDirection = angleToCenter - Math.PI / 2;
//                         } else if (distanceFromCenter > trackCenterRadius + 10) {
//                             // Too close to outer edge, steer inward
//                             targetDirection = angleToCenter + Math.PI / 2;
//                         }

//                         // Gradually adjust direction
//                         let newDirection = currentDirection;
//                         const angleDiff = targetDirection - currentDirection;

//                         // Normalize angle difference to [-PI, PI]
//                         const normalizedDiff = Math.atan2(Math.sin(angleDiff), Math.cos(angleDiff));

//                         // Adjust direction
//                         newDirection += normalizedDiff * 0.1;

//                         // Convert back to degrees
//                         car.rotation = newDirection * 180 / Math.PI;

//                         // Adjust speed (bots go a bit slower than max speed)
//                         car.speed = MAX_SPEED * (0.7 + Math.random() * 0.2);
//                     }

//                     // Convert rotation to radians
//                     const radians = car.rotation * Math.PI / 180;

//                     // Update position with delta time for smooth movement
//                     const newX = car.x + Math.sin(radians) * car.speed;
//                     const newY = car.y - Math.cos(radians) * car.speed;

//                     // Check track boundaries
//                     const distanceFromCenter = Math.sqrt(
//                         Math.pow(newX - trackData.center.x, 2) +
//                         Math.pow(newY - trackData.center.y, 2)
//                     );

//                     // Only update position if within track boundaries
//                     if (distanceFromCenter > trackData.innerRadius &&
//                         distanceFromCenter < trackData.outerRadius) {
//                         car.x = newX;
//                         car.y = newY;
//                     } else {
//                         // Collision with wall - bounce back
//                         car.speed = -car.speed * 0.5;
//                     }

//                     // Check if crossed start/finish line
//                     const prevAngle = Math.atan2(
//                         car.y - trackData.center.y,
//                         car.x - trackData.center.x
//                     );

//                     const newAngle = Math.atan2(
//                         newY - trackData.center.y,
//                         newX - trackData.center.x
//                     );

//                     // Check if we crossed from positive to negative angle (crossed the top)
//                     if (prevAngle > 0 && newAngle <= 0 && car.speed > 0) {
//                         // Make sure we're moving in the right direction
//                         car.lap += 1;
//                         console.log(`Car ${car.id} completed lap ${car.lap}`);

//                         // Only update UI state for player car
//                         if (idx === currentPlayerIndexRef.current) {
//                             setCurrentLap(car.lap);
//                         }

//                         // Check if race is complete
//                         if (car.lap >= totalLaps) {
//                             endGame(car.id);
//                         }
//                     }
//                 });

//                 // Check for collisions between cars
//                 for (let i = 0; i < playerCarsRef.current.length; i++) {
//                     for (let j = i + 1; j < playerCarsRef.current.length; j++) {
//                         const car1 = playerCarsRef.current[i];
//                         const car2 = playerCarsRef.current[j];
                        
//                         if (checkCarCollision(car1, car2)) {
//                             // Handle collision
//                             const newSpeeds = handleCarCollision(car1, car2);
//                             car1.speed = newSpeeds.car1Speed;
//                             car2.speed = newSpeeds.car2Speed;
//                         }
//                     }
//                 }

//                 // Update states less frequently to avoid performance issues
//                 frameCounterRef.current += 1;
//                 if (frameCounterRef.current >= 2) { // Update every 2 frames for more frequent updates
//                     frameCounterRef.current = 0;
                    
//                     // Create deep copy of car positions for React state
//                     const updatedCarPositions = playerCarsRef.current.map(car => ({
//                         ...car,
//                         x: car.x,
//                         y: car.y,
//                         rotation: car.rotation,
//                         speed: car.speed
//                     }));
                    
//                     setCarPositions(updatedCarPositions);

//                     // Update player positions
//                     const updatedPositions = playerCarsRef.current.map(car => {
//                         // Calculate progress as a combination of lap and angle
//                         const carAngle = Math.atan2(
//                             car.y - trackData.center.y,
//                             car.x - trackData.center.x
//                         );
//                         const normalizedAngle = carAngle < 0 ? carAngle + 2 * Math.PI : carAngle;

//                         // Progress is a combination of lap and position on track
//                         const progress = car.lap + (2 * Math.PI - normalizedAngle) / (2 * Math.PI);

//                         return {
//                             name: car.id,
//                             color: car.color,
//                             lap: car.lap,
//                             progress,
//                             isCurrentPlayer: car.id === walletAddress
//                         };
//                     });

//                     // Sort by progress (descending)
//                     updatedPositions.sort((a, b) => b.progress - a.progress);
//                     setPlayerPositions(updatedPositions);
//                 }
//             }

//             // Continue game loop using requestAnimationFrame for optimal timing
//             gameEngineRef.current = requestAnimationFrame(gameLoop);
//         };

//         // Only start the game loop if it's not already running
//         if (!gameEngineRef.current) {
//             gameEngineRef.current = requestAnimationFrame(gameLoop);
//             console.log("Game loop started");
//         }
//     };

//     // Handle return to lobby
//     const handleReturnToLobby = () => {
//         isGameRunningRef.current = false;
//         if (gameEngineRef.current) {
//             cancelAnimationFrame(gameEngineRef.current);
//             gameEngineRef.current = null;
//         }
//         resetGame();
//         navigate(`/race/room/${roomCode}`);
//     };

//     // Render game
//     return (
//         <div 
//             ref={gameContainerRef}
//             className="relative w-full h-screen overflow-hidden bg-[#000016]"
//             tabIndex="0" // Make it focusable
//             onFocus={() => console.log("Game container focused")}
//             onBlur={() => console.log("Game container lost focus")}
//         >
//             {/* Track */}
//             <Track
//                 width={window.innerWidth}
//                 height={window.innerHeight}
//                 onTrackLoad={handleTrackLoad}
//             />

//             {/* Cars */}
//             {carPositions.map((car, idx) => (
//                 <Car
//                     key={idx}
//                     x={car.x}
//                     y={car.y}
//                     rotation={car.rotation}
//                     color={car.color}
//                     isCurrentPlayer={car.isCurrentPlayer}
//                     playerName={car.name}
//                 />
//             ))}

//             {/* Game UI */}
//             <GameControls
//                 currentLap={currentLap}
//                 totalLaps={totalLaps}
//                 playerPositions={playerPositions}
//                 currentPlayerIndex={playerPositions.findIndex(p => p.isCurrentPlayer)}
//                 gameEnded={gameEnded}
//                 winner={winner ? {
//                     name: winner,
//                     color: players.find(p => p.address === winner)?.color || '#ffffff',
//                     isCurrentPlayer: winner === walletAddress
//                 } : null}
//                 onReturnToLobby={handleReturnToLobby}
//             />
            
//             {/* Debug overlay */}
//             <div className="absolute top-20 right-4 bg-black/70 text-white p-2 text-xs font-mono">
//                 <div>FPS: {debug.fps}</div>
//                 <div>Speed: {debug.playerSpeed}</div>
//                 <div>Keys: {JSON.stringify(debug.keyState)}</div>
//             </div>
//         </div>
//     );
// }

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRaceContext } from '../../context/RaceContext';
import useGameControls from '../../hooks/useGameControls'; // Hook returns a mutable global object
import Track from './components/Track';
import Car from './components/Car';
import GameControls from './components/GameControls';
import { normalizeAngle, calculateAngle } from '../../utils/raceUtils';

// --- Constants ---
// ... (Physics, Bot, UI constants remain the same) ...
const ACCELERATION = 0.25;
const MAX_SPEED = 7;
const MAX_REVERSE_SPEED = -3;
const ROTATION_SPEED = 3.5;
const FRICTION = 0.97;
const WALL_BOUNCE_FACTOR = -0.4;
const WALL_STICK_PREVENTION = 0.1;
const BOT_MAX_SPEED_FACTOR = 0.88;
const BOT_ACCELERATION_FACTOR = 0.7;
const BOT_STEERING_SENSITIVITY = 0.18;
const BOT_CENTERING_FACTOR = 0.1;
const UI_UPDATE_INTERVAL = 10;


export default function RaceGame() {
    // --- Context and Navigation ---
    const {
        walletAddress, roomCode, players, currentLap, totalLaps,
        gameEnded, winner, setCurrentLap, endGame, resetGame
    } = useRaceContext();
    const navigate = useNavigate();

    // --- State for Rendering ---
    const [carPositions, setCarPositions] = useState([]);
    const [playerPositionsUI, setPlayerPositionsUI] = useState([]);
    const [debug, setDebug] = useState({ fps: 0, speed: 0, rotation: 0, x: 0, y: 0 });
    const [carsReadyToRender, setCarsReadyToRender] = useState(false);

    // --- Refs for Game Logic ---
    const trackDataRef = useRef(null);
    const playerCarsRef = useRef([]);
    const currentPlayerIndexRef = useRef(-1);
    const gameEngineRef = useRef(null);
    const lastFrameTimeRef = useRef(performance.now());
    const gameContainerRef = useRef(null);
    const loopCounter = useRef(0);
    // Get the mutable keys object from the hook
    const keys = useGameControls();

    // --- Initialization ---
    // useEffect for initializing/updating cars (remains the same)
    useEffect(() => {
        console.log("RaceGame: Players context updated:", players);
        setCarsReadyToRender(false);

        if (players.length > 0 && walletAddress) {
            const index = players.findIndex(p => p.address === walletAddress);
            currentPlayerIndexRef.current = index;
            console.log("RaceGame: Current player index:", index);

            playerCarsRef.current = players.map((player, idx) => ({
                id: player.peerID || player.address,
                address: player.address,
                peerID: player.peerID,
                x: 0, y: 0, speed: 0, rotation: 0, lap: 0,
                color: player.color,
                name: player.address === walletAddress ? 'YOU' : `P${idx + 1}`,
                isCurrentPlayer: player.address === walletAddress,
                isBot: player.isBot || false,
                justCompletedLap: false,
            }));
            console.log("RaceGame: playerCarsRef initialized/updated:", playerCarsRef.current);

            if (trackDataRef.current) {
                positionCarsAndEnableRendering();
            }

        } else {
            playerCarsRef.current = [];
            currentPlayerIndexRef.current = -1;
            setCarPositions([]);
            setPlayerPositionsUI([]);
            console.log("RaceGame: Players array empty or wallet missing, cleared refs.");
        }

    }, [players, walletAddress]); // Keep dependencies

    // handleTrackLoad (remains the same)
    const handleTrackLoad = useCallback((data) => {
        console.log("RaceGame: Track loaded callback received data.");
        trackDataRef.current = data;
        if (playerCarsRef.current.length > 0) {
            positionCarsAndEnableRendering();
        }
    }, []);

    // positionCarsAndEnableRendering (remains the same)
    const positionCarsAndEnableRendering = useCallback(() => {
        const trackData = trackDataRef.current;
        const cars = playerCarsRef.current;

        if (!trackData || cars.length === 0) {
            console.warn("Positioning skipped: Track or cars not ready.");
            setCarsReadyToRender(false);
            return;
        }

        console.log("Positioning cars at start line...");
        const trackCenterRadius = (trackData.innerRadius + trackData.outerRadius) / 2;
        const startAngle = -Math.PI / 2; // 12 o'clock
        const angleSpread = Math.PI / 12;
        cars.forEach((car, idx) => {
            const angle = startAngle + (idx - (cars.length - 1) / 2) * angleSpread / cars.length;
            car.x = trackData.center.x + Math.cos(angle) * trackCenterRadius;
            car.y = trackData.center.y + Math.sin(angle) * trackCenterRadius;
            car.rotation = (angle + Math.PI / 2) * 180 / Math.PI; // Point tangent to circle
            car.speed = 0;
            car.lap = 0;
            car.justCompletedLap = false;
        });
        console.log("RaceGame: Cars positioned in ref:", cars);

        setCarPositions(cars.map(c => ({ ...c })));
        setCarsReadyToRender(true);

        setPlayerPositionsUI(cars.map(car => ({
             id: car.id,
             name: car.name,
             color: car.color,
             lap: car.lap,
             progress: 0,
             isCurrentPlayer: car.address === walletAddress
        })));

        if (!gameEngineRef.current) {
            startGameEngine();
        }
    }, [walletAddress]); // Keep dependency

    // --- Game Loop Logic ---
    const gameLoop = useCallback((timestamp) => {
        // ... (loop setup, timing, fps) ...
        if (!gameEngineRef.current) return;

        loopCounter.current++;
        const now = timestamp || performance.now();
        const deltaTime = Math.min((now - lastFrameTimeRef.current) / 1000, 0.05);
        lastFrameTimeRef.current = now;

        let currentFps = deltaTime > 0 ? Math.round(1 / deltaTime) : 0;
        const trackData = trackDataRef.current;

        // --- Core Game Logic ---
        if (!gameEnded && trackData && playerCarsRef.current.length > 0) {

            playerCarsRef.current.forEach((car, idx) => {
                const prevX = car.x;
                const prevY = car.y;

                // ... (1. Friction, 2. Input/Accel, 3. Clamp Speed, 4. Steering) ...
                 // 1. Friction
                car.speed *= FRICTION;
                if (Math.abs(car.speed) < 0.05) car.speed = 0;

                // 2. Input & Acceleration
                if (idx === currentPlayerIndexRef.current) {
                    if (keys.ArrowUp) car.speed += ACCELERATION;
                    else if (keys.ArrowDown) car.speed -= ACCELERATION * 0.7;
                } else if (car.isBot) {
                    const targetSpeed = MAX_SPEED * BOT_MAX_SPEED_FACTOR;
                    if (car.speed < targetSpeed) {
                        car.speed += ACCELERATION * BOT_ACCELERATION_FACTOR;
                    }
                }

                // 3. Clamp Speed
                car.speed = Math.max(MAX_REVERSE_SPEED, Math.min(MAX_SPEED, car.speed));

                // 4. Steering
                if (Math.abs(car.speed) > 0.1) {
                    const steeringDirection = car.speed > 0 ? 1 : -1;
                    if (idx === currentPlayerIndexRef.current) {
                        if (keys.ArrowLeft) car.rotation -= ROTATION_SPEED * steeringDirection;
                        if (keys.ArrowRight) car.rotation += ROTATION_SPEED * steeringDirection;
                    } else if (car.isBot) {
                        const centerX = trackData.center.x;
                        const centerY = trackData.center.y;
                        const angleToCenter = calculateAngle(centerX, centerY, car.x, car.y);
                        const targetTangentAngle = angleToCenter + Math.PI / 2;
                        const currentAngleRad = (car.rotation * Math.PI / 180);
                        let angleDiff = targetTangentAngle - currentAngleRad;
                        while (angleDiff <= -Math.PI) angleDiff += 2 * Math.PI;
                        while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
                        const steeringCorrection = angleDiff * (180 / Math.PI) * BOT_STEERING_SENSITIVITY;
                        car.rotation += steeringCorrection;
                        const midRadius = (trackData.innerRadius + trackData.outerRadius) / 2;
                        const distFromCenter = Math.sqrt((car.x - centerX)**2 + (car.y - centerY)**2);
                        const distCorrection = (midRadius - distFromCenter) * BOT_CENTERING_FACTOR;
                        car.rotation += distCorrection;
                    }
                }


                // 5. Update Position (remains same)
                const moveDistance = car.speed * deltaTime * 60;
                const radians = car.rotation * Math.PI / 180;
                const newX = car.x + Math.sin(radians) * moveDistance;
                const newY = car.y - Math.cos(radians) * moveDistance;

                // 6. Boundary Check (remains same)
                const distSq = Math.pow(newX - trackData.center.x, 2) + Math.pow(newY - trackData.center.y, 2);
                if (distSq > trackData.innerRadius * trackData.innerRadius && distSq < trackData.outerRadius * trackData.outerRadius) {
                    car.x = newX;
                    car.y = newY;
                } else {
                    car.speed *= WALL_BOUNCE_FACTOR;
                    car.x -= Math.sin(radians) * moveDistance * WALL_STICK_PREVENTION;
                    car.y += Math.cos(radians) * moveDistance * WALL_STICK_PREVENTION;
                }

                // 7. Lap Counting Logic - Angle Based
                const centerX = trackData.center.x;
                const centerY = trackData.center.y;

                // Calculate angles relative to track center (atan2 returns values between -PI and PI)
                // Angle 0 is right, PI/2 is bottom, PI/-PI is left, -PI/2 is top
                const prevAngle = Math.atan2(prevY - centerY, prevX - centerX);
                const currentAngle = Math.atan2(car.y - centerY, car.x - centerX);

                // Check for crossing the finish line angle (-PI/2) clockwise
                // This means moving from an angle > -PI/2 (top-right quadrant)
                // to an angle <= -PI/2 (top-left quadrant)
                const crossedFinishLineAngle = prevAngle > -Math.PI / 2 && currentAngle <= -Math.PI / 2;

                // Ensure the crossing happens in the top half (Y < centerY) as an extra check, although angle check should suffice
                const crossedFinishLine = crossedFinishLineAngle && car.y < centerY;

                // Log relevant data just before the check for the player car
                if (idx === currentPlayerIndexRef.current && Math.abs(car.y - (centerY - trackData.outerRadius)) < 50) { // Log near the finish line area
                     // Log angles in degrees for easier reading
                     const prevAngleDeg = (prevAngle * 180 / Math.PI).toFixed(1);
                     const currentAngleDeg = (currentAngle * 180 / Math.PI).toFixed(1);
                    //  console.log(`LapCheck[${car.id.substring(0,6)}]: Lap=${car.lap}, JustCompleted=${car.justCompletedLap}, Speed=${car.speed.toFixed(1)}, Pos=(${prevX.toFixed(0)},${prevY.toFixed(0)})->(${car.x.toFixed(0)},${car.y.toFixed(0)}), Angles=(${prevAngleDeg} -> ${currentAngleDeg}), Crossed=${crossedFinishLine}`);
                }

                if (crossedFinishLine && !car.justCompletedLap && car.speed > 0.1) {
                    car.lap += 1;
                    car.justCompletedLap = true;
                    console.log(`%cLAP COUNTED: Car ${car.id} completed lap ${car.lap}`, 'color: black; background: yellow; font-weight: bold;');

                    if (idx === currentPlayerIndexRef.current) {
                        setCurrentLap(car.lap);
                        console.log(`Context setCurrentLap called with: ${car.lap}`);
                    }

                    if (!gameEnded && car.lap >= totalLaps) {
                        console.log(`%cGame end condition met for ${car.id}`, 'color: red; font-weight: bold;');
                        endGame(car.address);
                    }
                }

                // Reset flag logic (remains same - check if on left half)
                const passedResetPoint = car.x < centerX;
                if (car.justCompletedLap && passedResetPoint) {
                     car.justCompletedLap = false;
                }

            }); // --- End of forEach car loop ---

            // ... (Update Rendering State, Update UI State) ...
             // Update Rendering State
            setCarPositions(playerCarsRef.current.map(c => ({ ...c })));

            // Update UI State
            if (loopCounter.current % UI_UPDATE_INTERVAL === 0) {
                const updatedPositions = playerCarsRef.current.map(car => {
                    const carAngle = Math.atan2(car.y - trackData.center.y, car.x - trackData.center.x);
                    let progressAngle = normalizeAngle(carAngle - Math.PI / 2);
                    if (progressAngle < 0) progressAngle += 2 * Math.PI;
                    const progressFraction = (2 * Math.PI - progressAngle) / (2 * Math.PI);
                    return {
                        id: car.id, // Use consistent ID
                        name: car.name, // Use generated name
                        color: car.color, lap: car.lap,
                        progress: car.lap + progressFraction,
                        isCurrentPlayer: car.address === walletAddress
                    };
                });
                updatedPositions.sort((a, b) => b.progress - a.progress);
                setPlayerPositionsUI(updatedPositions);

                const playerCar = playerCarsRef.current[currentPlayerIndexRef.current];
                if (playerCar) {
                    setDebug({
                        fps: currentFps, speed: playerCar.speed.toFixed(2),
                        rotation: playerCar.rotation.toFixed(1),
                        x: playerCar.x.toFixed(1), y: playerCar.y.toFixed(1),
                    });
                }
            }


        } else { // Game ended or not ready
             if (loopCounter.current % UI_UPDATE_INTERVAL === 0) {
                setDebug(prev => ({ ...prev, fps: currentFps }));
             }
        }

        // --- Loop Continuation --- (remains same)
        if (!gameEnded) {
            gameEngineRef.current = requestAnimationFrame(gameLoop);
        } else {
            console.log("Game ended flag is true, stopping loop.");
            stopGameEngine();
        }

    }, [gameEnded, setCurrentLap, totalLaps, endGame, walletAddress]); // Dependencies

    // ... (Engine Start/Stop, useEffect cleanup, Event Handlers) ...
     // --- Engine Start/Stop ---
     const startGameEngine = useCallback(() => {
        if (gameEngineRef.current || !trackDataRef.current) return;
        console.log("%cRaceGame: Starting Engine...", "color: green; font-weight: bold;");
        lastFrameTimeRef.current = performance.now();
        loopCounter.current = 0;
        gameEngineRef.current = requestAnimationFrame(gameLoop);
    }, [gameLoop]);

    const stopGameEngine = useCallback(() => {
        if (gameEngineRef.current) {
            console.log("%cRaceGame: Stopping Engine.", "color: red;");
            cancelAnimationFrame(gameEngineRef.current);
            gameEngineRef.current = null;
        }
    }, []);

    // --- useEffect for focus and cleanup ---
    useEffect(() => {
        gameContainerRef.current?.focus();
        return () => {
            stopGameEngine();
        };
    }, [stopGameEngine]);

    // --- Event Handlers ---
    const handleReturnToLobby = () => {
        stopGameEngine();
        resetGame();
        navigate(`/race/room/${roomCode}`);
    };


    // --- Render --- (remains same)
    return (
        <div
            ref={gameContainerRef}
            className="relative w-full h-screen overflow-hidden bg-[#000016] outline-none"
            tabIndex={0}
            onFocus={() => console.log("Game container focused")}
            onBlur={() => console.log("Game container lost focus")}
        >
            {/* Track Layer */}
            <Track
                width={window.innerWidth}
                height={window.innerHeight}
                onTrackLoad={handleTrackLoad}
            />

            {/* Car Layer */}
            {carsReadyToRender && carPositions.map((car) => (
                <Car
                    key={car.id} 
                    x={car.x} y={car.y}
                    rotation={car.rotation} color={car.color}
                    isCurrentPlayer={car.isCurrentPlayer} playerName={car.name}
                />
            ))}

            {/* UI Layer */}
            {carsReadyToRender && (
                <GameControls
                    currentLap={currentLap} // Reads from context
                    totalLaps={totalLaps}
                    playerPositions={playerPositionsUI} // Use UI sorted state
                    // Find current player index in the UI-specific array for highlighting
                    currentPlayerIndex={playerPositionsUI.findIndex(p => p.isCurrentPlayer)}
                    gameEnded={gameEnded}
                    winner={winner ? { // Format winner data for UI using address
                        name: players.find(p => p.address === winner)?.name || winner.slice(0,6), // Use name from context players
                        color: players.find(p => p.address === winner)?.color || '#ffffff',
                        isCurrentPlayer: winner === walletAddress
                    } : null}
                    onReturnToLobby={handleReturnToLobby} // Use updated handler
                />
            )}

            {/* Debug Overlay */}
            <div className="absolute top-20 right-4 bg-black/70 text-white p-2 text-xs font-mono z-50 pointer-events-none">
                <div>Loop: {gameEngineRef.current ? 'RUNNING' : 'STOPPED'} (#{loopCounter.current})</div>
                <div>FPS: {debug.fps}</div>
                <div>Speed: {debug.speed}</div>
                <div>Rotation: {debug.rotation}</div>
                <div>Pos (X,Y): {debug.x}, {debug.y}</div>
                <div>Keys: {JSON.stringify(keys)}</div>
                <div className="mt-2 pointer-events-auto">
                    <button onClick={startGameEngine} className="bg-green-500 p-1 rounded text-white ml-2"> Force Start </button>
                    <button onClick={stopGameEngine} className="bg-yellow-500 p-1 rounded text-white ml-2"> Force Stop </button>
                </div>
                 <div>Game Ended: {gameEnded ? 'YES' : 'NO'}</div>
                 <div>Player Idx: {currentPlayerIndexRef.current}</div>
                 <div>Track Loaded: {trackDataRef.current ? 'YES' : 'NO'}</div>
                 <div>Cars Ready: {carsReadyToRender ? 'YES' : 'NO'}</div>
                 <div>Player Lap (Ctx): {currentLap}</div>
                 {playerCarsRef.current[currentPlayerIndexRef.current] && (
                    <div>Player Lap (Ref): {playerCarsRef.current[currentPlayerIndexRef.current].lap}</div>
                 )}
                 {playerCarsRef.current[currentPlayerIndexRef.current] && (
                    <div>Just Completed: {playerCarsRef.current[currentPlayerIndexRef.current].justCompletedLap ? 'YES' : 'NO'}</div>
                 )}
            </div>
        </div>
    );
}
