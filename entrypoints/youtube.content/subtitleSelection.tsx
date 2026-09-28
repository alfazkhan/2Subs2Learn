// entrypoints/youtube.content/subtitleSelection.tsx
import ReactDOM from 'react-dom/client';
import LanguageModal from '@/components/LanguageModal.tsx';
import { storage } from '#imports';
import type { TranslationPref, YouTubeCaptionTrack } from '@/types/youtubeTypes';
import './modal.css';

export default function subtitleSelection(availableTranslations: YouTubeCaptionTrack[]) {
    const containerId = 'youtube-dual-sub-modal-container';

    if (!document.getElementById(containerId)) {
        const appWrapper = document.createElement('div');
        appWrapper.id = containerId;
        appWrapper.className = 'yt-2subs-wrapper';

        document.body.appendChild(appWrapper);
        const root = ReactDOM.createRoot(appWrapper);

        async function onLanguageConfirm(source: string, target: string) {
            try {
                await storage.setItem<TranslationPref>('local:translationPref', {
                    sourceLang: source,
                    targetLang: target,
                });

                const sourceTrack = availableTranslations.find(t => t.languageCode === source && t.kind !== 'asr');
                const targetTrack = availableTranslations.find(t => t.languageCode.startsWith(target) && t.kind !== 'asr');

                // Simply command the MAIN script to extract the data.
                // The MAIN script will relay it to youtube-ui.content.ts
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
                root.unmount();
                appWrapper.remove();
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