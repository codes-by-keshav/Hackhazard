import { useRef, useEffect } from 'react';

export default function Track({ width, height, onTrackLoad }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Calculate track dimensions
    const centerX = width / 2;
    const centerY = height / 2;
    const outerRadius = Math.min(width, height) * 0.4;
    const innerRadius = outerRadius * 0.6;

    // Draw track background
    ctx.fillStyle = '#000016';
    ctx.fillRect(0, 0, width, height);

    // Draw outer track
    ctx.beginPath();
    ctx.arc(centerX, centerY, outerRadius, 0, Math.PI * 2);
    ctx.fillStyle = '#333';
    ctx.fill();

    // Draw inner track (hole)
    ctx.beginPath();
    ctx.arc(centerX, centerY, innerRadius, 0, Math.PI * 2);
    ctx.fillStyle = '#000016';
    ctx.fill();

    // Draw start/finish line
    ctx.beginPath();
    ctx.moveTo(centerX, centerY - outerRadius);
    ctx.lineTo(centerX, centerY - innerRadius);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 5;
    ctx.stroke();

    // Draw direction arrows with tails pointing tangentially clockwise
    const numArrows = 8;
    const arrowLength = 15; // Total length of arrow (tail + head)
    const arrowHeadSize = 8; // Size of the arrowhead triangle part
    const arrowColor = 'rgba(255, 255, 255, 0.5)';
    const midRadius = (innerRadius + outerRadius) / 2;

    ctx.strokeStyle = arrowColor; // Use stroke for the tail
    ctx.fillStyle = arrowColor;   // Use fill for the head
    ctx.lineWidth = 2;

    for (let i = 0; i < numArrows; i++) {
        // Angle for arrow position (0 = right, PI/2 = bottom, PI = left, -PI/2 = top)
        const positionAngle = (i / numArrows) * Math.PI * 2;

        // Position on the centerline
        const x = centerX + Math.cos(positionAngle) * midRadius;
        const y = centerY + Math.sin(positionAngle) * midRadius;

        // Angle for arrow direction (tangent, clockwise)
        // This angle represents the direction the arrow should point in the original coordinate system
        const tangentAngle = positionAngle + Math.PI / 2;

        ctx.save();
        ctx.translate(x, y);
        // Rotate the coordinate system TO the direction the arrow should point
        ctx.rotate(tangentAngle);

        // Draw the arrow pointing along the POSITIVE X-axis in the *rotated* frame
        // This ensures the arrow aligns with the tangent direction

        // Draw tail (line from back to base of head)
        ctx.beginPath();
        ctx.moveTo(-arrowLength / 2, 0); // Start at the back (negative X)
        ctx.lineTo(arrowLength / 2 - arrowHeadSize, 0); // End at the base of the head (towards positive X)
        ctx.stroke();

        // Draw triangle head
        ctx.beginPath();
        ctx.moveTo(arrowLength / 2, 0); // Tip of the arrow (most positive X)
        ctx.lineTo(arrowLength / 2 - arrowHeadSize, arrowHeadSize / 2); // Top base of head
        ctx.lineTo(arrowLength / 2 - arrowHeadSize, -arrowHeadSize / 2); // Bottom base of head
        ctx.closePath();
        ctx.fill();

        ctx.restore(); // Restore original context state
    }

    // Create track boundaries data for collision detection
    const trackData = {
      center: { x: centerX, y: centerY },
      innerRadius,
      outerRadius
    };

    // Notify parent component that track is ready
    if (onTrackLoad) {
      onTrackLoad(trackData);
    }
  }, [width, height, onTrackLoad]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute top-0 left-0 z-0"
      width={width}
      height={height}
    />
  );
}