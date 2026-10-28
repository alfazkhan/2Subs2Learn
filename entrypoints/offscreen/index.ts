// entrypoints/offscreen/index.ts
import { getTranslationPipeline, translateFullCue } from '@/services/translator';

function getFormattedTime(date = new Date()): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  const ms = String(date.getMilliseconds()).padStart(3, '0');
  return `${hours}:${minutes}:${seconds}:${ms}`;
}

async function reportProgress(status: string, progress: number) {
  try {
    await browser.runtime.sendMessage({
      target: 'background',
      type: 'MODEL_DOWNLOAD_PROGRESS',
      payload: { status, progress }
    });
  } catch {
    // Non-fatal if background worker is busy
  }
}

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
        const translator = await getTranslationPipeline(sourceLang, targetLang, reportProgress);

        const translations = await Promise.all(
          texts.map((text: string) => translateFullCue(translator, text, options))
        );

        const duration = (performance.now() - startTime).toFixed(1);
        console.log(`[${getFormattedTime()}] [Offscreen] Batch translated in ${duration}ms`);

        sendResponse({ success: true, translations });
      } catch (error: any) {
        console.error(`[${getFormattedTime()}] [Offscreen] Translation error:`, error);
        sendResponse({ success: false, error: error.message || String(error) });
      }
    })();

    return true; // Keep message channel open for async response
  }
});