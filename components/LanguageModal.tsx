// components/LanguageModal.tsx
import React, { useState, useEffect } from 'react';
import { storage } from '#imports';
import type { YouTubeCaptionTrack, TranslationPref } from '@/types/youtubeTypes';
import { YOUTUBE_TRANSLATION_LANGUAGES } from '@/constants/youtubeLanguages';

interface LanguageModalProps {
    availableTranslations: YouTubeCaptionTrack[];
    onConfirm: (source: string, target: string) => void;
}

export default function LanguageModal({ availableTranslations, onConfirm }: LanguageModalProps) {
    // Filter source options to only include human-curated manual subtitles (kind !== 'asr')
    const manualTracks = availableTranslations.filter(t => t.kind !== 'asr') || [];

    const defaultSource = manualTracks[0]?.languageCode ?? 'en';
    const [sourceLang, setSourceLang] = useState<string>(defaultSource);
    const [targetLang, setTargetLang] = useState<string>('de');
    const [isLoading, setIsLoading] = useState<boolean>(false);

    // Load previously saved language preferences from local storage on mount
    useEffect(() => {
        async function fetchPref() {
            const pref = await storage.getItem<TranslationPref>('local:translationPref');
            console.log("USE EFFECT", pref);
            if (pref?.sourceLang && manualTracks.some(t => t.languageCode === pref.sourceLang)) {
                setSourceLang(pref.sourceLang);
            }
            if (pref?.targetLang) {
                setTargetLang(pref.targetLang);
            }
        }
        fetchPref();
    }, []);

    // Trigger subtitle extraction with selected languages
    const handleConfirm = () => {
        onConfirm(sourceLang, targetLang);
        setIsLoading(true);
    };

    return (
        <div id="2subs-yt-modal-box" className="yt-2subs-modal-box">
            <h2 className="yt-2subs-title">
                Select Subtitle Tracks
            </h2>

            <div className="yt-2subs-row">
                <span>Translate from (Primary Subtitle)</span>
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
                <span>Translate to (Secondary Subtitle)</span>
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
                disabled={isLoading}
            >
                {isLoading ? "Loading..." : "Confirm & Play"}
            </button>
        </div>
    );
}