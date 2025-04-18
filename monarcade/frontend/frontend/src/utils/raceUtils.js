// Helper function to check collision between two cars


export const checkCarCollision = (car1, car2, minDistance = 40) => {
    const dx = car1.x - car2.x;
    const dy = car1.y - car2.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    return distance < minDistance;
  };
  
  // Helper function to handle car-to-car collision
  export const handleCarCollision = (car1, car2) => {
    // Calculate collision angle
    const dx = car2.x - car1.x;
    const dy = car2.y - car1.y;
    const collisionAngle = Math.atan2(dy, dx);
    
    // Calculate velocities in collision direction
    const car1Speed = car1.speed;
    const car2Speed = car2.speed;
    
    // Calculate new velocities (simplified elastic collision)
    const car1NewSpeed = (car1Speed * 0.2) + (car2Speed * 0.8);
    const car2NewSpeed = (car2Speed * 0.2) + (car1Speed * 0.8);
    
    return {
      car1Speed: car1NewSpeed,
      car2Speed: car2NewSpeed
    };
  };
  
  // Generate a random room code
  export const generateRoomCode = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
  };
  
  // Format wallet address for display
  export const formatAddress = (address) => {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };
  
  // Convert hex color to RGB for manipulations
  export const hexToRgb = (hex) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  };
  
  // Add glow effect to a color
  export const addGlow = (color, amount = 0.5) => {
    const rgb = hexToRgb(color);
    if (!rgb) return color;
    
    // Increase brightness
    const r = Math.min(255, rgb.r + (255 - rgb.r) * amount);
    const g = Math.min(255, rgb.g + (255 - rgb.g) * amount);
    const b = Math.min(255, rgb.b + (255 - rgb.b) * amount);
    
    return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
  };
  
  // Calculate angle between two points
  export const calculateAngle = (x1, y1, x2, y2) => {
    return Math.atan2(y2 - y1, x2 - x1);
  };
  
  // Calculate distance between two points
  export const calculateDistance = (x1, y1, x2, y2) => {
    return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
  };
  
  // Normalize angle to be between 0 and 2π
  export const normalizeAngle = (angle) => {
    return angle < 0 ? angle + 2 * Math.PI : angle;
  };
  
  // Convert degrees to radians
  export const degToRad = (degrees) => {
    return degrees * Math.PI / 180;
  };
  
  // Convert radians to degrees
  export const radToDeg = (radians) => {
    return radians * 180 / Math.PI;
  };
  