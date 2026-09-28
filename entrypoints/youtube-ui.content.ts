// entrypoints/youtube-ui.content.ts
import ReactDOM from 'react-dom/client';
import React from 'react';
import subtitleSelection from './youtube.content/subtitleSelection';
import SubtitleOverlay from '@/components/SubtitleOverlay';
import type { ParsedCue } from '@/types/youtubeTypes';

export default defineContentScript({
    matches: ['*://*.youtube.com/*'],

    async main() {
        let overlayRoot: ReactDOM.Root | null = null;
        let requestRef: number | null = null;
        const OVERLAY_ID = '2subs-overlay-container';

        // Stretches mismatched durations so paired cues start and end at the exact same time
        const normalizeCueTimings = (sourceCues: ParsedCue[], targetCues: ParsedCue[]) => {
            const length = Math.min(sourceCues.length, targetCues.length);
            for (let i = 0; i < length; i++) {
                const s = sourceCues[i];
                const t = targetCues[i];
                
                const sEnd = s.start + s.duration;
                const tEnd = t.start + t.duration;
                
                const minStart = Math.min(s.start, t.start);
                const maxEnd = Math.max(sEnd, tEnd);
                
                s.start = minStart;
                s.duration = maxEnd - minStart;
                
                t.start = minStart;
                t.duration = maxEnd - minStart;
            }
        };

        const findActiveCue = (cues: ParsedCue[], time: number) => {
            let left = 0;
            let right = cues.length - 1;

            while (left <= right) {
                const mid = Math.floor((left + right) / 2);
                const cue = cues[mid];
                
                if (time >= cue.start && time <= (cue.start + cue.duration)) {
                    return cue.text;
                } else if (time < cue.start) {
                    right = mid - 1;
                } else {
                    left = mid + 1;
                }
            }
            
            const fallbackIndex = cues.findIndex(cue => cue.start >= time);
            if (fallbackIndex > 0 && time >= cues[fallbackIndex - 1].start && time <= (cues[fallbackIndex - 1].start + cues[fallbackIndex - 1].duration)) {
                 return cues[fallbackIndex - 1].text;
            }
            
            return "";
        };

        window.addEventListener('message', (event) => {
            if (event.source !== window || !event.data) return;

            if (event.data.type === 'AVAILABLE_TRACKS_READY') {
                const tracks = event.data.payload;
                console.log("[ISOLATED] Subtitle tracks detected. Opening selection modal...");
                
                const videoElement = document.querySelector('video') as HTMLVideoElement;
                if (videoElement && !videoElement.paused) {
                    videoElement.pause();
                }

                subtitleSelection(tracks);
            }

            if (event.data.type === 'RELAY_SUBTITLES_TO_ISOLATED') {
                const { sourceArray, targetArray } = event.data.payload;
                
                const playerContainer = document.querySelector('.html5-video-player');
                if (!playerContainer) return;

                const existingOverlay = document.getElementById(OVERLAY_ID);
                if (existingOverlay && overlayRoot) {
                    overlayRoot.unmount();
                    existingOverlay.remove();
                }
                if (requestRef) cancelAnimationFrame(requestRef);

                const overlayContainer = document.createElement('div');
                overlayContainer.id = OVERLAY_ID;
                playerContainer.appendChild(overlayContainer);
                overlayRoot = ReactDOM.createRoot(overlayContainer);

                // Stretch arrays to match durations
                normalizeCueTimings(sourceArray, targetArray);

                const videoElement = document.querySelector('video') as HTMLVideoElement;
                let lastSource = "";
                let lastTarget = "";

                // Engine Loop: Computes sync and triggers React only on text changes
                const syncEngine = () => {
                    if (videoElement) {
                        const currentTime = videoElement.currentTime;
                        const currentSource = sourceArray.length > 0 ? findActiveCue(sourceArray, currentTime) : "";
                        const currentTarget = targetArray.length > 0 ? findActiveCue(targetArray, currentTime) : "";

                        if (currentSource !== lastSource || currentTarget !== lastTarget) {
                            lastSource = currentSource;
                            lastTarget = currentTarget;
                            
                            overlayRoot?.render(
                                React.createElement(SubtitleOverlay, { 
                                    sourceText: currentSource, 
                                    targetText: currentTarget 
                                })
                            );
                        }
                    }
                    requestRef = requestAnimationFrame(syncEngine);
                };

                // Initialize loop
                requestRef = requestAnimationFrame(syncEngine);

                window.postMessage({ type: 'PLAY_VIDEO' }, '*');
            }
        });
    }
});