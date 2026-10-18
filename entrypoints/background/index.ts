// entrypoints/background.ts
import { defineBackground, storage } from '#imports';

const TRANSLATION_SERVER = 'http://localhost:3000/translate';
const BATCH_SIZE = 10;
const MAX_PAUSE_PREFETCH_BATCHES = 2;

let isVideoPaused = true;
let currentPriorityBatchIndex = 0;
let activeCuesCache: { start: number; duration: number; text: string }[] = [];
let activeVideoId = "";
let currentPlaybackTime = 0;

// Helper to send play commands from background to active tab
async function sendPlayCommandToActiveTab() {
    try {
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        const activeTabId = tabs[0]?.id;
        if (activeTabId) {
            await browser.tabs.sendMessage(activeTabId, { type: 'PLAY_VIDEO_ZDF' });
            console.log("[2Subs2Learn Background] Sent PLAY_VIDEO_ZDF to active tab.");
        }
    } catch (error) {
        console.error("[2Subs2Learn Background] Failed to send play command:", error);
    }
}

async function processAndStoreBatches(videoId: string, cues: { start: number; duration: number; text: string }[]) {
    activeVideoId = videoId;
    activeCuesCache = cues;
    const storageKey = 'local:translationsCache';

    let cacheRoot: Record<string, Array<{ starttime: number; endtime: number; text: string }>> = (await storage.getItem(storageKey)) || {};
    if (!cacheRoot[videoId]) {
        cacheRoot[videoId] = [];
    }

    let batchesProcessedWhilePaused = 0;

    while (true) {
        const batchIndex = currentPriorityBatchIndex;
        const startIndex = batchIndex * BATCH_SIZE;

        if (startIndex >= cues.length) {
            break;
        }

        if (isVideoPaused) {
            if (batchesProcessedWhilePaused >= MAX_PAUSE_PREFETCH_BATCHES) {
                console.log("[2Subs2Learn Background] Video paused. Waiting for unpause or seek.");
                while (isVideoPaused && currentPriorityBatchIndex === batchIndex) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
                batchesProcessedWhilePaused = 0;
                continue;
            }
            batchesProcessedWhilePaused++;
        }

        const batch = cues.slice(startIndex, startIndex + BATCH_SIZE);
        const storedCuesForVideo = cacheRoot[videoId] || [];
        
        const uncachedCues = batch.filter(cue =>
            !storedCuesForVideo.some(stored => Math.abs(stored.starttime - cue.start) < 0.1)
        );

        if (uncachedCues.length > 0) {
            try {
                const textsToTranslate = uncachedCues.map(c => c.text);
                console.log(`[2Subs2Learn Background] Fetching priority batch ${batchIndex} (${uncachedCues.length} items) for video: ${videoId}`);

                const response = await fetch(TRANSLATION_SERVER, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        texts: textsToTranslate,
                        sourceLang: 'de',
                        targetLang: 'en'
                    })
                });

                if (!response.ok) throw new Error("Translation server error");

                const data = await response.json();
                if (data.translations) {
                    for (let j = 0; j < uncachedCues.length; j++) {
                        const cue = uncachedCues[j];
                        const translatedText = data.translations[j];

                        cacheRoot[videoId].push({
                            starttime: cue.start,
                            endtime: cue.start + cue.duration,
                            text: translatedText
                        });
                    }

                    cacheRoot[videoId].sort((a, b) => a.starttime - b.starttime);
                    await storage.setItem(storageKey, cacheRoot);

                    // Notify content script UI to update
                    browser.runtime.sendMessage({
                        type: 'TRANSLATIONS_UPDATED',
                        videoId
                    }).catch(() => {});

                    // Check if this newly processed batch covers the user's current playback position
                    const activeCue = activeCuesCache.find(
                        cue => currentPlaybackTime >= cue.start && currentPlaybackTime <= (cue.start + cue.duration)
                    );
                    
                    if (activeCue) {
                        const isNowCached = cacheRoot[videoId].some(item => Math.abs(item.starttime - activeCue.start) < 0.1);
                        if (isNowCached && isVideoPaused) {
                            console.log("[2Subs2Learn Background] Current playback position translation is ready. Triggering play command.");
                            await sendPlayCommandToActiveTab();
                        }
                    }
                }
            } catch (error) {
                console.error("[2Subs2Learn Background] Failed to fetch batch translation:", error);
            }
        }

        if (currentPriorityBatchIndex === batchIndex) {
            currentPriorityBatchIndex++;
        }
    }
}

export default defineBackground(() => {
    console.log("[2Subs2Learn Background] Service worker initialized.");

    storage.watch<boolean>('local:zdfvideoPlaying', (isPlaying) => {
        if (isPlaying !== null) {
            isVideoPaused = !isPlaying;
        }
    });

    browser.runtime.onMessage.addListener((message) => {
        if (message.type === 'START_BACKGROUND_TRANSLATION') {
            const { videoId, cues } = message.payload;
            currentPriorityBatchIndex = 0;
            processAndStoreBatches(videoId, cues);
        } else if (message.type === 'PRIORITIZE_SEEK_INDEX') {
            const { currentTime } = message.payload;
            currentPlaybackTime = currentTime;
            if (activeCuesCache.length > 0) {
                const cueIndex = activeCuesCache.findIndex(
                    cue => currentTime >= cue.start && currentTime <= (cue.start + cue.duration)
                );
                if (cueIndex !== -1) {
                    currentPriorityBatchIndex = Math.floor(cueIndex / BATCH_SIZE);
                    console.log(`[2Subs2Learn Background] Seek prioritized batch index: ${currentPriorityBatchIndex}`);
                }
            }
        } else if (message.type === 'UPDATE_CURRENT_TIME') {
            currentPlaybackTime = message.currentTime;
        }
    });
});