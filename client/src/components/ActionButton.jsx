import React, { useState, useCallback } from 'react';

export default function ActionButton({
    label,
    color = '#e74c3c',
    size = 60,
    onPress,
    onRelease,
    className = ''
}) {
    const [isPressed, setIsPressed] = useState(false);

    const handleStart = useCallback((e) => {
        e.preventDefault();
        setIsPressed(true);

        // Haptic feedback if available
        if (navigator.vibrate) {
            navigator.vibrate(20);
        }

        if (onPress) onPress();
    }, [onPress]);

    const handleEnd = useCallback((e) => {
        e.preventDefault();
        setIsPressed(false);
        if (onRelease) onRelease();
    }, [onRelease]);

    return (
        <button
            className={`action-button ${className} ${isPressed ? 'pressed' : ''}`}
            style={{
                '--button-color': color,
                '--button-size': `${size}px`,
            }}
            onTouchStart={handleStart}
            onTouchEnd={handleEnd}
            onTouchCancel={handleEnd}
            onMouseDown={handleStart}
            onMouseUp={handleEnd}
            onMouseLeave={handleEnd}
        >
            <span className="action-button-label">{label}</span>
        </button>
    );
}
