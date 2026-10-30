// entrypoints/zd.content/SubtitleDisplay.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { storage } from '#imports';
import SubtitleOverlay from '@/components/SubtitleOverlay';

interface SubtitleCue {
    start: number;
    duration: number;
    text: string;
}

interface UnifiedCue {
    starttime: number;
    endtime: number;
    sourceText: string;
    targetText: string;
}

interface PlaybackControllers {
    autoPlayVideo: () => Promise<void>;
    autoPauseVideo: () => Promise<void>;
    isExtensionPaused: () => boolean;
}

let overlayRoot: ReactDOM.Root | null = null;
let requestRef: number | null = null;
let styleElement: HTMLStyleElement | null = null;
let unwatchTranslationUpdates: (() => void) | null = null;

const OVERLAY_ID = 'zdf-2subs-overlay';

// Inject CSS rule to hide ZDF's native subtitle container while our custom dual overlay is active
const injectNativeSubHideStyle = () => {
    if (!styleElement) {
        styleElement = document.createElement('style');
        styleElement.id = 'zdf-hide-native-subs';
        styleElement.innerHTML = `.zdfplayer-cue-inline { display: none !important; }`;
        document.head.appendChild(styleElement);
    }
};

// Remove the native subtitle hiding CSS rule during teardown
const removeNativeSubHideStyle = () => {
    if (styleElement) {
        styleElement.remove();
        styleElement = null;
    }
};

// Ensure the React root container is mounted inside the ZDF video player element
function ensureOverlayRoot(playerSelector: string = 'video'): ReactDOM.Root | null {
    const videoElement = document.querySelector(playerSelector) as HTMLVideoElement;
    if (!videoElement) return null;


    const playerContainer = videoElement.parentElement || document.body;
    let overlayContainer = document.getElementById(OVERLAY_ID);

    if (!overlayContainer) {
        overlayContainer = document.createElement('div');
        overlayContainer.id = OVERLAY_ID;
        playerContainer.appendChild(overlayContainer);
        overlayRoot = ReactDOM.createRoot(overlayContainer);
    } else if (!overlayRoot) {
        overlayRoot = ReactDOM.createRoot(overlayContainer);
    }

    return overlayRoot;



}

// Render the full-box loading spinner only before XML subtitle cues are loaded
export function showInitialLoadingOverlay(message: string = 'Fetching subtitles...', playerSelector: string = 'video') {
    const root = ensureOverlayRoot(playerSelector);
    if (root) {
        root.render(
            React.createElement(SubtitleOverlay, {
                sourceText: '',
                targetText: '',
                isFetchingSubtitles: true,
                loadingMessage: message,
                isTranslatingChunk: false
            })
        );
    }
}

// Clean up animation frames, unwatch storage listeners, and unmount the React overlay
export function cleanupSubtitleDisplay() {
    if (requestRef) {
        cancelAnimationFrame(requestRef);
        requestRef = null;
    }
    if (unwatchTranslationUpdates) {
        unwatchTranslationUpdates();
        unwatchTranslationUpdates = null;
    }
    if (overlayRoot) {
        overlayRoot.unmount();
        overlayRoot = null;
    }
    const existingOverlay = document.getElementById(OVERLAY_ID);
    if (existingOverlay) existingOverlay.remove();
    removeNativeSubHideStyle();
}

// Main ZDF subtitle display and synchronization engine
export async function handleSubtitleDisplayAndSync(
    originalCues: SubtitleCue[],
    videoId: string,
    playerSelector: string = 'video',
    controllers: PlaybackControllers
) {
    if (requestRef) {
        cancelAnimationFrame(requestRef);
        requestRef = null;
    }
    if (unwatchTranslationUpdates) {
        unwatchTranslationUpdates();
        unwatchTranslationUpdates = null;
    }


    const videoElement = document.querySelector(playerSelector) as HTMLVideoElement;
    if (!videoElement) return;

    injectNativeSubHideStyle();
    ensureOverlayRoot(playerSelector);

    const unifiedCues: UnifiedCue[] = originalCues.map(cue => ({
        starttime: cue.start,
        endtime: cue.start + cue.duration,
        sourceText: cue.text,
        targetText: ""
    }));

    let lastRenderKey = "";
    let isWaitingForBatchTranslation = true;
    let userManuallyPaused = false;
    let lastReportedTime = -1;

    // Pull cached translations for this videoId from local storage into our in-memory unifiedCues array
    const syncUnifiedCuesWithStorage = async () => {
        const storageKey = 'local:translationsCache';
        const cacheRoot: Record<string, Array<{ starttime: number; endtime: number; text: string }>> =
            (await storage.getItem(storageKey)) || {};
        const videoCache = cacheRoot[videoId] || [];

        for (const cachedItem of videoCache) {
            const targetCue = unifiedCues.find(c => Math.abs(c.starttime - cachedItem.starttime) < 0.1);
            if (targetCue) {
                targetCue.targetText = cachedItem.text;
            }
        }
    };

    // Binary search for the active cue at currentTime (O(log N))
    const findActiveUnifiedCue = (cues: UnifiedCue[], currentTime: number): UnifiedCue | null => {
        let left = 0;
        let right = cues.length - 1;

        while (left <= right) {
            const mid = Math.floor((left + right) / 2);
            const cue = cues[mid];
            if (!cue) {
                return null;
            }
            if (currentTime >= cue.starttime && currentTime <= cue.endtime) {
                return cue;
            } else if (currentTime < cue.starttime) {
                right = mid - 1;
            } else {
                left = mid + 1;
            }
        }
        return null;
    };

    // Find the current or next upcoming cue to verify if translations are ready at the playhead
    const findCurrentOrUpcomingCue = (cues: UnifiedCue[], currentTime: number): UnifiedCue | null => {
        return cues.find(cue => cue.endtime >= currentTime) || null;
    };

    await syncUnifiedCuesWithStorage();

    // Check if the chunk for the initial timestamp already exists in cache
    const initialTargetCue = findCurrentOrUpcomingCue(unifiedCues, videoElement.currentTime);
    if (!initialTargetCue || initialTargetCue.targetText) {
        isWaitingForBatchTranslation = false;
        await storage.setItem('local:zdfvideoPlaying', true);
    } else {
        isWaitingForBatchTranslation = true;
        await storage.setItem('local:zdfvideoPlaying', false);
    }

    // Distinguish manual user pause from extension auto-pause
    videoElement.onpause = () => {
        if (!controllers.isExtensionPaused() && !isWaitingForBatchTranslation) {
            userManuallyPaused = true;
            storage.setItem('local:zdfManualPause', true);
            storage.setItem('local:zdfvideoPlaying', false);
        }
    };

    // Clear manual pause flag when user resumes playback
    videoElement.onplay = () => {
        userManuallyPaused = false;
        storage.setItem('local:zdfManualPause', false);
        storage.setItem('local:zdfvideoPlaying', true);
    };

    // Pause immediately when user drags the timeline scrubber to an uncached position (preserving userManuallyPaused state)
    videoElement.onseeking = () => {
        const targetCue = findCurrentOrUpcomingCue(unifiedCues, videoElement.currentTime);
        if (targetCue && !targetCue.targetText) {
            isWaitingForBatchTranslation = true;
            storage.setItem('local:zdfvideoPlaying', false);
        }
    };

    // Prioritize the seeked batch index via session storage and resume only if not manually paused
    videoElement.onseeked = async () => {
        const currentTime = videoElement.currentTime;

        storage.setItem('local:zdfSeekTrigger', {
            videoId,
            currentTime,
            timestamp: Date.now()
        });

        await syncUnifiedCuesWithStorage();
        const targetCue = findCurrentOrUpcomingCue(unifiedCues, currentTime);

        if (!targetCue || targetCue.targetText) {
            isWaitingForBatchTranslation = false;
            console.log("Video Play Event");
            if (!userManuallyPaused) {
                await storage.setItem('local:zdfvideoPlaying', true);
            } else {
                await storage.setItem('local:zdfvideoPlaying', false);
            }
        } else {
            isWaitingForBatchTranslation = true;
            console.log("Video Pause Event");
            await storage.setItem('local:zdfvideoPlaying', false);
        }
    };

    // 60fps synchronous render loop that keeps current subtitles visible even when video is paused
    const syncEngine = () => {
        if (videoElement) {
            const currentTime = videoElement.currentTime;

            if (Math.abs(currentTime - lastReportedTime) > 0.5) {
                lastReportedTime = currentTime;
                storage.setItem('local:zdfCurrentTime', currentTime);
            }

            const activeCue = findActiveUnifiedCue(unifiedCues, currentTime);
            const currentSource = activeCue ? activeCue.sourceText : "";
            const currentTarget = activeCue ? activeCue.targetText : "";
            const isTranslatingActiveCue = Boolean(activeCue && !activeCue.targetText);

            if (activeCue) {
                if (!activeCue.targetText) {
                    isWaitingForBatchTranslation = true;
                    if (!videoElement.paused) {
                        console.log(`[2Subs2Learn] Translation missing at ${currentTime.toFixed(2)}s. Forcing pause.`);
                        storage.setItem('local:zdfvideoPlaying', false);
                    }
                } else {
                    if (isWaitingForBatchTranslation && videoElement.paused && !userManuallyPaused) {
                        isWaitingForBatchTranslation = false;
                        console.log("[2Subs2Learn] Translation arrived. Resuming video.");
                        storage.setItem('local:zdfvideoPlaying', true);
                    }
                }
            }

            // Only show the full-box 'Translating subtitles...' spinner if the extension auto-paused
            // during a gap with no active cue AND the user did NOT manually pause the video
            const showGapLoader = isWaitingForBatchTranslation && !userManuallyPaused && !activeCue;

            const renderKey = `${currentSource}|${currentTarget}|${showGapLoader}|${isTranslatingActiveCue}`;
            if (renderKey !== lastRenderKey) {
                lastRenderKey = renderKey;

                overlayRoot?.render(
                    React.createElement(SubtitleOverlay, {
                        sourceText: currentSource,
                        targetText: currentTarget,
                        isFetchingSubtitles: showGapLoader,
                        loadingMessage: 'Translating subtitles...',
                        isTranslatingChunk: isTranslatingActiveCue
                    })
                );
            }
        }
        requestRef = requestAnimationFrame(syncEngine);
    };

    requestRef = requestAnimationFrame(syncEngine);

    // Watch session signal key for newly translated batches from background worker
    unwatchTranslationUpdates = storage.watch<{ videoId: string; timestamp: number } | null>(
        'local:zdfTranslationUpdated',
        (updateSignal) => {
            if (updateSignal && updateSignal.videoId === videoId) {
                syncUnifiedCuesWithStorage().then(() => {
                    const targetCue = findCurrentOrUpcomingCue(unifiedCues, videoElement.currentTime);
                    if (targetCue && targetCue.targetText && isWaitingForBatchTranslation && !userManuallyPaused) {
                        isWaitingForBatchTranslation = false;
                        console.log("[2Subs2Learn] Translations updated. Triggering play command.");
                        storage.setItem('local:zdfvideoPlaying', true);
                    }
                });
            }
        }
    );



}