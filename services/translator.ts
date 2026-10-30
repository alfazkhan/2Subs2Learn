// services/translator.ts
import { pipeline, env } from '@xenova/transformers';

env.allowLocalModels = false;
env.useBrowserCache = true;

// CRITICAL FIX: Disable web workers (proxy) to prevent silent hangs in Firefox MV3.
// If WebGPU is supported (Chrome Offscreen), it runs on GPU. If not, it falls back to reliable CPU WASM.
env.backends.onnx.wasm.proxy = false;
env.backends.onnx.wasm.numThreads = 1;

let transformersPipeline: any = null;
let isInitializing = false;
const modelDownloadState: Record<string, { loaded: number; total: number }> = {};

export type ProgressCallback = (status: string, progress: number) => void | Promise<void>;

export async function getTranslationPipeline(
  sourceLang = 'de',
  targetLang = 'en',
  onProgress?: ProgressCallback
) {
  if (transformersPipeline) return transformersPipeline;

  if (isInitializing) {
    while (isInitializing) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return transformersPipeline;
  }

  isInitializing = true;
  try {
    const modelName =
      sourceLang === 'en' && targetLang === 'de'
        ? 'Xenova/opus-mt-en-de'
        : 'Xenova/opus-mt-de-en';

    if (onProgress) await onProgress('initiating', 0);

    transformersPipeline = await pipeline('translation', modelName, {
      progress_callback: async (info: any) => {
        if (info.status === 'progress' && info.total) {
          modelDownloadState[info.file] = { loaded: info.loaded, total: info.total };

          let totalBytes = 0;
          let loadedBytes = 0;
          for (const file in modelDownloadState) {
            const fileState = modelDownloadState[file];
            if (!fileState) continue;
            totalBytes += fileState.total;
            loadedBytes += fileState.loaded;
          }

          const overallProgress =
            totalBytes > 0
              ? parseFloat(((loadedBytes / totalBytes) * 100).toFixed(1))
              : 0;

          if (onProgress) await onProgress('downloading', overallProgress);
        } else if (info.status === 'ready') {
          if (onProgress) await onProgress('ready', 100);
        }
      }
    });

    return transformersPipeline;
  } catch (error) {
    if (onProgress) await onProgress('error', 0);
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
    return trimmed;
  }
}

export async function translateFullCue(translator: any, rawCueText: string, options: any): Promise<string> {
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