// entrypoints/background.ts
import { defineBackground, storage } from '#imports';

let TRANSLATION_SERVER = 'https://translate.theonlyalfaz.com/translate';


// Maximum number of chunk requests to prefetch in the background while video is paused

let translationModel = "accurate";

const max_background_request = translationModel === "hybrid" || translationModel == "accurate" ? 20 : 5;
// Number of subtitle cues sent in each chunk request
const prefetch_request_chunks = translationModel === "hybrid" || translationModel == "accurate" ? 2 : 5;


let isVideoPaused = true;
let isUserManuallyPaused = false;
let currentPriorityBatchIndex = 0;
let activeCuesCache: { start: number; duration: number; text: string }[] = [];
let activeVideoId = "";
let currentPlaybackTime = 0;
let currentPlatform = "";

let currentRunId = 0;
let activeAbortController: AbortController | null = null;

// Unlocks chrome.storage.session for all ISOLATED world content scripts
async function unlockSessionStorageForContentScripts() {
    try {
        if (browser.storage?.session?.setAccessLevel) {
            await browser.storage.session.setAccessLevel({
                accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS'
            });
            console.log("[2Subs2Learn Background] Session storage unlocked for content scripts.");
        }
    } catch (error) {
        console.error("[2Subs2Learn Background] Failed to set session storage access level:", error);
    }
}

// Automatically ping localhost on startup to check for local server availability
async function determineTranslationServer() {
    const localUrl = 'http://localhost:3000/translate';
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1500);

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

// Inspects the active tab's URL and synchronizes currentPlatform across session & local storage
async function updatePlatformFromTab(tabId?: number) {
    try {
        let tab: any = null;
        if (tabId) {
            tab = await browser.tabs.get(tabId).catch(() => null);
        }
        if (!tab || !tab.url) {
            const tabs = await browser.tabs.query({ active: true, currentWindow: true }).catch(() => []);
            tab = tabs[0];
        }

        if (tab?.url) {
            const url: string = tab.url;
            let detectedPlatform = "";

            if (url.includes("youtube.com/watch")) {
                detectedPlatform = "YOUTUBE";
            } else if (url.includes("zdf.de/play")) {
                detectedPlatform = "ZDF";
            }

            if (detectedPlatform && detectedPlatform !== currentPlatform) {
                currentPlatform = detectedPlatform;
                console.log("[2Subs2Learn Background] Active platform switched to:", detectedPlatform);
                await Promise.all([
                    storage.setItem('session:currentPlatform', detectedPlatform),
                    storage.setItem('local:currentPlatform', detectedPlatform)
                ]);

                if (detectedPlatform !== "ZDF" && activeAbortController) {
                    activeAbortController.abort();
                    activeAbortController = null;
                }
            }
        }
    } catch (error) {
        // Tab might be restricted or already closed
    }
}

// Cancels any running batch loop and aborts in-flight HTTP translation requests
function cancelActiveLoop() {
    currentRunId++;
    if (activeAbortController) {
        activeAbortController.abort();
        activeAbortController = null;
    }
}

// Calculates which chunk batch index corresponds to a specific video timestamp
function getBatchIndexForTime(cues: { start: number; duration: number; text: string }[], timeInSeconds: number): number {
    if (!cues || cues.length === 0) return 0;
    const cueIndex = cues.findIndex(cue => (cue.start + cue.duration) >= timeInSeconds);
    if (cueIndex === -1) return 0;
    return Math.floor(cueIndex / prefetch_request_chunks);
}

// Triggers ZDF playback via reactive session storage state only if ZDF is the active platform
async function triggerZdfPlayState() {
    if (currentPlatform !== "ZDF") return;
    try {
        await storage.setItem<boolean>('session:zdfvideoPlaying', true);
    } catch (error) {
        console.error("[2Subs2Learn Background] Failed to update play state:", error);
    }
}

// Signals the ZDF content script that new translations have been written to local storage
async function notifyZdfTranslationsUpdated(videoId: string) {
    try {
        await storage.setItem('session:zdfTranslationUpdated', {
            videoId,
            timestamp: Date.now()
        });
    } catch (error) {
        console.error("[2Subs2Learn Background] Failed to notify translation update:", error);
    }
}

// Core background queue worker that translates subtitle chunks and stores them in local storage
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
        // Pause background ZDF work if user switched to YouTube
        if (currentPlatform !== "ZDF") {
            while (currentPlatform !== "ZDF" && runId === currentRunId && activeVideoId === videoId) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            if (runId !== currentRunId || activeVideoId !== videoId) break;
        }

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

        // Skip network call if all cues in this chunk are already cached
        if (uncachedCues.length === 0) {
            const targetCue = activeCuesCache.find(cue => (cue.start + cue.duration) >= currentPlaybackTime);
            if (targetCue && isVideoPaused && !isUserManuallyPaused) {
                const isTargetCached = storedCuesForVideo.some(item => Math.abs(item.starttime - targetCue.start) < 0.1);
                if (isTargetCached) {
                    await triggerZdfPlayState();
                }
            }
            if (currentPriorityBatchIndex === batchIndex) {
                currentPriorityBatchIndex++;
            }
            continue;
        }

        // Rate-limit background prefetching while video is paused
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
                    targetLang: 'en',
                    model: translationModel
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

                await notifyZdfTranslationsUpdated(videoId);

                const targetCue = activeCuesCache.find(cue => (cue.start + cue.duration) >= currentPlaybackTime);
                if (targetCue && isVideoPaused && !isUserManuallyPaused) {
                    const isNowCached = cacheRoot[videoId].some(item => Math.abs(item.starttime - targetCue.start) < 0.1);
                    if (isNowCached) {
                        await triggerZdfPlayState();
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

    // Initialize session storage access and check local translation server
    unlockSessionStorageForContentScripts();
    determineTranslationServer();

    // Check currently active tab on background service worker startup
    updatePlatformFromTab();

    // Condition 2: Listen for tab switches across browser tabs
    browser.tabs.onActivated.addListener((activeInfo) => {
        updatePlatformFromTab(activeInfo.tabId);
    });

    // Condition 3: Listen for tab closures followed by another tab becoming active
    browser.tabs.onRemoved.addListener(() => {
        setTimeout(() => {
            updatePlatformFromTab();
        }, 100);
    });

    // Detect direct URL navigations in tabs
    browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
        if (changeInfo.url) {
            updatePlatformFromTab(tabId);
        }
    });

    // Watch active platform switches (ZDF <-> YOUTUBE)
    storage.watch<string>('session:currentPlatform', (platform) => {
        if (platform) {
            currentPlatform = platform;
            console.log("[2Subs2Learn Background] Active platform switched to:", platform);
            if (platform !== "ZDF" && activeAbortController) {
                // Abort in-flight ZDF request immediately when user switches to YouTube
                activeAbortController.abort();
                activeAbortController = null;
            }
        }
    });

    // Watch ZDF video play/pause status
    storage.watch<boolean>('session:zdfvideoPlaying', (isPlaying) => {
        if (isPlaying !== null) {
            isVideoPaused = !isPlaying;
        }
    });

    // Watch manual user pause state on ZDF
    storage.watch<boolean>('session:zdfManualPause', (isManualPause) => {
        if (isManualPause !== null) {
            isUserManuallyPaused = isManualPause;
            if (isManualPause) {
                isVideoPaused = true;
            }
        }
    });

    // Watch current playback timestamp updates from ZDF player
    storage.watch<number>('session:zdfCurrentTime', (time) => {
        if (time !== null) {
            currentPlaybackTime = time;
        }
    });

    // Watch ZDF active task state (starts translation queue or resets when null)
    storage.watch<{
        videoId: string;
        cues: { start: number; duration: number; text: string }[];
        currentTime: number;
        timestamp: number;
    } | null>('session:zdfActiveTask', (task) => {
        if (!task || !task.videoId || !task.cues || task.cues.length === 0) {
            cancelActiveLoop();
            activeVideoId = "";
            activeCuesCache = [];
            currentPriorityBatchIndex = 0;
            isUserManuallyPaused = false;
            console.log("[2Subs2Learn Background] Video state reset for new navigation.");
            return;
        }

        cancelActiveLoop();
        currentPlatform = "ZDF";
        currentPlaybackTime = task.currentTime || 0;
        isUserManuallyPaused = false;
        const startBatch = getBatchIndexForTime(task.cues, currentPlaybackTime);
        processAndStoreBatches(task.videoId, task.cues, startBatch, currentRunId);
    });

    // Watch ZDF timeline seek events to prioritize the batch at the new timestamp
    storage.watch<{
        videoId: string;
        currentTime: number;
        timestamp: number;
    } | null>('session:zdfSeekTrigger', (seekData) => {
        if (!seekData) return;
        currentPlaybackTime = seekData.currentTime;
        isUserManuallyPaused = false;

        if (activeCuesCache.length > 0 && activeVideoId === seekData.videoId) {
            cancelActiveLoop();
            const seekBatchIndex = getBatchIndexForTime(activeCuesCache, seekData.currentTime);
            currentPriorityBatchIndex = seekBatchIndex;
            console.log(`[2Subs2Learn Background] Seek prioritized batch index: ${currentPriorityBatchIndex}`);
            processAndStoreBatches(activeVideoId, activeCuesCache, seekBatchIndex, currentRunId);
        }
    });
});