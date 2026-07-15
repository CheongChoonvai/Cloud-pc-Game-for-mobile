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
        e.stopPropagation();
        setIsPressed(true);

        if (navigator.vibrate) {
            navigator.vibrate(20);
        }

        if (onPress) onPress();
    }, [onPress]);

    const handleEnd = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsPressed(false);
        if (onRelease) onRelease();
    }, [onRelease]);

    return (
        <button
            type="button"
            className={`action-button ${className} ${isPressed ? 'pressed' : ''}`}
            style={{
                '--button-color': color,
                '--button-size': `${size}px`,
                touchAction: 'none',
                WebkitUserSelect: 'none',
                userSelect: 'none',
            }}
            onPointerDown={handleStart}
            onPointerUp={handleEnd}
            onPointerCancel={handleEnd}
            onPointerLeave={(e) => {
                if (e.pointerType === 'mouse') {
                    handleEnd(e);
                }
            }}
            onContextMenu={(e) => e.preventDefault()}
        >
            <span className="action-button-label">{label}</span>
        </button>
    );
}
