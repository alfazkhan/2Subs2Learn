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

let overlayRoot: ReactDOM.Root | null = null;
let requestRef: number | null = null;
let styleElement: HTMLStyleElement | null = null;

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

export function handleSubtitleDisplayAndSync(
    originalCues: SubtitleCue[],
    videoId: string,
    playerSelector: string = 'video'
) {
    const OVERLAY_ID = 'zdf-2subs-overlay';
    
    const existingOverlay = document.getElementById(OVERLAY_ID);
    if (existingOverlay) existingOverlay.remove();
    if (requestRef) cancelAnimationFrame(requestRef);
    removeNativeSubHideStyle();

    const videoElement = document.querySelector(playerSelector) as HTMLVideoElement;
    if (!videoElement) return;

    const playerContainer = videoElement.parentElement || document.body;
    injectNativeSubHideStyle();

    const unifiedCues: UnifiedCue[] = originalCues.map(cue => ({
        starttime: cue.start,
        endtime: cue.start + cue.duration,
        sourceText: cue.text,
        targetText: ""
    }));

    const overlayContainer = document.createElement('div');
    overlayContainer.id = OVERLAY_ID;
    playerContainer.appendChild(overlayContainer);
    
    overlayRoot = ReactDOM.createRoot(overlayContainer);

    let lastSource = "";
    let lastTarget = "";
    let isWaitingForBatchTranslation = false;

    const syncUnifiedCuesWithStorage = async () => {
        const storageKey = 'local:translationsCache';
        const cacheRoot: Record<string, Array<{ starttime: number; endtime: number; text: string }>> = (await storage.getItem(storageKey)) || {};
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

    videoElement.addEventListener('seeked', () => {
        isWaitingForBatchTranslation = false;
        browser.runtime.sendMessage({
            type: 'PRIORITIZE_SEEK_INDEX',
            payload: { currentTime: videoElement.currentTime }
        }).catch(() => {});
    });

    const syncEngine = async () => {
        if (videoElement) {
            const currentTime = videoElement.currentTime;
            
            await syncUnifiedCuesWithStorage();

            const activeCue = findActiveUnifiedCue(unifiedCues, currentTime);
            const currentSource = activeCue ? activeCue.sourceText : "";
            const currentTarget = activeCue ? (activeCue.targetText || "loading...") : "";

            if (activeCue) {
                if (!activeCue.targetText) {
                    if (!videoElement.paused && !isWaitingForBatchTranslation) {
                        isWaitingForBatchTranslation = true;
                        videoElement.pause();
                        storage.setItem('local:zdfvideoPlaying', false);
                        console.log(`[2Subs2Learn] Chunk translation missing at ${currentTime.toFixed(2)}s. Pausing for batch fetch...`);
                    }
                    // Periodically report current time while waiting so background knows what's needed
                    browser.runtime.sendMessage({
                        type: 'UPDATE_CURRENT_TIME',
                        currentTime
                    }).catch(() => {});
                }
            }

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

    const messageListener = (message: any) => {
        if (message.type === 'TRANSLATIONS_UPDATED' && message.videoId === videoId) {
            syncUnifiedCuesWithStorage();
        }
    };

    browser.runtime.onMessage.addListener(messageListener);
}