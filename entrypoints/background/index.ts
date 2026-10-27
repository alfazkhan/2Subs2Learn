// entrypoints/background.ts
import { defineBackground, storage } from '#imports';

const prefetch_request_chunks = 3;
const max_background_request = 5;

let isVideoPaused = true;
let isUserManuallyPaused = false;
let currentPriorityBatchIndex = 0;
let activeCuesCache: { start: number; duration: number; text: string }[] = [];
let activeVideoId = '';
let currentPlaybackTime = 0;
let currentPlatform = '';
let currentRunId = 0;

let chromeNativeTranslator: any = null;
let isCheckingNativeEngine = false;

function getFormattedTime(date = new Date()): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  const ms = String(date.getMilliseconds()).padStart(3, '0');
  return `${hours}:${minutes}:${seconds}:${ms}`;
}

async function unlockSessionStorageForContentScripts() {
  try {
    if (browser.storage?.session?.setAccessLevel) {
      await browser.storage.session.setAccessLevel({
        accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS'
      });
    }
  } catch (error) {
    console.error(`[${getFormattedTime()}] Failed to set session storage access level:`, error);
  }
}

async function ensureOffscreenDocument() {
  const offscreenUrl = browser.runtime.getURL('/offscreen.html');

  if ('offscreen' in chrome && typeof chrome.offscreen?.hasDocument === 'function') {
    const hasDoc = await chrome.offscreen.hasDocument();
    if (hasDoc) return;
  }

  try {
    await chrome.offscreen.createDocument({
      url: offscreenUrl,
      reasons: ['WORKERS' as any],
      justification: 'Run client-side machine learning inference for subtitle translation'
    });
    console.log(`[${getFormattedTime()}] [Background] Offscreen document mounted at /offscreen.html`);
  } catch (error: any) {
    if (!error.message?.includes('Only a single offscreen document may be created')) {
      console.error(`[${getFormattedTime()}] [Background] Error creating offscreen document:`, error);
      throw error;
    }
  }
}

async function initChromeNativeTranslation(sourceLang = 'de', targetLang = 'en') {
  if (chromeNativeTranslator || isCheckingNativeEngine) return;
  isCheckingNativeEngine = true;

  try {
    const translationApi = (self as any).translation || (self as any).ai?.translator;
    if (translationApi && typeof translationApi.canTranslate === 'function') {
      const canTranslate = await translationApi.canTranslate({
        sourceLanguage: sourceLang,
        targetLanguage: targetLang
      });
      if (canTranslate !== 'no') {
        console.log(`[${getFormattedTime()}] Initializing Chrome Native Translation API...`);
        chromeNativeTranslator = await translationApi.createTranslator({
          sourceLanguage: sourceLang,
          targetLanguage: targetLang
        });
      }
    }
  } catch (error) {
    console.warn(`[${getFormattedTime()}] Chrome Native Translation unavailable:`, error);
  } finally {
    isCheckingNativeEngine = false;
  }
}

async function requestTranslations(
  texts: string[],
  sourceLang = 'de',
  targetLang = 'en'
): Promise<string[]> {
  if (chromeNativeTranslator) {
    return await Promise.all(
      texts.map(async (text) => {
        const trimmed = text.trim();
        if (!trimmed) return '';
        try {
          return await chromeNativeTranslator.translate(trimmed);
        } catch {
          return trimmed;
        }
      })
    );
  }

  await ensureOffscreenDocument();

  const response = await browser.runtime.sendMessage({
    target: 'offscreen',
    type: 'TRANSLATE_BATCH',
    payload: {
      texts,
      sourceLang,
      targetLang,
      options: {
        max_new_tokens: 50,
        repetition_penalty: 1.2,
        no_repeat_ngram_size: 3
      }
    }
  });

  if (!response?.success) {
    throw new Error(response?.error || 'Offscreen translation pipeline failure');
  }

  return response.translations;
}

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
        await Promise.all([
          storage.setItem('session:currentPlatform', detectedPlatform),
          storage.setItem('local:currentPlatform', detectedPlatform)
        ]);

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
  return Math.floor(cueIndex / prefetch_request_chunks);
}

async function triggerZdfPlayState() {
  if (currentPlatform !== 'ZDF') return;
  try {
    await storage.setItem<boolean>('session:zdfvideoPlaying', true);
  } catch (error) {}
}

async function notifyZdfTranslationsUpdated(videoId: string) {
  try {
    await storage.setItem('session:zdfTranslationUpdated', {
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
          const translatedText = translations[j];

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

export default defineBackground(() => {
  unlockSessionStorageForContentScripts();
  updatePlatformFromTab();
  initChromeNativeTranslation('de', 'en');

  ensureOffscreenDocument().catch(() => {});

  // Listen for delegated progress messages from the offscreen document
  browser.runtime.onMessage.addListener((message) => {
    if (message?.target === 'background' && message.type === 'MODEL_DOWNLOAD_PROGRESS') {
      storage.setItem('session:modelDownloadProgress', message.payload);
    }
  });

  browser.tabs.onActivated.addListener((activeInfo) => updatePlatformFromTab(activeInfo.tabId));
  browser.tabs.onRemoved.addListener(() => setTimeout(() => updatePlatformFromTab(), 100));
  browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.url) updatePlatformFromTab(tabId);
  });

  storage.watch<string>('session:currentPlatform', (platform) => {
    if (platform) {
      currentPlatform = platform;
      if (platform !== 'ZDF') cancelActiveLoop();
    }
  });

  storage.watch<boolean>('session:zdfvideoPlaying', (isPlaying) => {
    if (isPlaying !== null) isVideoPaused = !isPlaying;
  });

  storage.watch<boolean>('session:zdfManualPause', (isManualPause) => {
    if (isManualPause !== null) {
      isUserManuallyPaused = isManualPause;
      if (isManualPause) isVideoPaused = true;
    }
  });

  storage.watch<number>('session:zdfCurrentTime', (time) => {
    if (time !== null) currentPlaybackTime = time;
  });

  storage.watch<{
    videoId: string;
    cues: { start: number; duration: number; text: string }[];
    currentTime: number;
    timestamp: number;
  } | null>('session:zdfActiveTask', (task) => {
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
  } | null>('session:zdfSeekTrigger', (seekData) => {
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