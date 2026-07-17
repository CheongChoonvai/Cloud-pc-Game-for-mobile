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
    const arrows = {
        up: '▲',
        right: '▶',
        down: '▼',
        left: '◀',
    };

    return (
        <div className="dpad-container">
            {directions.map((dir) => (
                <button
                    type="button"
                    key={dir}
                    className={`dpad-button dpad-${dir} ${activeDirection === dir ? 'pressed' : ''}`}
                    onPointerDown={handlePress(dir)}
                    onPointerUp={handleRelease(dir)}
                    onPointerCancel={handleRelease(dir)}
                    onPointerLeave={(e) => {
                        if (e.pointerType === 'mouse') {
                            handleRelease(dir)(e);
                        }
                    }}
                    onContextMenu={(e) => e.preventDefault()}
                    style={{ touchAction: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}
                >
                    <span className="dpad-arrow">{arrows[dir]}</span>
                </button>
            ))}
            <div className="dpad-center" />
        </div>
    );
}
