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
    isExtensionPausing: () => boolean;
}

let overlayRoot: ReactDOM.Root | null = null;
let requestRef: number | null = null;
let styleElement: HTMLStyleElement | null = null;
let activeMessageListener: ((message: any) => void) | null = null;

const OVERLAY_ID = 'zdf-2subs-overlay';

const injectNativeSubHideStyle = () => {
    if (!styleElement) {
        styleElement = document.createElement('style');
        styleElement.id = 'zdf-hide-native-subs';
        styleElement.innerHTML = `
            .zdfplayer-cue-inline {
                display: none !important;
            }
        `;
        document.head.appendChild(styleElement);
    }
};

const removeNativeSubHideStyle = () => {
    if (styleElement) {
        styleElement.remove();
        styleElement = null;
    }
};

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

// Displays the DaisyUI spinner overlay while waiting for ZDF XML subtitles to be enabled/fetched
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

export function cleanupSubtitleDisplay() {
    if (requestRef) {
        cancelAnimationFrame(requestRef);
        requestRef = null;
    }
    if (activeMessageListener) {
        browser.runtime.onMessage.removeListener(activeMessageListener);
        activeMessageListener = null;
    }
    if (overlayRoot) {
        overlayRoot.unmount();
        overlayRoot = null;
    }
    const existingOverlay = document.getElementById(OVERLAY_ID);
    if (existingOverlay) existingOverlay.remove();
    removeNativeSubHideStyle();
}

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
    if (activeMessageListener) {
        browser.runtime.onMessage.removeListener(activeMessageListener);
        activeMessageListener = null;
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

    const findActiveUnifiedCue = (cues: UnifiedCue[], currentTime: number): UnifiedCue | null => {
        return cues.find(cue => currentTime >= cue.starttime && currentTime <= cue.endtime) || null;
    };

    const findCurrentOrUpcomingCue = (cues: UnifiedCue[], currentTime: number): UnifiedCue | null => {
        return cues.find(cue => cue.endtime >= currentTime) || null;
    };

    await syncUnifiedCuesWithStorage();

    // Check if the chunk for the current timestamp already exists in memory
    const initialTargetCue = findCurrentOrUpcomingCue(unifiedCues, videoElement.currentTime);
    if (!initialTargetCue || initialTargetCue.targetText) {
        isWaitingForBatchTranslation = false;
        await controllers.autoPlayVideo();
    } else {
        isWaitingForBatchTranslation = true;
        await controllers.autoPauseVideo();
    }

    videoElement.onpause = () => {
        if (!controllers.isExtensionPausing() && !isWaitingForBatchTranslation) {
            userManuallyPaused = true;
            storage.setItem('local:zdfvideoPlaying', false);
            browser.runtime.sendMessage({
                type: 'USER_MANUAL_PAUSE',
                isManualPause: true
            }).catch(() => {});
        }
    };

    videoElement.onplay = () => {
        userManuallyPaused = false;
        storage.setItem('local:zdfvideoPlaying', true);
        browser.runtime.sendMessage({
            type: 'USER_MANUAL_PAUSE',
            isManualPause: false
        }).catch(() => {});
    };

    videoElement.onseeking = () => {
        userManuallyPaused = false;
        const targetCue = findCurrentOrUpcomingCue(unifiedCues, videoElement.currentTime);
        if (targetCue && !targetCue.targetText) {
            isWaitingForBatchTranslation = true;
            controllers.autoPauseVideo();
        }
    };

    videoElement.onseeked = async () => {
        const currentTime = videoElement.currentTime;
        userManuallyPaused = false;

        browser.runtime.sendMessage({
            type: 'PRIORITIZE_SEEK_INDEX',
            payload: { currentTime }
        }).catch(() => {});

        await syncUnifiedCuesWithStorage();
        const targetCue = findCurrentOrUpcomingCue(unifiedCues, currentTime);

        if (!targetCue || targetCue.targetText) {
            isWaitingForBatchTranslation = false;
            console.log("Video Play Event");
            await controllers.autoPlayVideo();
        } else {
            isWaitingForBatchTranslation = true;
            console.log("Video Pause Event");
            await controllers.autoPauseVideo();
        }
    };

    const syncEngine = () => {
        if (videoElement) {
            const currentTime = videoElement.currentTime;

            if (Math.abs(currentTime - lastReportedTime) > 0.5) {
                lastReportedTime = currentTime;
                browser.runtime.sendMessage({
                    type: 'UPDATE_CURRENT_TIME',
                    currentTime
                }).catch(() => {});
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
                        controllers.autoPauseVideo();
                    }
                } else {
                    if (isWaitingForBatchTranslation && videoElement.paused && !userManuallyPaused) {
                        isWaitingForBatchTranslation = false;
                        console.log("[2Subs2Learn] Translation arrived. Resuming video.");
                        controllers.autoPlayVideo();
                    }
                }
            }

            const renderKey = `${currentSource}|${currentTarget}|${isWaitingForBatchTranslation}|${isTranslatingActiveCue}`;
            if (renderKey !== lastRenderKey) {
                lastRenderKey = renderKey;

                overlayRoot?.render(
                    React.createElement(SubtitleOverlay, {
                        sourceText: currentSource,
                        targetText: currentTarget,
                        isFetchingSubtitles: isWaitingForBatchTranslation && !activeCue,
                        loadingMessage: 'Translating subtitles...',
                        isTranslatingChunk: isTranslatingActiveCue
                    })
                );
            }
        }
        requestRef = requestAnimationFrame(syncEngine);
    };

    requestRef = requestAnimationFrame(syncEngine);

    activeMessageListener = (message: any) => {
        if (message.type === 'TRANSLATIONS_UPDATED' && message.videoId === videoId) {
            syncUnifiedCuesWithStorage().then(() => {
                const targetCue = findCurrentOrUpcomingCue(unifiedCues, videoElement.currentTime);
                if (targetCue && targetCue.targetText && isWaitingForBatchTranslation && !userManuallyPaused) {
                    isWaitingForBatchTranslation = false;
                    console.log("[2Subs2Learn] Translations updated. Triggering play command.");
                    controllers.autoPlayVideo();
                }
            });
        }
    };

    browser.runtime.onMessage.addListener(activeMessageListener);
}