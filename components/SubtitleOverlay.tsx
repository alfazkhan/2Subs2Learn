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

// Renders the dual-subtitle overlay box and dynamically watches user style preferences
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
    const [modelDownloading, setModelDownloading] = useState<boolean | number>(false)

    // Fetch initial display settings concurrently and subscribe to live changes via storage.watch
    useEffect(() => {
        async function fetchData() {
            const [
                storedSourceFontSize,
                storedTargetFontSize,
                storedWindowWidth,
                storedVerticalPosition,
                modelDownloadProgress
            ] = await Promise.all([
                storage.getItem<number>('local:sourceFontSize'),
                storage.getItem<number>('local:targetFontSize'),
                storage.getItem<number>('local:windowWidth'),
                storage.getItem<number>('local:verticalPosition'),
                storage.getItem<{ status: string, progress: number }>('local:modelDownloadProgress')
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
            if (modelDownloadProgress !== null && modelDownloadProgress !== undefined) {
                setModelDownloading(modelDownloadProgress?.progress);
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

        const unwatchModelDownloading = storage.watch<{ status: string, progress: number }>('local:modelDownloadProgress', (newCount) => {
            if (newCount !== null && newCount !== undefined) setModelDownloading(newCount?.progress);
        });

        fetchData();

        return () => {
            unwatchTargetFontSize();
            unwatchSourceFontSize();
            unwatchWindowWidth();
            unwatchVerticalPosition();
            unwatchModelDownloading();
        };
    }, []);

    if (modelDownloading && typeof modelDownloading === 'number' && modelDownloading < 100) {
        return (
            <div
                className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[9999] pointer-events-none"
                style={{
                    width: `${windowWidth}%`,
                    opacity: isVisible ? 1 : 0,
                    transition: 'opacity 0.2s ease-in-out',
                    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6)'
                }}
            >
                <div className="card bg-base-100/95 card-xl shadow-lg backdrop-blur-sm overflow-hidden">
                    <div className="card-body p-4">
                        {/* Progress Bar */}
                        <div className="progress w-full h-2 mb-3">
                            <progress
                                className="progress progress-primary progress-md"
                                value={modelDownloading}
                                max="100"
                            />
                        </div>

                        {/* Download Info */}
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex flex-col gap-1">
                                <h2 className="card-title text-base text-primary">Downloading Model</h2>
                                <p className="text-sm text-base-content/70">In progress...</p>
                            </div>
                            
                            {/* Spinner Indicator */}
                            <div className="loading loading-spinner loading-sm text-primary opacity-50"></div>
                        </div>

                        {/* Download Speed Badge (optional enhancement) */}
                        {modelDownloading > 20 && (
                            <div className="badge badge-success badge-sm gap-1 mt-2">
                                🌍 Translation Model v2.1
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

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
                        data-subtitle-track="source"
                        style={{
                            color: '#F39C12',
                            fontSize: `${sourceFontSize}px`,
                            fontFamily: '"YouTube Noto", Roboto, Arial, sans-serif',
                            fontWeight: '600',
                            textShadow: '1px 1px 2px rgba(0,0,0,0.9)',
                            marginBottom: '4px',
                            whiteSpace: '-moz-pre-wrap'
                        }}
                    >
                        {sourceText}
                    </div>

                    {/* Target Language - Supports multi-line breaks and inline chunk loading */}
                    <div
                        data-subtitle-track="target"
                        style={{
                            color: '#F0F0F0',
                            fontSize: `${targetFontSize}px`,
                            fontFamily: '"YouTube Noto", Roboto, Arial, sans-serif',
                            fontWeight: '400',
                            textShadow: '1px 1px 2px rgba(0,0,0,0.9)',
                            minHeight: '20px',
                            whiteSpace: '-moz-pre-wrap'
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