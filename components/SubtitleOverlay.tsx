// components/SubtitleOverlay.tsx
import React from 'react';

interface SubtitleOverlayProps {
    sourceText: string;
    targetText: string;
}

export default function SubtitleOverlay({ sourceText, targetText }: SubtitleOverlayProps) {
    // Determine if both texts are completely empty to toggle visibility while maintaining structural height
    const hasText = sourceText.trim() !== "" || targetText.trim() !== "";

    return (
        <div 
            style={{
                position: 'absolute',
                bottom: '8%',
                left: '50%',
                transform: 'translateX(-50%)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                zIndex: 2147483647,
                pointerEvents: 'none',
                width: '80%',
                // Unified background box matching the legacy UI
                backgroundColor: 'rgba(12, 12, 12, 0.85)',
                padding: '12px 24px',
                borderRadius: '8px',
                minHeight: '80px', // Constant height to prevent jumping
                opacity: hasText ? 1 : 0, // Hides the box gracefully when no subs are active
                transition: 'opacity 0.15s ease-in-out',
                boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
            }}
        >
            {/* Target Language - Large & Accent Color */}
            <div style={{
                color: '#F39C12', // Orange/Yellow accent matching the image
                fontSize: '22px',
                fontFamily: '"YouTube Noto", Roboto, Arial, sans-serif',
                fontWeight: '600',
                textShadow: '1px 1px 2px rgba(0,0,0,0.9)',
                marginBottom: '4px',
                minHeight: '28px' // Reserves space even if only bottom sub exists
            }}>
                {targetText}
            </div>
            
            {/* Source Language - Small & White */}
            <div style={{
                color: '#F0F0F0',
                fontSize: '16px',
                fontFamily: '"YouTube Noto", Roboto, Arial, sans-serif',
                fontWeight: '400',
                textShadow: '1px 1px 2px rgba(0,0,0,0.9)',
                minHeight: '20px'
            }}>
                {sourceText}
            </div>
        </div>
    );
}