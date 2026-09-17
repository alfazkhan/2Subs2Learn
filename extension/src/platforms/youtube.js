// extension/src/platforms/youtube.js
import { AppConfig } from '../core/config.js';
import { logEvent, renderChunkedProgressBar, mountEmbeddedToolbar } from '../core/ui.js';
import { translateTextsBatch, getStoredTranslation, hasTranslationStored, clearTranslationCache } from '../core/translator.js';
import { renderDualSubtitles } from '../core/ui.js';

let subtitleCues = [];
let isTranslatingBatch = false;
let activeBatchIndex = -1;
let lastVideoId = "";
let pauseTimer = null;

export function enablePlatformCaptions() {
    const ccButton = document.querySelector('.ytp-subtitles-button');
    if (ccButton && ccButton.getAttribute('aria-pressed') === 'false') {
        ccButton.click();
    }
}

export function extractVideoTimestamp() {
    const urlParams = new URLSearchParams(window.location.search);
    const tParam = urlParams.get('t');
    if (!tParam) return 0;
    if (tParam.endsWith('s')) return parseInt(tParam, 10) || 0;
    
    let totalSeconds = 0;
    const mMatch = tParam.match(/(\d+)m/);
    const sMatch = tParam.match(/(\d+)s/);
    if (mMatch) totalSeconds += parseInt(mMatch[1], 10) * 60;
    if (sMatch) totalSeconds += parseInt(sMatch[1], 10);
    return totalSeconds > 0 ? totalSeconds : (parseInt(tParam, 10) || 0);
}

export function forcePlayVideo(videoElement) {
    if (!videoElement) return;
    videoElement.play().catch(() => {});
    const ytPlayBtn = document.querySelector('.ytp-play-button');
    if (ytPlayBtn && ytPlayBtn.getAttribute('data-title-no-tooltip') === 'Play') {
        ytPlayBtn.click();
    }
}

export async function isChunkTranslated(start, end) {
    for (let i = start; i < end; i++) {
        if (subtitleCues[i]) {
            const has = await hasTranslationStored(subtitleCues[i].text);
            if (!has) return false;
        }
    }
    return true;
}

export async function loadTranslationChunk(startIndex) {
    if (isTranslatingBatch && activeBatchIndex === startIndex) return;
    isTranslatingBatch = true;
    activeBatchIndex = startIndex;

    const endIndex = Math.min(startIndex + AppConfig.batchSize, subtitleCues.length);
    const batchTexts = [];

    for (let i = startIndex; i < endIndex; i++) {
        if (subtitleCues[i]) {
            const has = await hasTranslationStored(subtitleCues[i].text);
            if (!has) batchTexts.push(subtitleCues[i].text);
        }
    }

    if (batchTexts.length > 0) {
        await translateTextsBatch(batchTexts);
    }

    isTranslatingBatch = false;
    activeBatchIndex = -1;
    
    const translatedAll = await isChunkTranslated(0, subtitleCues.length);
    renderChunkedProgressBar(subtitleCues.length, async (s, e) => await isChunkTranslated(s, e));
}

// 5. Read active subtitle language from session storage preference array
export function detectLanguageFromSessionStorage() {
    try {
        const rawPref = sessionStorage.getItem('yt-player-caption-language-preferences');
        if (rawPref) {
            const parsed = JSON.parse(rawPref);
            if (parsed && parsed.data) {
                const langArray = typeof parsed.data === 'string' ? JSON.parse(parsed.data) : parsed.data;
                if (Array.isArray(langArray) && langArray.length > 0) {
                    const lastLang = langArray[langArray.length - 1].toLowerCase();
                    if (lastLang.includes('de')) {
                        AppConfig.sourceLanguage = 'de';
                        AppConfig.targetLanguage = 'en';
                    } else if (lastLang.includes('en')) {
                        AppConfig.sourceLanguage = 'en';
                        AppConfig.targetLanguage = 'de';
                    }
                    logEvent("Session Language", `Auto-detected active subtitle language: ${lastLang}`);
                }
            }
        }
    } catch (e) {}
}

export function parseSubtitlePayload(payload, requestUrl) {
    if (!payload || !payload.events) return;

    const urlParams = new URLSearchParams(window.location.search);
    const currentVideoId = urlParams.get('v');
    if (currentVideoId && currentVideoId !== lastVideoId) {
        lastVideoId = currentVideoId;
        clearTranslationCache();
        logEvent("Platform Adapter", `New video detected (${currentVideoId}), cache wiped.`);
    }

    detectLanguageFromSessionStorage();

    if (requestUrl) {
        if (requestUrl.includes('lang=de')) {
            AppConfig.sourceLanguage = 'de';
            AppConfig.targetLanguage = 'en';
        } else if (requestUrl.includes('lang=en')) {
            AppConfig.sourceLanguage = 'en';
            AppConfig.targetLanguage = 'de';
        }
    }

    subtitleCues = payload.events
        .filter(event => event.segs)
        .map(event => ({
            start: event.tStartMs / 1000,
            duration: (event.dDurationMs || 2000) / 1000,
            text: event.segs.map(seg => seg.utf8 || '').join('').trim()
        }))
        .filter(cue => cue.text.length > 0);

    renderChunkedProgressBar(subtitleCues.length, async (s, e) => await isChunkTranslated(s, e));
    mountEmbeddedToolbar((newSettings) => {
        AppConfig.updateSettings(newSettings);
        triggerLanguageReset();
    });

    const initialTime = extractVideoTimestamp();
    const videoElement = document.querySelector('video.html5-main-video') || document.querySelector('video');
    const targetSecs = initialTime > 0 ? initialTime : (videoElement ? videoElement.currentTime : 0);

    alignBatchToTime(targetSecs);
}

// 4. Changing target or source language pauses video -> clears cache -> requests chunk -> plays video
export function triggerLanguageReset() {
    const videoElement = document.querySelector('video.html5-main-video') || document.querySelector('video');
    if (!videoElement) return;

    videoElement.pause();
    logEvent("Settings Change", "Language updated. Clearing cache and re-fetching chunk.");
    clearTranslationCache();
    renderChunkedProgressBar(subtitleCues.length, async (s, e) => await isChunkTranslated(s, e));

    alignBatchToTime(videoElement.currentTime);
    setTimeout(() => {
        forcePlayVideo(videoElement);
    }, 400);
}

function alignBatchToTime(currentTime) {
    if (subtitleCues.length === 0) return;
    let currentIndex = subtitleCues.findIndex(
        cue => currentTime >= cue.start && currentTime <= (cue.start + cue.duration)
    );
    if (currentIndex === -1) {
        currentIndex = subtitleCues.findIndex(cue => cue.start >= currentTime);
    }
    const targetIndex = currentIndex !== -1 ? Math.floor(currentIndex / AppConfig.batchSize) * AppConfig.batchSize : 0;
    loadTranslationChunk(targetIndex);
}

export function initPlatformSyncEngine() {
    const videoElement = document.querySelector('video.html5-main-video') || document.querySelector('video');
    if (!videoElement) {
        setTimeout(initPlatformSyncEngine, 1000);
        return;
    }

    enablePlatformCaptions();
    mountEmbeddedToolbar((newSettings) => {
        AppConfig.updateSettings(newSettings);
        triggerLanguageReset();
    });

    let previousCueText = "";
    let isWaitingForTranslation = false;

    videoElement.addEventListener('seeked', () => {
        isWaitingForTranslation = false;
        alignBatchToTime(videoElement.currentTime);
    });

    // 2. Detect when video is paused for more than 5 seconds to start background prefetching (clears timer on resume)
    videoElement.addEventListener('pause', () => {
        if (videoElement.ended) return;
        if (pauseTimer) clearTimeout(pauseTimer);

        pauseTimer = setTimeout(() => {
            logEvent("Background Prefetch", "Video paused > 5s. Fetching upcoming chunks in background.");
            const currentTime = videoElement.currentTime;
            const activeIndex = subtitleCues.findIndex(cue => currentTime >= cue.start);
            if (activeIndex !== -1) {
                const batchIndex = Math.floor(activeIndex / AppConfig.batchSize) * AppConfig.batchSize;
                for (let k = 1; k <= 4; k++) {
                    const nextBatch = batchIndex + (k * AppConfig.batchSize);
                    if (nextBatch < subtitleCues.length) {
                        loadTranslationChunk(nextBatch);
                    }
                }
            }
        }, 5000);
    });

    videoElement.addEventListener('play', () => {
        if (pauseTimer) {
            clearTimeout(pauseTimer);
            pauseTimer = null;
        }
    });

    function updateTimeline() {
        if (subtitleCues.length > 0) {
            const currentTime = videoElement.currentTime;
            const activeIndex = subtitleCues.findIndex(
                cue => currentTime >= cue.start && currentTime <= (cue.start + cue.duration)
            );

            if (activeIndex !== -1) {
                const activeCue = subtitleCues[activeIndex];
                const sourceText = activeCue.text;
                const batchIndex = Math.floor(activeIndex / AppConfig.batchSize) * AppConfig.batchSize;

                hasTranslationStored(sourceText).then(async (hasTrans) => {
                    if (!hasTrans) {
                        if (!videoElement.paused && !isWaitingForTranslation) {
                            isWaitingForTranslation = true;
                            videoElement.pause();
                            renderDualSubtitles("Translating batch...", sourceText);
                        }

                        if (activeBatchIndex !== batchIndex) {
                            loadTranslationChunk(batchIndex);
                        }
                    } else {
                        if (isWaitingForTranslation) {
                            isWaitingForTranslation = false;
                            const targetText = await getStoredTranslation(sourceText);
                            renderDualSubtitles(targetText, sourceText);
                            forcePlayVideo(videoElement);
                        }

                        if (sourceText !== previousCueText) {
                            previousCueText = sourceText;
                            const targetText = await getStoredTranslation(sourceText);
                            renderDualSubtitles(targetText, sourceText);
                        }

                        const relativePos = activeIndex % AppConfig.batchSize;
                        if (relativePos >= AppConfig.batchSize - AppConfig.prefetchOffset) {
                            const nextBatchStart = batchIndex + AppConfig.batchSize;
                            if (nextBatchStart < subtitleCues.length) {
                                loadTranslationChunk(nextBatchStart);
                            }
                        }
                    }
                });
            } else {
                if (previousCueText !== "") {
                    renderDualSubtitles("", "");
                    previousCueText = "";
                }
            }
        }
        requestAnimationFrame(updateTimeline);
    }

    requestAnimationFrame(updateTimeline);
}