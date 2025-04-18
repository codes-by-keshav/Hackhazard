import React from 'react';

export default function Car({
  x,
  y,
  rotation,
  color,
  isCurrentPlayer = false,
  playerName = ''
}) {
  // Don't render if position is not set (check specifically for null/undefined)
  if (x == null || y == null) {
      console.log(`Car ${playerName} not rendered, position missing: x=${x}, y=${y}`);
      return null;
  }

  // --- Rest of your Car component code ---
  // (Using the previous enhanced version is fine)
  return (
    <div
      className={`absolute ${isCurrentPlayer ? 'z-20' : 'z-10'}`}
      style={{
        left: `${x}px`,
        top: `${y}px`,
        width: '24px',
        height: '48px',
        backgroundColor: color,
        borderRadius: '5px',
        transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
        transformOrigin: 'center center',
        boxShadow: `0 0 ${isCurrentPlayer ? '15px' : '8px'} ${color}`,
        border: isCurrentPlayer ? '2px solid white' : 'none'
      }}
    >
      {/* Triangle for car front */}
      <div
        style={{
          position: 'absolute',
          top: '-10px', // Adjusted slightly for better positioning relative to body
          left: '50%', // Center horizontally relative to parent
          transform: 'translateX(-50%)', // Ensure it's centered
          width: '0',
          height: '0',
          borderLeft: '7px solid transparent', // Adjust size if needed
          borderRight: '7px solid transparent', // Adjust size if needed
          borderBottom: `14px solid white` // Use white for contrast
        }}
      />

      {playerName && (
        <div
          className="absolute whitespace-nowrap text-xs font-bold"
          tyle={{
            top: '-28px', // Position above the triangle
            left: '50%',
            transform: 'translateX(-50%)', // Center the text box
            color: 'white',
            textShadow: '0 0 3px #000, 0 0 1px #000', // Subtle shadow
            backgroundColor: 'rgba(0,0,0,0.6)', // Slightly less opaque
            padding: '1px 4px', // Adjust padding
            borderRadius: '3px',
            zIndex: 99
          }}
        >
          {playerName}
        </div>
      )}
    </div>
  );
}