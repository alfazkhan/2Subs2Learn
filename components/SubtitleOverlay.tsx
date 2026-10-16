// components/SubtitleOverlay.tsx
import { storage } from '#imports';
import React from 'react';

interface SubtitleOverlayProps {
    sourceText: string;
    targetText: string;
}

export default function SubtitleOverlay({ sourceText, targetText }: SubtitleOverlayProps) {
    // Determine if both texts are completely empty to toggle visibility while maintaining structural height
    const hasText = sourceText.trim() !== "" || targetText.trim() !== "";
    const [sourceFontSize, setSourceFontSize] = React.useState<number | null>(22)
    const [targetFontSize, setTargetFontSize] = React.useState<number | null>(16)

    React.useEffect(() => {
        async function fetchData() {
            const translationPref = await storage.getItem('local:translationPref');
            const sourceFontSize = await storage.getItem<number>('local:sourceFontSize');
            const targetFontSize = await storage.getItem<number>('local:targetFontSize');
            setSourceFontSize(sourceFontSize)
            setTargetFontSize(targetFontSize)
        }
        const unwatchTargetFontSize = storage.watch<number>('local:targetFontSize', (newCount, oldCount) => {
            setTargetFontSize(newCount)
            console.log('Target Font Changed:', { newCount, oldCount });
        });
        const unwatchSourceFontSize = storage.watch<number>('local:sourceFontSize', (newCount, oldCount) => {
            setSourceFontSize(newCount)
            console.log('Source Font Changed:', { newCount, oldCount });
        });
        fetchData()

        return () => {
            unwatchTargetFontSize()
            unwatchSourceFontSize()
        }
    }, [])

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
                backgroundColor: 'rgba(12, 12, 12, 0.85)',
                padding: '12px 24px',
                borderRadius: '8px',
                minHeight: '80px', // Constant height to prevent jumping
                opacity: hasText ? 1 : 0, // Hides the box gracefully when no subs are active
                transition: 'opacity 0.15s ease-in-out',
                boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
            }}
        >
            {/* Source Language - Large & Accent Color */}
            <div style={{
                color: '#F39C12', // Orange/Yellow accent matching the image
                fontSize: `${sourceFontSize}px` || '22px',
                fontFamily: '"YouTube Noto", Roboto, Arial, sans-serif',
                fontWeight: '600',
                textShadow: '1px 1px 2px rgba(0,0,0,0.9)',
                marginBottom: '4px',
                // minHeight: '28px' // Reserves space even if only bottom sub exists
            }}>
                {sourceText}
            </div>

            {/* Target Language - Small & White */}
            <div style={{
                color: '#F0F0F0',
                fontSize: `${targetFontSize}px` || '16px',
                fontFamily: '"YouTube Noto", Roboto, Arial, sans-serif',
                fontWeight: '400',
                textShadow: '1px 1px 2px rgba(0,0,0,0.9)',
                minHeight: '20px'
            }}>
                {targetText}
            </div>
        </div>
    );
}