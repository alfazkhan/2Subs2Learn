// entrypoints/youtube.content/subtitleSelection.tsx
import ReactDOM from 'react-dom/client';
import LanguageModal from '@/components/LanguageModal';
import { storage } from '#imports';
import type { TranslationPref, YouTubeCaptionTrack } from '@/types/youtubeTypes';
import './modal.css';
import React from 'react';

// Renders the YouTube language selection modal and dispatches chosen tracks
export default function subtitleSelection(availableTranslations: YouTubeCaptionTrack[]) {
    const containerId = 'youtube-dual-sub-modal-container';
    console.log("Start subtitle selection");

    if (!document.getElementById(containerId)) {
        const appWrapper = document.createElement('div');
        appWrapper.id = containerId;
        appWrapper.className = 'yt-2subs-wrapper';
        document.body.appendChild(appWrapper);
        const root = ReactDOM.createRoot(appWrapper);

        // Cleanly unmount modal and remove window message listener once finished
        const handlePopupRemoval = (event: MessageEvent) => {
            if (event.source !== window || !event.data) return;
            if (event.data.type === 'REMOVE_LANGUAGE_POPUP') {
                console.log('EVENT REMOVE_LANGUAGE_POPUP');
                window.removeEventListener('message', handlePopupRemoval);
                root.unmount();
                appWrapper.remove();
            }
        };

        window.addEventListener('message', handlePopupRemoval);

        // Save selected languages to storage and trigger subtitle interception
        async function onLanguageConfirm(source: string, target: string) {
            try {
                await storage.setItem<TranslationPref>('local:translationPref', {
                    sourceLang: source,
                    targetLang: target,
                });

                console.log(source, target, availableTranslations);
                const sourceTrack = availableTranslations.find(t => t.languageCode === source && t.kind !== 'asr');
                const targetTrack = availableTranslations.find(t => t.languageCode.startsWith(target) && t.kind !== 'asr');

                window.postMessage({
                    type: 'START_INTERCEPT_SUBTITLES',
                    payload: {
                        sourceTrack,
                        targetTrack,
                        targetLang: target
                    }
                }, '*');
            } catch (error) {
                console.error("[subtitleSelection] Confirmation error:", error);
            } finally {
                console.log("Running");
            }
        }

        root.render(
            <div className="yt-2subs-backdrop">
                <LanguageModal
                    availableTranslations={availableTranslations}
                    onConfirm={onLanguageConfirm}
                />
            </div>
        );
    }
}