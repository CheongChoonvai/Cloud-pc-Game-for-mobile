
import { useState } from 'react';

const NavigationDock = ({ status, onNavigate, onToggleMenu }) => {
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [position, setPosition] = useState({ x: 20, y: 20 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
            setIsFullscreen(true);
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
                setIsFullscreen(false);
            }
        }
    };

    // Drag Handlers
    const handleStart = (clientX, clientY) => {
        setIsDragging(true);
        setDragOffset({
            x: clientX - position.x,
            y: clientY - position.y
        });
    };

    const handleMove = (clientX, clientY) => {
        if (isDragging) {
            setPosition({
                x: clientX - dragOffset.x,
                y: clientY - dragOffset.y
            });
        }
    };

    const handleEnd = () => {
        setIsDragging(false);
    };

    // Mouse events
    const onMouseDown = (e) => handleStart(e.clientX, e.clientY);
    const onMouseMove = (e) => handleMove(e.clientX, e.clientY);
    const onMouseUp = () => handleEnd();

    // Touch events
    const onTouchStart = (e) => handleStart(e.touches[0].clientX, e.touches[0].clientY);
    const onTouchMove = (e) => handleMove(e.touches[0].clientX, e.touches[0].clientY);
    const onTouchEnd = () => handleEnd();

    const glassStyle = {
        background: 'rgba(15, 15, 20, 0.6)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '20px', // Slightly smaller radius
        padding: isCollapsed ? '6px' : '4px 12px', // Reduced padding
        display: 'flex',
        alignItems: 'center',
        gap: '12px', // Reduced gap
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
        pointerEvents: 'auto',
        transition: isDragging ? 'none' : 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)', // No transition during drag
        cursor: isDragging ? 'grabbing' : (isCollapsed ? 'pointer' : 'grab'),
        width: isCollapsed ? '32px' : 'auto', // Smaller collapsed width
        height: isCollapsed ? '32px' : 'auto', // Fixed height for collapsed
        justifyContent: isCollapsed ? 'center' : 'flex-start',
        overflow: 'hidden'
    };

    const iconButtonStyle = {
        background: 'transparent',
        border: 'none',
        color: 'white',
        fontSize: '16px', // Smaller icons
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '6px', // Smaller padding
        borderRadius: '50%',
        transition: 'background 0.2s',
        opacity: 0.8,
        minWidth: '32px' // Smaller button area
    };

    const StatusDot = ({ status }) => {
        let color = '#ef4444';
        if (status === 'connected') color = '#22c55e';
        if (status === 'error') color = '#eab308';

        return (
            <div style={{
                width: '8px', height: '8px', borderRadius: '50%', // Smaller dot
                backgroundColor: color,
                boxShadow: `0 0 8px ${color}`,
                flexShrink: 0,
                transition: 'all 0.3s ease'
            }} />
        );
    };

    // Attach global event listeners for drag while dragging
    if (isDragging) {
        // This is a simple way to track drag outside the element
        window.onmousemove = onMouseMove;
        window.onmouseup = onMouseUp;
        window.ontouchmove = onTouchMove;
        window.ontouchend = onTouchEnd;
    } else {
        window.onmousemove = null;
        window.onmouseup = null;
        window.ontouchmove = null;
        window.ontouchend = null;
    }

    return (
        <div
            style={{
                position: 'fixed',
                left: position.x,
                top: position.y,
                zIndex: 1000,
                width: 'fit-content',
                touchAction: 'none' // Prevent scrolling while dragging
            }}
            onMouseDown={onMouseDown}
            onTouchStart={onTouchStart}
        >
            <div
                style={glassStyle}
                onClick={(e) => {
                    if (!isDragging && isCollapsed) setIsCollapsed(false);
                }}
            >
                {/* Status Indicator (Click to toggle) */}
                <div
                    onClick={(e) => {
                        e.stopPropagation();
                        if (!isDragging) setIsCollapsed(!isCollapsed);
                    }}
                    style={{ cursor: 'pointer', padding: '4px' }}
                    title={isCollapsed ? "Show Menu" : "Hide Menu"}
                >
                    <StatusDot status={status} />
                </div>

                {/* Content - only visible when not collapsed */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    opacity: isCollapsed ? 0 : 1,
                    width: isCollapsed ? 0 : 'auto',
                    pointerEvents: isCollapsed ? 'none' : 'auto',
                    transition: 'all 0.3s ease',
                    transform: isCollapsed ? 'translateX(-20px)' : 'translateX(0)',
                }}>
                    {/* Divider */}
                    <div style={{ width: '1px', height: '14px', background: 'rgba(255,255,255,0.1)' }} />

                    {/* Menu Button */}
                    <button
                        onClick={onToggleMenu}
                        onMouseDown={e => e.stopPropagation()} // Prevent drag start on button click
                        onTouchStart={e => e.stopPropagation()}
                        style={iconButtonStyle}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="3" y1="12" x2="21" y2="12"></line>
                            <line x1="3" y1="6" x2="21" y2="6"></line>
                            <line x1="3" y1="18" x2="21" y2="18"></line>
                        </svg>
                    </button>

                    {/* Settings Button */}
                    <button
                        onClick={() => onNavigate('settings')}
                        onMouseDown={e => e.stopPropagation()}
                        onTouchStart={e => e.stopPropagation()}
                        style={iconButtonStyle}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path>
                            <circle cx="12" cy="12" r="3"></circle>
                        </svg>
                    </button>

                    {/* Fullscreen Button */}
                    <button
                        onClick={toggleFullscreen}
                        onMouseDown={e => e.stopPropagation()}
                        onTouchStart={e => e.stopPropagation()}
                        style={iconButtonStyle}
                    >
                        {isFullscreen ? (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path>
                            </svg>
                        ) : (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
                            </svg>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default NavigationDock;
