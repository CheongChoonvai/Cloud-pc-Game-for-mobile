import React, { useState, useCallback } from 'react';

export default function DPad({ onPress, onRelease }) {
    const [activeDirection, setActiveDirection] = useState(null);

    const handlePress = useCallback((direction) => (e) => {
        e.preventDefault();
        setActiveDirection(direction);
        if (navigator.vibrate) {
            navigator.vibrate(15);
        }
        if (onPress) onPress(direction);
    }, [onPress]);

    const handleRelease = useCallback((direction) => (e) => {
        e.preventDefault();
        setActiveDirection(null);
        if (onRelease) onRelease(direction);
    }, [onRelease]);

    const directions = ['up', 'right', 'down', 'left'];

    return (
        <div className="dpad-container">
            {directions.map((dir) => (
                <button
                    key={dir}
                    className={`dpad-button dpad-${dir} ${activeDirection === dir ? 'pressed' : ''}`}
                    onTouchStart={handlePress(dir)}
                    onTouchEnd={handleRelease(dir)}
                    onTouchCancel={handleRelease(dir)}
                    onMouseDown={handlePress(dir)}
                    onMouseUp={handleRelease(dir)}
                    onMouseLeave={handleRelease(dir)}
                >
                    <span className="dpad-arrow">▲</span>
                </button>
            ))}
            <div className="dpad-center" />
        </div>
    );
}
