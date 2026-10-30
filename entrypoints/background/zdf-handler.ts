// entrypoints/background/zdf-handler.ts
// Handles ZDF-specific functionality and subtitle batch processing

import { getBatchIndexForTime, getFormattedTime } from './helpers';
import { storage } from '#imports';
import { max_background_request, prefetch_request_chunks, requestTranslations } from './translation-engine';

let activeVideoId = '';
let activeCuesCache: { start: number; duration: number; text: string }[] = [];
let currentPriorityBatchIndex = 0;
let isVideoPaused = true;
let isUserManuallyPaused = false;
let currentPlatform = '';
let currentRunId = 0;
let currentPlaybackTime = 0;

export async function updatePlatformFromTab(tabId?: number): Promise<void> {
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

export function cancelActiveLoop(): void {
  currentRunId++;
}

export async function triggerZdfPlayState(): Promise<void> {
  if (currentPlatform !== 'ZDF') return;
  try {
    await storage.setItem<boolean>('local:zdfvideoPlaying', true);
  } catch (error) {}
}

export async function notifyZdfTranslationsUpdated(videoId: string): Promise<void> {
  try {
    await storage.setItem('local:zdfTranslationUpdated', {
      videoId,
      timestamp: Date.now()
    });
  } catch (error) {}
}

export async function processAndStoreBatches(
  videoId: string,
  cues: { start: number; duration: number; text: string }[],
  startBatchIndex: number,
  runId: number
): Promise<void> {
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
    const startIndex = batchIndex * prefetch_request_chunks;

    if (startIndex >= cues.length) {
      break;
    }

    const batch = cues.slice(startIndex, startIndex + prefetch_request_chunks);
    const storedCuesForVideo = cacheRoot[videoId] || [];

    const uncachedCues = batch.filter(
      (cue) => !storedCuesForVideo.some((stored) => Math.abs(stored.starttime - cue.start) < 0.1)
    );

    if (uncachedCues.length === 0) {
      const targetCue = activeCuesCache.find(
        (cue) => cue.start + cue.duration >= currentPlaybackTime
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
      if (batchesFetchedWhilePaused >= max_background_request) {
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
      const textsToTranslate = uncachedCues.map((c) => c.text);
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
          const translatedText = translations[j] ?? '';

          if (!cue) continue;

          const exists = cacheRoot[videoId].some(
            (item) => Math.abs(item.starttime - cue.start) < 0.1
          );
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

        const targetCue = activeCuesCache.find(
          (cue) => cue.start + cue.duration >= currentPlaybackTime
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
