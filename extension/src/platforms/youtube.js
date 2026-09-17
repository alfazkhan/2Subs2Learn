// extension/src/platforms/youtube.js
import { AppConfig } from '../core/config.js';
import { logEvent } from '../core/ui.js';
import { translateTextsBatch, getCachedTranslation, hasTranslation, clearTranslationCache } from '../core/translator.js';
import { renderDualSubtitles } from '../core/ui.js';

let subtitleCues = [];
let isTranslatingBatch = false;
let activeBatchIndex = -1;
let lastVideoId = "";

export function enablePlatformCaptions() {
    const ccButton = document.querySelector('.ytp-subtitles-button');
    if (ccButton && ccButton.getAttribute('aria-pressed') === 'false') {
        ccButton.click();
        logEvent("Platform Adapter", "Forced CC on to capture subtitle payload.");
    }
}

export function extractVideoTimestamp() {
    const urlParams = new URLSearchParams(window.location.search);
    const tParam = urlParams.get('t');
    if (!tParam) return 0;

    if (tParam.endsWith('s')) {
        return parseInt(tParam, 10) || 0;
    }
    
    let totalSeconds = 0;
    const mMatch = tParam.match(/(\d+)m/);
    const sMatch = tParam.match(/(\d+)s/);
    if (mMatch) totalSeconds += parseInt(mMatch[1], 10) * 60;
    if (sMatch) totalSeconds += parseInt(sMatch[1], 10);
    
    return totalSeconds > 0 ? totalSeconds : (parseInt(tParam, 10) || 0);
}

export async function loadTranslationChunk(startIndex) {
    if (isTranslatingBatch && activeBatchIndex === startIndex) return;
    isTranslatingBatch = true;
    activeBatchIndex = startIndex;

    const endIndex = Math.min(startIndex + AppConfig.batchSize, subtitleCues.length);
    const batchTexts = [];

    for (let i = startIndex; i < endIndex; i++) {
        if (subtitleCues[i] && !hasTranslation(subtitleCues[i].text)) {
            batchTexts.push(subtitleCues[i].text);
        }
    }

    if (batchTexts.length > 0) {
        await translateTextsBatch(batchTexts);
    }

    isTranslatingBatch = false;
    activeBatchIndex = -1;
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

    logEvent("Platform Adapter", `Parsed ${subtitleCues.length} cues (${AppConfig.sourceLanguage} -> ${AppConfig.targetLanguage}).`);
    
    const initialTime = extractVideoTimestamp();
    const videoElement = document.querySelector('video.html5-main-video') || document.querySelector('video');
    const targetSecs = initialTime > 0 ? initialTime : (videoElement ? videoElement.currentTime : 0);

    alignBatchToTime(targetSecs);
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
    let previousCueText = "";
    let isWaitingForTranslation = false;

    videoElement.addEventListener('seeked', () => {
        isWaitingForTranslation = false;
        alignBatchToTime(videoElement.currentTime);
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

                if (!hasTranslation(sourceText)) {
                    if (!videoElement.paused && !isWaitingForTranslation) {
                        isWaitingForTranslation = true;
                        videoElement.pause();
                        renderDualSubtitles("Translating batch...", sourceText);
                        logEvent("Sync Engine", "Paused video: waiting for translation batch.");
                    }

                    if (activeBatchIndex !== batchIndex) {
                        loadTranslationChunk(batchIndex);
                    }
                } else {
                    if (isWaitingForTranslation) {
                        isWaitingForTranslation = false;
                        renderDualSubtitles(getCachedTranslation(sourceText), sourceText);
                        videoElement.play();
                        logEvent("Sync Engine", "Translation ready. Resuming playback.");
                    }

                    if (sourceText !== previousCueText) {
                        previousCueText = sourceText;
                        const targetText = getCachedTranslation(sourceText);
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