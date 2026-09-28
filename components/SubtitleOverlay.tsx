// components/SubtitleOverlay.tsx
import React from 'react';

interface SubtitleOverlayProps {
    sourceText: string;
    targetText: string;
}

export default function SubtitleOverlay({ sourceText, targetText }: SubtitleOverlayProps) {
    // Return an empty structural shell if both are completely empty to save rendering,
    // otherwise render the fixed-height container to prevent jumping.
    if (!sourceText && !targetText) return null;

    return (
        <div 
            style={{
                position: 'absolute',
                bottom: '10%',
                left: '50%',
                transform: 'translateX(-50%)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'flex-end',
                textAlign: 'center',
                zIndex: 2147483647,
                pointerEvents: 'none',
                width: '80%',
                height: '110px', // Constant rigid height forces structural consistency
                gap: '8px'
            }}
        >
            {/* 
              Using opacity instead of conditional {sourceText && ...} rendering 
              guarantees the DOM element always exists, permanently preventing 
              the bottom subtitle from bouncing up and down.
            */}
            <div style={{
                opacity: sourceText ? 1 : 0,
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                color: '#ffffff',
                padding: '4px 12px',
                borderRadius: '4px',
                fontSize: '24px',
                fontFamily: '"YouTube Noto", Roboto, Arial, sans-serif',
                fontWeight: '500',
                textShadow: '1px 1px 2px rgba(0,0,0,0.8)',
                transition: 'opacity 0.1s ease-in-out'
            }}>
                {sourceText || " "}
            </div>
            
            <div style={{
                opacity: targetText ? 1 : 0,
                backgroundColor: 'rgba(0, 0, 0, 0.7)',
                color: '#e0e0e0',
                padding: '2px 10px',
                borderRadius: '4px',
                fontSize: '16px',
                fontFamily: '"YouTube Noto", Roboto, Arial, sans-serif',
                textShadow: '1px 1px 2px rgba(0,0,0,0.8)',
                transition: 'opacity 0.1s ease-in-out'
            }}>
                {targetText || " "}
            </div>
        </div>
    );
}