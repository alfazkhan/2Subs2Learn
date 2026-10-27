// entrypoints/offscreen/index.ts
import { pipeline, env } from '@xenova/transformers';

// Configure runtime flags for browser environment
env.allowLocalModels = false;
env.useBrowserCache = true;

// Re-enable multi-threaded WASM workers inside DOM window context
env.backends.onnx.wasm.proxy = true;
env.backends.onnx.wasm.numThreads = Math.min(4, navigator.hardwareConcurrency || 2);

let transformersPipeline: any = null;
let isInitializing = false;
const modelDownloadState: Record<string, { loaded: number; total: number }> = {};

function getFormattedTime(date = new Date()): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  const ms = String(date.getMilliseconds()).padStart(3, '0');
  return `${hours}:${minutes}:${seconds}:${ms}`;
}

// Offscreen documents cannot access chrome.storage directly.
// Relay progress events to the background worker via runtime messaging.
async function reportProgress(status: string, progress: number) {
  try {
    await browser.runtime.sendMessage({
      target: 'background',
      type: 'MODEL_DOWNLOAD_PROGRESS',
      payload: { status, progress }
    });
  } catch (error) {
    // Non-fatal if background worker is temporarily cycling
  }
}

async function getTranslationPipeline(sourceLang = 'de', targetLang = 'en') {
  if (transformersPipeline) return transformersPipeline;

  if (isInitializing) {
    while (isInitializing) {
      await new Promise((r) => setTimeout(r, 100));
    }
    return transformersPipeline;
  }

  isInitializing = true;
  try {
    const modelName =
      sourceLang === 'en' && targetLang === 'de'
        ? 'Xenova/opus-mt-en-de'
        : 'Xenova/opus-mt-de-en';

    console.log(`[${getFormattedTime()}] [Offscreen] Initializing pipeline: ${modelName}`);
    await reportProgress('initiating', 0);

    // Request WebGPU device acceleration with automatic WASM fallback
    transformersPipeline = await pipeline('translation', modelName, {
      device: 'webgpu',
      progress_callback: async (info: any) => {
        if (info.status === 'progress' && info.total) {
          modelDownloadState[info.file] = { loaded: info.loaded, total: info.total };

          let totalBytes = 0;
          let loadedBytes = 0;
          for (const file in modelDownloadState) {
            totalBytes += modelDownloadState[file].total;
            loadedBytes += modelDownloadState[file].loaded;
          }

          const overallProgress =
            totalBytes > 0
              ? parseFloat(((loadedBytes / totalBytes) * 100).toFixed(1))
              : 0;

          await reportProgress('downloading', overallProgress);
        } else if (info.status === 'ready') {
          await reportProgress('ready', 100);
        }
      }
    });

    console.log(`[${getFormattedTime()}] [Offscreen] Translation model loaded successfully.`);
    return transformersPipeline;
  } catch (error) {
    console.error(`[${getFormattedTime()}] [Offscreen] Model loading failure:`, error);
    await reportProgress('error', 0);
    throw error;
  } finally {
    isInitializing = false;
  }
}

async function translateSentence(translator: any, sentence: string, options: any): Promise<string> {
  const trimmed = sentence.trim();
  if (!trimmed) return '';
  try {
    const out = await translator(trimmed, options);
    return out[0].translation_text.trim();
  } catch (error) {
    console.error(`[${getFormattedTime()}] [Offscreen] Sentence translation error:`, error);
    return trimmed;
  }
}

async function translateFullCue(translator: any, rawCueText: string, options: any): Promise<string> {
  if (!rawCueText || typeof rawCueText !== 'string') return rawCueText;

  const lines = rawCueText.split('\n');

  const translatedLines = await Promise.all(
    lines.map(async (line) => {
      const trimmedLine = line.trim();
      if (!trimmedLine) return '';

      const sentences = trimmedLine.split(/(?<=[.?!])\s+/).filter(Boolean);

      if (sentences.length <= 1) {
        return await translateSentence(translator, trimmedLine, options);
      }

      const translatedSentences = await Promise.all(
        sentences.map((s) => translateSentence(translator, s, options))
      );
      return translatedSentences.join(' ');
    })
  );

  return translatedLines.join('\n');
}

// Background script communication listener
browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target !== 'offscreen') return;

  if (message.type === 'PING') {
    sendResponse({ status: 'PONG' });
    return true;
  }

  if (message.type === 'TRANSLATE_BATCH') {
    (async () => {
      const startTime = performance.now();
      try {
        const { texts, sourceLang, targetLang, options } = message.payload;
        const translator = await getTranslationPipeline(sourceLang, targetLang);

        const translations = await Promise.all(
          texts.map((text: string) => translateFullCue(translator, text, options))
        );

        const duration = (performance.now() - startTime).toFixed(1);
        console.log(`[${getFormattedTime()}] [Offscreen] Translated ${texts.length} cues in ${duration}ms`);

        sendResponse({ success: true, translations });
      } catch (error: any) {
        console.error(`[${getFormattedTime()}] [Offscreen] Execution error:`, error);
        sendResponse({ success: false, error: error.message || String(error) });
      }
    })();

    return true;
  }
});