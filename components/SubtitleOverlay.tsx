// components/SubtitleOverlay.tsx
import { storage } from '#imports';
import React, { useState, useEffect } from 'react';
import SubtitleLoading from './SubtitleLoading';

interface SubtitleOverlayProps {
    sourceText: string;
    targetText: string;
    isFetchingSubtitles?: boolean;
    loadingMessage?: string;
    isTranslatingChunk?: boolean;
}

export default function SubtitleOverlay({
    sourceText,
    targetText,
    isFetchingSubtitles = false,
    loadingMessage = 'Fetching subtitles...',
    isTranslatingChunk = false
}: SubtitleOverlayProps) {
    const hasText = sourceText.trim() !== "" || targetText.trim() !== "";
    const isVisible = hasText || isFetchingSubtitles;

    const [sourceFontSize, setSourceFontSize] = useState<number>(22);
    const [targetFontSize, setTargetFontSize] = useState<number>(16);
    const [windowWidth, setWindowWidth] = useState<number>(80);
    const [verticalPosition, setVerticalPosition] = useState<number>(8);

    useEffect(() => {
        async function fetchData() {
            const [
                storedSourceFontSize,
                storedTargetFontSize,
                storedWindowWidth,
                storedVerticalPosition
            ] = await Promise.all([
                storage.getItem<number>('local:sourceFontSize'),
                storage.getItem<number>('local:targetFontSize'),
                storage.getItem<number>('local:windowWidth'),
                storage.getItem<number>('local:verticalPosition')
            ]);

            if (storedSourceFontSize !== null && storedSourceFontSize !== undefined) {
                setSourceFontSize(storedSourceFontSize);
            }
            if (storedTargetFontSize !== null && storedTargetFontSize !== undefined) {
                setTargetFontSize(storedTargetFontSize);
            }
            if (storedWindowWidth !== null && storedWindowWidth !== undefined) {
                setWindowWidth(storedWindowWidth);
            }
            if (storedVerticalPosition !== null && storedVerticalPosition !== undefined) {
                setVerticalPosition(storedVerticalPosition);
            }
        }

        const unwatchTargetFontSize = storage.watch<number>('local:targetFontSize', (newCount) => {
            if (newCount !== null && newCount !== undefined) setTargetFontSize(newCount);
        });

        const unwatchSourceFontSize = storage.watch<number>('local:sourceFontSize', (newCount) => {
            if (newCount !== null && newCount !== undefined) setSourceFontSize(newCount);
        });

        const unwatchWindowWidth = storage.watch<number>('local:windowWidth', (newCount) => {
            if (newCount !== null && newCount !== undefined) setWindowWidth(newCount);
        });

        const unwatchVerticalPosition = storage.watch<number>('local:verticalPosition', (newCount) => {
            if (newCount !== null && newCount !== undefined) setVerticalPosition(newCount);
        });

        fetchData();

        return () => {
            unwatchTargetFontSize();
            unwatchSourceFontSize();
            unwatchWindowWidth();
            unwatchVerticalPosition();
        };
    }, []);

    return (
        <div
            style={{
                position: 'absolute',
                bottom: `${verticalPosition}%`,
                left: '50%',
                transform: 'translateX(-50%)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                zIndex: 2147483647,
                pointerEvents: 'none',
                width: `${windowWidth}%`,
                backgroundColor: 'rgba(12, 12, 12, 0.85)',
                padding: '12px 24px',
                borderRadius: '8px',
                minHeight: '80px',
                opacity: isVisible ? 1 : 0,
                transition: 'opacity 0.15s ease-in-out',
                boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
            }}
        >
            {!hasText && isFetchingSubtitles ? (
                <SubtitleLoading mode="overlay" text={loadingMessage} />
            ) : (
                <>
                    {/* Source Language - Supports multi-line breaks */}
                    <div
                        style={{
                            color: '#F39C12',
                            fontSize: `${sourceFontSize}px`,
                            fontFamily: '"YouTube Noto", Roboto, Arial, sans-serif',
                            fontWeight: '600',
                            textShadow: '1px 1px 2px rgba(0,0,0,0.9)',
                            marginBottom: '4px',
                            whiteSpace: 'pre-line'
                        }}
                    >
                        {sourceText}
                    </div>

                    {/* Target Language - Supports multi-line breaks and inline chunk loading */}
                    <div
                        style={{
                            color: '#F0F0F0',
                            fontSize: `${targetFontSize}px`,
                            fontFamily: '"YouTube Noto", Roboto, Arial, sans-serif',
                            fontWeight: '400',
                            textShadow: '1px 1px 2px rgba(0,0,0,0.9)',
                            minHeight: '20px',
                            whiteSpace: 'pre-line'
                        }}
                    >
                        {isTranslatingChunk ? (
                            <SubtitleLoading mode="inline" text="Translating..." />
                        ) : (
                            targetText
                        )}
                    </div>
                </>
            )}
        </div>
    );
}