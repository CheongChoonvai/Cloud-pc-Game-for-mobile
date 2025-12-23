import React, { useEffect, useRef } from 'react';
import nipplejs from 'nipplejs';

export default function Joystick({ onMove, onEnd }) {
  const joystickRef = useRef(null);
  const managerRef = useRef(null);

  useEffect(() => {
    if (!joystickRef.current) return;
    managerRef.current = nipplejs.create({
      zone: joystickRef.current,
      mode: 'static',
      position: { left: '50%', top: '50%' },
      color: 'blue',
      size: 120,
    });
    managerRef.current.on('move', (evt, data) => {
      if (onMove && data) {
        onMove({
          angle: data.angle ? data.angle.degree : 0,
          distance: data.distance || 0,
          direction: data.direction ? data.direction.angle : null,
        });
      }
    });
    managerRef.current.on('end', () => {
      if (onEnd) onEnd();
    });
    return () => managerRef.current && managerRef.current.destroy();
  }, [onMove, onEnd]);

  return (
    <div ref={joystickRef} style={{ width: 150, height: 150, margin: '20px auto' }} />
  );
}
