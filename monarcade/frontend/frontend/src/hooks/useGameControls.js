import { useRef, useEffect } from 'react';

// Store keys globally for simplicity during debugging
const globalKeys = {
  ArrowUp: false,
  ArrowDown: false,
  ArrowLeft: false,
  ArrowRight: false
};

export default function useGameControls() {
  const hasInitialized = useRef(false);

  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;
    console.log("Setting up keyboard controls (Global)");

    const handleKeyDown = (e) => {
      if (globalKeys.hasOwnProperty(e.key)) {
        e.preventDefault();
        if (!globalKeys[e.key]) {
             console.log(`Key DOWN: ${e.key}`);
             globalKeys[e.key] = true;
        }
      }
    };

    const handleKeyUp = (e) => {
      if (globalKeys.hasOwnProperty(e.key)) {
        e.preventDefault();
         if (globalKeys[e.key]) {
             console.log(`Key UP: ${e.key}`);
             globalKeys[e.key] = false;
         }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    window.testKeys = () => { /* ... test function ... */ };

    return () => { /* ... cleanup ... */ };
  }, []);

  return globalKeys; // Return the global object
}