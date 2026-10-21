// entrypoints/ui-youtube.content/index.tsx
import ReactDOM from 'react-dom/client';
import React from 'react';
import subtitleSelection from '@/entrypoints/youtube.content/subtitleSelection';
import SubtitleOverlay from '@/components/SubtitleOverlay';
import type { ParsedCue, YouTubeCaptionTrack } from '@/types/youtubeTypes';
import { defineContentScript, storage } from '#imports';

interface UnifiedCue {
    start: number;
    duration: number;
    sourceText: string;
    targetText: string;
}

export default defineContentScript({
    matches: ['*://*.youtube.com/*'],

    async main() {
        let overlayRoot: ReactDOM.Root | null = null;
        let requestRef: number | null = null;
        const OVERLAY_ID = '2subs-overlay-container';

        let isExtensionPaused = await storage.getItem('local:isExtensionPaused') || false
        console.log("YOUTUBE isExtensionPaused", isExtensionPaused)

        // Sync platform state to YOUTUBE across session and local storage
        const syncPlatformToYouTube = async () => {
            await Promise.all([
                storage.setItem('session:currentPlatform', 'YOUTUBE'),
                storage.setItem('local:currentPlatform', 'YOUTUBE')
            ]);
        };

        if (document.visibilityState === 'visible') {
            await syncPlatformToYouTube();
        }

        // Condition 1: Bind native HTML5 video play event on YouTube to ensure platform switches immediately
        const bindVideoPlayListener = () => {
            const video = document.querySelector('video') as HTMLVideoElement;
            if (video) {
                video.addEventListener('play', () => {
                    syncPlatformToYouTube();
                });
            }
        };

        bindVideoPlayListener();

        // Condition 2: Update currentPlatform when user focuses or switches tabs to YouTube
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                syncPlatformToYouTube();
                bindVideoPlayListener();
            }
        });

        window.addEventListener('focus', () => {
            syncPlatformToYouTube();
            bindVideoPlayListener();
        });

        // Clean up existing subtitle overlays and animation loops on navigation
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

        document.addEventListener('yt-navigate-start', () => {
            cleanupExistingSubs();
            syncPlatformToYouTube();
        });

        // Merge source and target subtitle tracks into a unified timeline array
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

                // Cues are in seconds; match if centers are within 6 seconds
                const isCloseMatch = Boolean(bestTarget && minDiff < 6);

                return {
                    start: s.start,
                    duration: s.duration,
                    sourceText: s.text,
                    targetText: isCloseMatch ? bestTarget.text : ""
                };
            });

            return unified.sort((a, b) => a.start - b.start);
        };

        // Binary search lookup for active subtitle cue at current video time
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

            return null;
        };

        window.addEventListener('message', (event) => {
            if (event.source !== window || !event.data) return;


            if (event.data.type === 'AVAILABLE_TRACKS_READY') {
                if (isExtensionPaused) {
                    window.postMessage({ type: 'PLAY_VIDEO' }, '*');
                    return
                }
                const tracks: YouTubeCaptionTrack[] = event.data.payload.availableTracks;
                const currentVideoID: string = event.data.payload.currentVideoId;

                (async () => {
                    await storage.setItem('local:currentVideoID', currentVideoID);
                    const captionTracks = await storage.getItem<[string, YouTubeCaptionTrack[]][]>('local:availableTracks');
                    const captionsMap = new Map(captionTracks || []);
                    captionsMap.set(currentVideoID, tracks);
                    await storage.setItem('local:availableTracks', Array.from(captionsMap.entries()));
                })();

                const hasManualTracks = tracks.some(t => t.kind !== 'asr');
                if (tracks.length > 0 && hasManualTracks) {
                    subtitleSelection(tracks);
                } else {
                    window.postMessage({ type: 'PLAY_VIDEO' }, '*');
                }
            }

            if (event.data.type === 'RELAY_SUBTITLES_TO_ISOLATED') {
                const { sourceArray, targetArray } = event.data.payload;

                const playerContainer = document.querySelector('.html5-video-player');
                if (!playerContainer) return;

                cleanupExistingSubs();
                bindVideoPlayListener();

                const unifiedCues = createUnifiedCues(sourceArray, targetArray);

                const overlayContainer = document.createElement('div');
                overlayContainer.id = OVERLAY_ID;
                playerContainer.appendChild(overlayContainer);
                overlayRoot = ReactDOM.createRoot(overlayContainer);

                const videoElement = document.querySelector('video') as HTMLVideoElement;
                let lastSource = "";
                let lastTarget = "";

                // 60fps synchronization loop rendering YouTube dual subtitles
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
                // Condition 1: Update platform state to YouTube when initiating playback
                syncPlatformToYouTube();
                window.postMessage({ type: 'PLAY_VIDEO' }, '*');
            }
        });
    }
});