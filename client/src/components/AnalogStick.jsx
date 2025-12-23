import React, { useEffect, useRef } from 'react';
import nipplejs from 'nipplejs';

export default function AnalogStick({
  position = 'left',
  onMove,
  onEnd,
  size = 120,
  color = '#4a90d9'
}) {
  const containerRef = useRef(null);
  const managerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;

    managerRef.current = nipplejs.create({
      zone: containerRef.current,
      mode: 'static',
      position: { left: '50%', top: '50%' },
      color: color,
      size: size,
      restOpacity: 0.5,
      fadeTime: 50,
      lockX: false,
      lockY: false,
    });

    managerRef.current.on('move', (evt, data) => {
      if (onMove && data.vector) {
        // nipplejs uses screen coords (up = negative Y)
        // Invert Y so up = positive (game standard)
        let x = data.vector.x;
        let y = -data.vector.y;  // Invert Y for game coordinates

        // Simple dead zone
        const deadZone = 0.1;
        const magnitude = Math.sqrt(x * x + y * y);

        if (magnitude < deadZone) {
          x = 0;
          y = 0;
        }

        onMove({ x, y, angle: data.angle?.degree || 0 });
      }
    });

    managerRef.current.on('end', () => {
      if (onEnd) onEnd();
    });

    return () => {
      if (managerRef.current) {
        managerRef.current.destroy();
      }
    };
  }, [onMove, onEnd, color, size]);

  return (
    <div
      ref={containerRef}
      className={`analog-stick analog-stick-${position}`}
      style={{
        width: size + 30,
        height: size + 30,
        position: 'relative',
      }}
    >
      <div className="analog-stick-base" />
    </div>
  );
}
