// entrypoints/background.ts
import { defineBackground, storage } from '#imports';

let TRANSLATION_SERVER = 'https://translate.theonlyalfaz.com/translate';

// Automatically ping localhost on startup to check for local server availability
async function determineTranslationServer() {
    const localUrl = 'http://localhost:3000/translate';
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1500); // 1.5s timeout for fast fallback

        const response = await fetch(localUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ texts: ['ping'], sourceLang: 'de', targetLang: 'en' }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (response.ok || response.status === 200 || response.status === 400) {
            TRANSLATION_SERVER = localUrl;
            console.log("[2Subs2Learn Background] Local translation server detected. Using:", TRANSLATION_SERVER);
            return;
        }
    } catch (error) {
        console.log("[2Subs2Learn Background] Local translation server not available. Falling back to remote:", TRANSLATION_SERVER);
    }
}

// Number of subtitle cues sent in each chunk request
const prefetch_request_chunks = 5;

// Maximum number of chunk requests to prefetch in the background while video is paused
const max_background_request = 2;

let isVideoPaused = true;
let isUserManuallyPaused = false;
let currentPriorityBatchIndex = 0;
let activeCuesCache: { start: number; duration: number; text: string }[] = [];
let activeVideoId = "";
let currentPlaybackTime = 0;
let zdfTabId: number | null = null;

let currentRunId = 0;
let activeAbortController: AbortController | null = null;

function cancelActiveLoop() {
    currentRunId++;
    if (activeAbortController) {
        activeAbortController.abort();
        activeAbortController = null;
    }
}

function getBatchIndexForTime(cues: { start: number; duration: number; text: string }[], timeInSeconds: number): number {
    if (!cues || cues.length === 0) return 0;
    const cueIndex = cues.findIndex(cue => (cue.start + cue.duration) >= timeInSeconds);
    if (cueIndex === -1) return 0;
    return Math.floor(cueIndex / prefetch_request_chunks);
}

async function sendPlayCommandToZdfTab() {
    if (zdfTabId === null) return;
    try {
        await browser.tabs.sendMessage(zdfTabId, { type: 'PLAY_VIDEO_ZDF' });
    } catch (error) {
        console.error("[2Subs2Learn Background] Failed to send play command:", error);
    }
}

async function sendUpdateNotificationToZdfTab(videoId: string) {
    if (zdfTabId === null) return;
    try {
        await browser.tabs.sendMessage(zdfTabId, {
            type: 'TRANSLATIONS_UPDATED',
            videoId
        });
    } catch {}
}

async function processAndStoreBatches(
    videoId: string,
    cues: { start: number; duration: number; text: string }[],
    startBatchIndex: number,
    runId: number
) {
    activeVideoId = videoId;
    activeCuesCache = cues;
    currentPriorityBatchIndex = startBatchIndex;
    const storageKey = 'local:translationsCache';

    let cacheRoot: Record<string, Array<{ starttime: number; endtime: number; text: string }>> =
        (await storage.getItem(storageKey)) || {};
    if (!cacheRoot[videoId]) {
        cacheRoot[videoId] = [];
    }

    let batchesFetchedWhilePaused = 0;

    while (runId === currentRunId && activeVideoId === videoId) {
        const batchIndex = currentPriorityBatchIndex;
        const startIndex = batchIndex * prefetch_request_chunks;

        if (startIndex >= cues.length) {
            break;
        }

        const batch = cues.slice(startIndex, startIndex + prefetch_request_chunks);
        const storedCuesForVideo = cacheRoot[videoId] || [];

        const uncachedCues = batch.filter(cue =>
            !storedCuesForVideo.some(stored => Math.abs(stored.starttime - cue.start) < 0.1)
        );

        if (uncachedCues.length === 0) {
            const targetCue = activeCuesCache.find(cue => (cue.start + cue.duration) >= currentPlaybackTime);
            if (targetCue && isVideoPaused && !isUserManuallyPaused) {
                const isTargetCached = storedCuesForVideo.some(item => Math.abs(item.starttime - targetCue.start) < 0.1);
                if (isTargetCached) {
                    await sendPlayCommandToZdfTab();
                }
            }
            if (currentPriorityBatchIndex === batchIndex) {
                currentPriorityBatchIndex++;
            }
            continue;
        }

        if (isVideoPaused) {
            if (batchesFetchedWhilePaused >= max_background_request) {
                while (
                    isVideoPaused &&
                    currentPriorityBatchIndex === batchIndex &&
                    runId === currentRunId &&
                    activeVideoId === videoId
                ) {
                    await new Promise(resolve => setTimeout(resolve, 250));
                }
                if (runId !== currentRunId || activeVideoId !== videoId) break;
                batchesFetchedWhilePaused = 0;
                continue;
            }
        }

        try {
            activeAbortController = new AbortController();
            const textsToTranslate = uncachedCues.map(c => c.text);
            console.log("Input:", textsToTranslate);

            const response = await fetch(TRANSLATION_SERVER, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    texts: textsToTranslate,
                    sourceLang: 'de',
                    targetLang: 'en'
                }),
                signal: activeAbortController.signal
            });

            if (!response.ok) throw new Error("Translation server error");

            const data = await response.json();
            console.log("Translation:", data.translations);

            if (runId !== currentRunId || activeVideoId !== videoId) break;

            if (data.translations) {
                cacheRoot = (await storage.getItem(storageKey)) || {};
                if (!cacheRoot[videoId]) cacheRoot[videoId] = [];

                for (let j = 0; j < uncachedCues.length; j++) {
                    const cue = uncachedCues[j];
                    const translatedText = data.translations[j];

                    const exists = cacheRoot[videoId].some(item => Math.abs(item.starttime - cue.start) < 0.1);
                    if (!exists) {
                        cacheRoot[videoId].push({
                            starttime: cue.start,
                            endtime: cue.start + cue.duration,
                            text: translatedText
                        });
                    }
                }

                cacheRoot[videoId].sort((a, b) => a.starttime - b.starttime);
                await storage.setItem(storageKey, cacheRoot);

                if (isVideoPaused) {
                    batchesFetchedWhilePaused++;
                } else {
                    batchesFetchedWhilePaused = 0;
                }

                await sendUpdateNotificationToZdfTab(videoId);

                const targetCue = activeCuesCache.find(cue => (cue.start + cue.duration) >= currentPlaybackTime);
                if (targetCue && isVideoPaused && !isUserManuallyPaused) {
                    const isNowCached = cacheRoot[videoId].some(item => Math.abs(item.starttime - targetCue.start) < 0.1);
                    if (isNowCached) {
                        await sendPlayCommandToZdfTab();
                    }
                }
            }
        } catch (error: any) {
            if (error?.name === 'AbortError') {
                console.log("[2Subs2Learn Background] Previous fetch aborted for higher priority request.");
                break;
            }
            console.error("[2Subs2Learn Background] Failed to fetch batch translation:", error);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        if (currentPriorityBatchIndex === batchIndex) {
            currentPriorityBatchIndex++;
        }
    }
}

export default defineBackground(() => {
    console.log("[2Subs2Learn Background] Service worker initialized.");

    // Run the server availability check immediately on startup
    determineTranslationServer();

    storage.watch<boolean>('local:zdfvideoPlaying', (isPlaying) => {
        if (isPlaying !== null) {
            isVideoPaused = !isPlaying;
        }
    });

    browser.runtime.onMessage.addListener((message, sender) => {
        if (sender.tab?.id) {
            zdfTabId = sender.tab.id;
        }

        if (message.type === 'START_BACKGROUND_TRANSLATION') {
            const { videoId, cues, currentTime = 0 } = message.payload;
            cancelActiveLoop();
            currentPlaybackTime = currentTime;
            isUserManuallyPaused = false;
            const startBatch = getBatchIndexForTime(cues, currentTime);
            processAndStoreBatches(videoId, cues, startBatch, currentRunId);
        } else if (message.type === 'RESET_VIDEO_STATE') {
            cancelActiveLoop();
            activeVideoId = "";
            activeCuesCache = [];
            currentPriorityBatchIndex = 0;
            isUserManuallyPaused = false;
            console.log("[2Subs2Learn Background] Video state reset for new navigation.");
        } else if (message.type === 'PRIORITIZE_SEEK_INDEX') {
            const { currentTime } = message.payload;
            currentPlaybackTime = currentTime;
            isUserManuallyPaused = false;
            if (activeCuesCache.length > 0 && activeVideoId) {
                cancelActiveLoop();
                const seekBatchIndex = getBatchIndexForTime(activeCuesCache, currentTime);
                currentPriorityBatchIndex = seekBatchIndex;
                console.log(`[2Subs2Learn Background] Seek prioritized batch index: ${currentPriorityBatchIndex}`);
                processAndStoreBatches(activeVideoId, activeCuesCache, seekBatchIndex, currentRunId);
            }
        } else if (message.type === 'UPDATE_CURRENT_TIME') {
            currentPlaybackTime = message.currentTime;
        } else if (message.type === 'USER_MANUAL_PAUSE') {
            isUserManuallyPaused = message.isManualPause;
            isVideoPaused = message.isManualPause;
        } else if (message.type === 'PLAY_VIDEO_ZDF') {
            sendPlayCommandToZdfTab();
        }
    });
});