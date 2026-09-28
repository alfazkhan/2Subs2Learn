// components/LanguageModal.tsx
import React, { useState } from 'react';
import type { YouTubeCaptionTrack } from '@/types/youtubeTypes';
import { YOUTUBE_TRANSLATION_LANGUAGES } from '@/constants/youtubeLanguages';

interface LanguageModalProps {
    availableTranslations: YouTubeCaptionTrack[];
    onConfirm: (source: string, target: string) => void;
}

export default function LanguageModal({ availableTranslations, onConfirm }: LanguageModalProps) {
    // Filter source options to ONLY include human-curated manual subtitles (kind !== 'asr')
    const manualTracks = availableTranslations.filter(t => t.kind !== 'asr');

    const defaultSource = manualTracks.length > 0 ? manualTracks[0].languageCode : 'en';
    const [sourceLang, setSourceLang] = useState<string>(defaultSource);
    const [targetLang, setTargetLang] = useState<string>('de');

    const handleConfirm = () => {
        onConfirm(sourceLang, targetLang);
    };

    return (
        <div id="2subs-yt-modal-box" className="yt-2subs-modal-box">
            <h2 className="yt-2subs-title">
                Select Subtitle Tracks
            </h2>

            <div className="yt-2subs-row">
                <span>Translate from</span>
                <select
                    value={sourceLang}
                    onChange={(e) => setSourceLang(e.target.value)}
                    className="yt-2subs-select"
                >
                    {manualTracks.map((track) => (
                        <option key={track.languageCode} value={track.languageCode}>
                            {track.name?.simpleText || track.languageCode}
                        </option>
                    ))}
                </select>
            </div>

            <div className="yt-2subs-row">
                <span>Translate to</span>
                <select
                    value={targetLang}
                    onChange={(e) => setTargetLang(e.target.value)}
                    className="yt-2subs-select"
                >
                    {YOUTUBE_TRANSLATION_LANGUAGES.map((lang) => (
                        <option key={lang.code} value={lang.code}>
                            {lang.name}
                        </option>
                    ))}
                </select>
            </div>

            <button
                type="button"
                onClick={handleConfirm}
                className="yt-2subs-button"
            >
                Confirm & Play
            </button>
        </div>
    );
}