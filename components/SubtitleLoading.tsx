// components/SubtitleLoading.tsx
import React from 'react';

interface SubtitleLoadingProps {
    mode: 'overlay' | 'inline';
    text?: string;
}

export default function SubtitleLoading({ mode, text }: SubtitleLoadingProps) {
    return (
        <>
            <style>{`
                @keyframes zdfSubSpin {
                    to { transform: rotate(360deg); }
                }
                @keyframes zdfSubPulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.4; }
                }
                .zdf-fallback-spinner {
                    display: inline-block;
                    width: 22px;
                    height: 22px;
                    border: 3px solid rgba(243, 156, 18, 0.25);
                    border-top-color: #F39C12;
                    border-radius: 50%;
                    animation: zdfSubSpin 0.75s linear infinite;
                }
                .zdf-fallback-spinner-sm {
                    display: inline-block;
                    width: 14px;
                    height: 14px;
                    border: 2px solid rgba(240, 240, 240, 0.25);
                    border-top-color: #F39C12;
                    border-radius: 50%;
                    animation: zdfSubSpin 0.75s linear infinite;
                }
            `}</style>

            {mode === 'overlay' ? (
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '12px',
                        padding: '6px 12px'
                    }}
                >
                    <span className="loading loading-spinner loading-md text-warning zdf-fallback-spinner" />
                    <span
                        style={{
                            color: '#F39C12',
                            fontSize: '18px',
                            fontFamily: '"YouTube Noto", Roboto, Arial, sans-serif',
                            fontWeight: 600,
                            letterSpacing: '0.3px',
                            animation: 'zdfSubPulse 1.5s ease-in-out infinite'
                        }}
                    >
                        {text || 'Fetching subtitles...'}
                    </span>
                </div>
            ) : (
                <div
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        backgroundColor: 'rgba(243, 156, 18, 0.12)',
                        border: '1px solid rgba(243, 156, 18, 0.35)',
                        padding: '3px 12px',
                        borderRadius: '9999px',
                        marginTop: '2px'
                    }}
                >
                    <span className="loading loading-spinner loading-xs text-warning zdf-fallback-spinner-sm" />
                    <span
                        style={{
                            color: '#F0F0F0',
                            fontSize: '14px',
                            fontFamily: '"YouTube Noto", Roboto, Arial, sans-serif',
                            fontWeight: 500
                        }}
                    >
                        {text || 'Translating...'}
                    </span>
                </div>
            )}
        </>
    );
}