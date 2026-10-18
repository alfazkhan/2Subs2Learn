// entrypoints/youtube-ui.content.ts
import ReactDOM from 'react-dom/client';
import React from 'react';
import subtitleSelection from './youtube.content/subtitleSelection';
import SubtitleOverlay from '@/components/SubtitleOverlay';
import type { ParsedCue } from '@/types/youtubeTypes';
import { storage } from '#imports';
import type { YouTubeCaptionTrack } from "@/types/youtubeTypes";

interface UnifiedCue {
    start: number;
    duration: number;
    sourceText: string;
    targetText: string;
}

export default defineContentScript({
    matches: ['*://*.youtube.com/watch*'],

    async main() {
        let overlayRoot: ReactDOM.Root | null = null;
        let requestRef: number | null = null;
        const OVERLAY_ID = '2subs-overlay-container';

        // Helper function to thoroughly clean up old overlays and sync loops
        const cleanupExistingSubs = () => {
            if (requestRef) {
                cancelAnimationFrame(requestRef);
                requestRef = null;
            }
            const existingOverlay = document.getElementById(OVERLAY_ID);
            if (existingOverlay) {
                if (overlayRoot) {
                    overlayRoot.unmount();
                    overlayRoot = null;
                }
                existingOverlay.remove();
            }
        };

        // Listen for YouTube internal navigation events to wipe previous video's subs instantly
        document.addEventListener('yt-navigate-start', () => {
            cleanupExistingSubs();
        });

        // Merges source and target cues into a single cohesive timeline without destructive mutations
        const createUnifiedCues = (sourceCues: ParsedCue[], targetCues: ParsedCue[]): UnifiedCue[] => {
            if (!sourceCues.length && !targetCues.length) return [];
            if (!sourceCues.length) {
                return targetCues.map(t => ({ start: t.start, duration: t.duration, sourceText: "", targetText: t.text }));
            }
            if (!targetCues.length) {
                return sourceCues.map(s => ({ start: s.start, duration: s.duration, sourceText: s.text, targetText: "" }));
            }

            const unified: UnifiedCue[] = sourceCues.map(s => {
                const sMid = s.start + (s.duration / 2);

                let bestTarget = targetCues[0];
                let minDiff = Math.abs((bestTarget.start + bestTarget.duration / 2) - sMid);

                for (let j = 1; j < targetCues.length; j++) {
                    const t = targetCues[j];
                    const tMid = t.start + (t.duration / 2);
                    const diff = Math.abs(tMid - sMid);

                    if (diff < minDiff) {
                        minDiff = diff;
                        bestTarget = t;
                    }
                }

                let start = s.start;
                let duration = s.duration;

                // Unify time window if the translation is close temporally (within 6 seconds)
                if (bestTarget && minDiff < 6000) {
                    start = Math.min(s.start, bestTarget.start);
                    const end = Math.max(s.start + s.duration, bestTarget.start + bestTarget.duration);
                    duration = end - start;
                }

                return {
                    start,
                    duration,
                    sourceText: s.text,
                    targetText: bestTarget && minDiff < 6000 ? bestTarget.text : ""
                };
            });

            // Ensure chronological sorting for binary search reliability
            return unified.sort((a, b) => a.start - b.start);
        };

        // Optimized binary search lookup on the unified timeline
        const findActiveUnifiedCue = (cues: UnifiedCue[], time: number): UnifiedCue | null => {
            let left = 0;
            let right = cues.length - 1;

            while (left <= right) {
                const mid = Math.floor((left + right) / 2);
                const cue = cues[mid];

                if (time >= cue.start && time <= (cue.start + cue.duration)) {
                    return cue;
                } else if (time < cue.start) {
                    right = mid - 1;
                } else {
                    left = mid + 1;
                }
            }

            // Fallback check for adjacent gaps
            const fallbackIndex = cues.findIndex(cue => cue.start >= time);
            if (fallbackIndex > 0) {
                const prev = cues[fallbackIndex - 1];
                if (time >= prev.start && time <= (prev.start + prev.duration)) {
                    return prev;
                }
            }

            return null;
        };

        window.addEventListener('message', (event) => {
            if (event.source !== window || !event.data) return;

            if (event.data.type === 'AVAILABLE_TRACKS_READY') {
                const tracks: [] = event.data.payload.availableTracks;
                const currentVideoID = event.data.payload.currentVideoId;
                const saveTracksToMemory = async () => {
                    await storage.setItem('local:currentVideoID',currentVideoID)
                    const captionTracks = await storage.getItem<[string, YouTubeCaptionTrack[]][]>('local:availableTracks');
                    if (captionTracks) {
                        const captionsMap = new Map(captionTracks || []);
                        captionsMap.set(currentVideoID, tracks);
                        await storage.setItem('local:availableTracks', Array.from(captionsMap.entries()));
                    } else {
                        await storage.setItem('local:availableTracks', [[currentVideoID, tracks]]);
                    }
                };
                saveTracksToMemory();
                if (tracks.length > 1) {
                    if ((tracks[0] as any).kind !== 'asr') {
                        subtitleSelection(tracks);
                    }
                } else {
                    window.postMessage({ type: 'PLAY_VIDEO' }, '*');
                }
            }

            if (event.data.type === 'RELAY_SUBTITLES_TO_ISOLATED') {
                const { sourceArray, targetArray } = event.data.payload;

                const playerContainer = document.querySelector('.html5-video-player');
                if (!playerContainer) return;

                cleanupExistingSubs();

                // Create the unified, non-destructive timeline array
                const unifiedCues = createUnifiedCues(sourceArray, targetArray);

                const overlayContainer = document.createElement('div');
                overlayContainer.id = OVERLAY_ID;
                playerContainer.appendChild(overlayContainer);
                overlayRoot = ReactDOM.createRoot(overlayContainer);

                const videoElement = document.querySelector('video') as HTMLVideoElement;
                let lastSource = "";
                let lastTarget = "";

                const syncEngine = () => {
                    if (videoElement) {
                        const currentTime = videoElement.currentTime;
                        const activeCue = findActiveUnifiedCue(unifiedCues, currentTime);

                        const currentSource = activeCue ? activeCue.sourceText : "";
                        const currentTarget = activeCue ? activeCue.targetText : "";

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

                requestRef = requestAnimationFrame(syncEngine);
                window.postMessage({ type: 'PLAY_VIDEO' }, '*');
            }
        });
    }
});