// entrypoints/background/index.ts - Orchestrator for background worker modules
import { defineBackground, storage } from '#imports';

// Import orchestration utilities from helpers module
import { getFormattedTime } from './helpers';

// Import translation logic from engine module
import {
  ensureInferenceContext, 
  initChromeNativeTranslation,
  requestTranslations
} from './translation-engine';

// Configuration constants
const prefetchRequestChunks = 3;
const maxBackgroundRequest = 5;

// State management (moved to module-level variables)
let isVideoPaused = true;
let isUserManuallyPaused = false;
let currentPriorityBatchIndex = 0;
let activeCuesCache: { start: number; duration: number; text: string }[] = [];
let activeVideoId = '';
let currentPlaybackTime = 0;
let currentPlatform = '';
let currentRunId = 0;

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
      let detectedPlatform = '';

      if (url.includes('youtube.com/watch')) {
        detectedPlatform = 'YOUTUBE';
      } else if (url.includes('zdf.de/play')) {
        detectedPlatform = 'ZDF';
      }

      if (detectedPlatform && detectedPlatform !== currentPlatform) {
        currentPlatform = detectedPlatform;
        await storage.setItem('local:currentPlatform', detectedPlatform);

        if (detectedPlatform !== 'ZDF') {
          currentRunId++;
        }
      }
    }
  } catch (error) {}
}

function cancelActiveLoop() {
  currentRunId++;
}

function getBatchIndexForTime(
  cues: { start: number; duration: number; text: string }[],
  timeInSeconds: number
): number {
  if (!cues || cues.length === 0) return 0;
  const cueIndex = cues.findIndex((cue) => cue.start + cue.duration >= timeInSeconds);
  if (cueIndex === -1) return 0;
  return Math.floor(cueIndex / prefetchRequestChunks);
}

async function triggerZdfPlayState() {
  if (currentPlatform !== 'ZDF') return;
  try {
    await storage.setItem<boolean>('local:zdfvideoPlaying', true);
  } catch (error) {}
}

async function notifyZdfTranslationsUpdated(videoId: string) {
  try {
    await storage.setItem('local:zdfTranslationUpdated', {
      videoId,
      timestamp: Date.now()
    });
  } catch (error) {}
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
    if (currentPlatform !== 'ZDF') {
      while (currentPlatform !== 'ZDF' && runId === currentRunId && activeVideoId === videoId) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      if (runId !== currentRunId || activeVideoId !== videoId) break;
    }

    const batchIndex = currentPriorityBatchIndex;
    const startIndex = batchIndex * prefetchRequestChunks;

    if (startIndex >= cues.length) {
      break;
    }

    const batch = cues.slice(startIndex, startIndex + prefetchRequestChunks);
    const storedCuesForVideo = cacheRoot[videoId] || [];

    const uncachedCues = batch.filter(
      (cue: { start: number; duration: number; text: string }) => !storedCuesForVideo.some((stored) => Math.abs(stored.starttime - cue.start) < 0.1)
    );

    if (uncachedCues.length === 0) {
      const targetCue = activeCuesCache.find(
        (cue: { start: number; duration: number; text: string }) => cue.start + cue.duration >= currentPlaybackTime
      );
      if (targetCue && isVideoPaused && !isUserManuallyPaused) {
        const isTargetCached = storedCuesForVideo.some(
          (item) => Math.abs(item.starttime - targetCue.start) < 0.1
        );
        if (isTargetCached) {
          await triggerZdfPlayState();
        }
      }
      if (currentPriorityBatchIndex === batchIndex) {
        currentPriorityBatchIndex++;
      }
      continue;
    }

    if (isVideoPaused) {
      if (batchesFetchedWhilePaused >= maxBackgroundRequest) {
        while (
          isVideoPaused &&
          currentPriorityBatchIndex === batchIndex &&
          runId === currentRunId &&
          activeVideoId === videoId
        ) {
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
        if (runId !== currentRunId || activeVideoId !== videoId) break;
        batchesFetchedWhilePaused = 0;
        continue;
      }
    }

    try {
      const textsToTranslate: string[] = uncachedCues.map((c: { text: string }) => c.text);
      console.log(`\n[${getFormattedTime()}] --- TRANSLATION BATCH START ---`);
      console.log(`[${getFormattedTime()}] INPUT (${textsToTranslate.length} cues):`, textsToTranslate);

      const translations = await requestTranslations(textsToTranslate, 'de', 'en');

      console.log(`[${getFormattedTime()}] OUTPUT:`, translations);
      console.log(`[${getFormattedTime()}] --- TRANSLATION BATCH END ---\n`);

      if (runId !== currentRunId || activeVideoId !== videoId) break;

      if (translations && translations.length > 0) {
        cacheRoot = (await storage.getItem(storageKey)) || {};
        if (!cacheRoot[videoId]) cacheRoot[videoId] = [];

        for (let j = 0; j < uncachedCues.length; j++) {
          const cue = uncachedCues[j];
          if (!cue) continue;
          const translatedText = translations[j];

          const exists = cacheRoot[videoId].some(
            (item) => Math.abs(item.starttime - cue.start) < 0.1
          );
          if (!exists) {
            cacheRoot[videoId].push({
              starttime: cue.start,
              endtime: cue.start + cue.duration,
              text: translatedText!
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

        const targetCue = activeCuesCache.find(
          (cue: { start: number; duration: number; text: string }) => cue.start + cue.duration >= currentPlaybackTime
        );
        if (targetCue && isVideoPaused && !isUserManuallyPaused) {
          const isNowCached = cacheRoot[videoId].some(
            (item) => Math.abs(item.starttime - targetCue.start) < 0.1
          );
          if (isNowCached) {
            await triggerZdfPlayState();
          }
        }
      }
    } catch (error: any) {
      console.error(`[${getFormattedTime()}] BATCH ERROR (Will retry):`, error.message || error);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    if (currentPriorityBatchIndex === batchIndex) {
      currentPriorityBatchIndex++;
    }
  }
}

export default defineBackground(() => {
  updatePlatformFromTab();
  initChromeNativeTranslation('de', 'en');

  ensureInferenceContext(browser.runtime.getURL('/offscreen.html')).catch((error) => {
    console.error('[Translation Engine] Failed to initialize inference context:', error);
  });
  browser.runtime.onMessage.addListener((message) => {
    if (message?.target === 'background' && message.type === 'MODEL_DOWNLOAD_PROGRESS') {
      storage.setItem('local:modelDownloadProgress', message.payload);
    }
  });

  browser.tabs.onActivated.addListener((activeInfo) => updatePlatformFromTab(activeInfo.tabId));
  browser.tabs.onRemoved.addListener(() => setTimeout(() => updatePlatformFromTab(), 100));
  browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.url) updatePlatformFromTab(tabId);
  });

  storage.watch<string>('local:currentPlatform', (platform) => {
    if (platform) {
      currentPlatform = platform;
      if (platform !== 'ZDF') cancelActiveLoop();
    }
  });

  storage.watch<boolean>('local:zdfvideoPlaying', (isPlaying) => {
    if (isPlaying !== null) isVideoPaused = !isPlaying;
  });

  storage.watch<boolean>('local:zdfManualPause', (isManualPause) => {
    if (isManualPause !== null) {
      isUserManuallyPaused = isManualPause;
      if (isManualPause) isVideoPaused = true;
    }
  });

  storage.watch<number>('local:zdfCurrentTime', (time) => {
    if (time !== null) currentPlaybackTime = time;
  });

  storage.watch<{
    videoId: string;
    cues: { start: number; duration: number; text: string }[];
    currentTime: number;
    timestamp: number;
  } | null>('local:zdfActiveTask', (task) => {
    if (!task || !task.videoId || !task.cues || task.cues.length === 0) {
      cancelActiveLoop();
      activeVideoId = '';
      activeCuesCache = [];
      currentPriorityBatchIndex = 0;
      isUserManuallyPaused = false;
      return;
    }

    cancelActiveLoop();
    currentPlatform = 'ZDF';
    currentPlaybackTime = task.currentTime || 0;
    isUserManuallyPaused = false;
    const startBatch = getBatchIndexForTime(task.cues, currentPlaybackTime);
    processAndStoreBatches(task.videoId, task.cues, startBatch, currentRunId);
  });

  storage.watch<{
    videoId: string;
    currentTime: number;
    timestamp: number;
  } | null>('local:zdfSeekTrigger', (seekData) => {
    if (!seekData) return;
    currentPlaybackTime = seekData.currentTime;
    isUserManuallyPaused = false;

    if (activeCuesCache.length > 0 && activeVideoId === seekData.videoId) {
      cancelActiveLoop();
      const seekBatchIndex = getBatchIndexForTime(activeCuesCache, seekData.currentTime);
      currentPriorityBatchIndex = seekBatchIndex;
      processAndStoreBatches(activeVideoId, activeCuesCache, seekBatchIndex, currentRunId);
    }
  });
});