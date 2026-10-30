// entrypoints/background/translation-engine.ts
// Handles all translation-related functionality

import { getFormattedTime } from './helpers';
import { storage } from '#imports';

export const prefetch_request_chunks = 3;
export const max_background_request = 5;

let chromeNativeTranslator: any = null;
let isCheckingNativeEngine = false;

export async function ensureInferenceContext(
  offscreenUrl: string
): Promise<void> {
  // 1. Chromium Path: Use chrome.offscreen API
  const chromeApi = (globalThis as any).chrome;
  if (chromeApi?.offscreen?.createDocument) {
    if (typeof chromeApi.offscreen.hasDocument === 'function') {
      const hasDoc = await chromeApi.offscreen.hasDocument();
      if (hasDoc) return;
    }
    try {
      await chromeApi.offscreen.createDocument({
        url: offscreenUrl,
        reasons: ['WORKERS'],
        justification: 'Run client-side machine learning inference for subtitle translation'
      });
      console.log(`[${getFormattedTime()}] [Translation Engine] Chromium Offscreen document mounted.`);
      return;
    } catch (error: any) {
      if (!error.message?.includes('Only a single offscreen document may be created')) {
        console.error(`[${getFormattedTime()}] [Translation Engine] Offscreen error:`, error);
        throw error;
      }
      return;
    }
  }

  // 2. Firefox Path: Background scripts have full DOM access. Mount offscreen UI in a hidden iframe.
  if (typeof document !== 'undefined') {
    let iframe = document.getElementById('inference-frame') as HTMLIFrameElement;
    if (!iframe) {
      iframe = document.createElement('iframe');
      iframe.id = 'inference-frame';
      iframe.src = offscreenUrl;
      iframe.style.display = 'none';
      document.body.appendChild(iframe);
      console.log(`[${getFormattedTime()}] [Translation Engine] Firefox inference iframe mounted.`);
      // Allow the iframe time to load the script and register its runtime.onMessage listener
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}

export async function initChromeNativeTranslation(
  sourceLang: string = 'de',
  targetLang: string = 'en'
): Promise<void> {
  if (chromeNativeTranslator || isCheckingNativeEngine) return;
  isCheckingNativeEngine = true;

  try {
    const translationApi = (globalThis as any).translation || (globalThis as any).ai?.translator;
    if (translationApi && typeof translationApi.canTranslate === 'function') {
      const canTranslate = await translationApi.canTranslate({
        sourceLanguage: sourceLang,
        targetLanguage: targetLang
      });
      if (canTranslate !== 'no') {
        console.log(`[${getFormattedTime()}] [Translation Engine] Initializing Chrome Native Translation API...`);
        chromeNativeTranslator = await translationApi.createTranslator({
          sourceLanguage: sourceLang,
          targetLanguage: targetLang
        });
      }
    }
  } catch (error) {
    console.warn(`[${getFormattedTime()}] [Translation Engine] Chrome Native Translation unavailable:`, error);
  } finally {
    isCheckingNativeEngine = false;
  }
}

export async function requestTranslations(
  texts: string[],
  sourceLang: string = 'de',
  targetLang: string = 'en'
): Promise<string[]> {
  const options = {
    max_new_tokens: 50,
    repetition_penalty: 1.2,
    no_repeat_ngram_size: 3
  };

  // Fast path: Built-in Chrome AI
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

  // Universal Offscreen/Iframe engine path
  await ensureInferenceContext(
    browser.runtime.getURL('/offscreen.html')
  );

  const response = await browser.runtime.sendMessage({
    target: 'offscreen',
    type: 'TRANSLATE_BATCH',
    payload: { texts, sourceLang, targetLang, options }
  });

  if (!response?.success) {
    throw new Error(response?.error || 'Inference engine response error');
  }

  return response.translations;
}
