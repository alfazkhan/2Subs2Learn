// extension/content.js
console.log("[2Subs2Learn Content] Batch-optimized timestamp engine active.");

let subtitleCues = [];
let translationCache = new Map();
let subBox = null;
let isTranslatingBatch = false;

const BATCH_SIZE = 10;
const PREFETCH_TRIGGER_OFFSET = 3;

function createSubtitleBox() {
    let box = document.getElementById('dual-subs-box');
    if (box) return box;

    box = document.createElement('div');
    box.id = 'dual-subs-box';
    box.innerHTML = `
        <div class="sub-line-german">Waiting for subtitles...</div>
        <div class="sub-line-english">Ready</div>
    `;

    const targetAnchor = document.querySelector('#above-the-fold') || document.querySelector('#primary');
    if (targetAnchor) {
        targetAnchor.insertBefore(box, targetAnchor.firstChild);
    } else {
        document.body.insertBefore(box, document.body.firstChild);
    }

    return box;
}

function renderSubtitles(germanText, englishText) {
    if (!subBox) subBox = createSubtitleBox();
    subBox.innerHTML = `
        <div class="sub-line-german">${germanText || ''}</div>
        <div class="sub-line-english">${englishText || ''}</div>
    `;
}

// Parse YouTube URL timestamp parameter (e.g., &t=2482s or &t=41m22s)
function getInitialTimestampFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    const tParam = urlParams.get('t');
    if (!tParam) return 0;

    if (tParam.endsWith('s')) {
        return parseInt(tParam, 10) || 0;
    }
    
    // Handle minutes/seconds format if present (e.g., 41m22s)
    let totalSeconds = 0;
    const mMatch = tParam.match(/(\d+)m/);
    const sMatch = tParam.match(/(\d+)s/);
    if (mMatch) totalSeconds += parseInt(mMatch[1], 10) * 60;
    if (sMatch) totalSeconds += parseInt(sMatch[1], 10);
    
    if (totalSeconds > 0) return totalSeconds;
    return parseInt(tParam, 10) || 0;
}

// Send an array of texts in a single batch request
async function translateBatchArray(textsArray) {
    const uncachedTexts = textsArray.filter(t => !translationCache.has(t));
    if (uncachedTexts.length === 0) return;

    try {
        const response = await fetch('http://localhost:3000/translate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ texts: uncachedTexts }),
        });
        
        if (!response.ok) return;
        
        const data = await response.json();
        if (data.translations) {
            for (let i = 0; i < uncachedTexts.length; i++) {
                translationCache.set(uncachedTexts[i], data.translations[i]);
            }
        }
    } catch (error) {
        console.error("[2Subs2Learn Server] Batch translation failed:", error);
    }
}

async function fetchAndTranslateChunk(startIndex) {
    if (isTranslatingBatch) return;
    isTranslatingBatch = true;

    const endIndex = Math.min(startIndex + BATCH_SIZE, subtitleCues.length);
    const textsToTranslate = [];

    for (let i = startIndex; i < endIndex; i++) {
        if (subtitleCues[i] && !translationCache.has(subtitleCues[i].text)) {
            textsToTranslate.push(subtitleCues[i].text);
        }
    }

    if (textsToTranslate.length > 0) {
        console.log(`[2Subs2Learn Batch] Sending array of ${textsToTranslate.length} texts to server.`);
        await translateBatchArray(textsToTranslate);
    }

    isTranslatingBatch = false;
}

function processTimedTextPayload(payload) {
    if (!payload || !payload.events) return;

    subtitleCues = payload.events
        .filter(event => event.segs)
        .map(event => ({
            start: event.tStartMs / 1000,
            duration: (event.dDurationMs || 2000) / 1000,
            text: event.segs.map(seg => seg.utf8 || '').join('').trim()
        }))
        .filter(cue => cue.text.length > 0);

    console.log(`[2Subs2Learn Parser] Loaded ${subtitleCues.length} total cues.`);
    
    // Check URL timestamp immediately on payload load
    const initialSeconds = getInitialTimestampFromUrl();
    const video = document.querySelector('video.html5-main-video') || document.querySelector('video');
    const startSecs = initialSeconds > 0 ? initialSeconds : (video ? video.currentTime : 0);

    syncBatchToVideoTime(startSecs);
}

function syncBatchToVideoTime(currentTime) {
    if (subtitleCues.length === 0) return;

    let currentIndex = subtitleCues.findIndex(
        cue => currentTime >= cue.start && currentTime <= (cue.start + cue.duration)
    );

    if (currentIndex === -1) {
        // Find closest cue if exact match isn't found
        currentIndex = subtitleCues.findIndex(cue => cue.start >= currentTime);
    }

    const targetIndex = currentIndex !== -1 ? currentIndex : 0;
    console.log(`[2Subs2Learn Timestamp] Aligning initial batch to index ${targetIndex} (Time: ${currentTime}s)`);
    fetchAndTranslateChunk(targetIndex);
}

function startSyncEngine() {
    const video = document.querySelector('video.html5-main-video') || document.querySelector('video');
    
    if (!video) {
        setTimeout(startSyncEngine, 1000);
        return;
    }

    subBox = createSubtitleBox();
    console.log("[2Subs2Learn Engine] Video detected. Starting sync loop.");

    let lastActiveText = "";

    // Handle user seeking/jumping timeline manually
    video.addEventListener('seeked', () => {
        console.log(`[2Subs2Learn Seek] Jumped to ${video.currentTime.toFixed(1)}s. Re-syncing batch.`);
        syncBatchToVideoTime(video.currentTime);
    });

    function checkTimeline() {
        if (subtitleCues.length > 0 && !video.paused) {
            const currentTime = video.currentTime;
            
            const activeIndex = subtitleCues.findIndex(
                cue => currentTime >= cue.start && currentTime <= (cue.start + cue.duration)
            );

            if (activeIndex !== -1) {
                const activeCue = subtitleCues[activeIndex];
                const english = activeCue.text;

                if (english !== lastActiveText) {
                    lastActiveText = english;
                    
                    const german = translationCache.get(english) || "Translating...";
                    renderSubtitles(german, english);

                    if (!translationCache.has(english)) {
                        translateBatchArray([english]).then(() => {
                            if (lastActiveText === english) {
                                renderSubtitles(translationCache.get(english), english);
                            }
                        });
                    }
                }

                // Sliding window prefetch check
                const batchRelativePosition = activeIndex % BATCH_SIZE;
                if (batchRelativePosition >= BATCH_SIZE - PREFETCH_TRIGGER_OFFSET) {
                    const nextBatchStart = activeIndex + 1;
                    if (nextBatchStart < subtitleCues.length) {
                        fetchAndTranslateChunk(nextBatchStart);
                    }
                }

            } else {
                if (lastActiveText !== "") {
                    renderSubtitles("", "");
                    lastActiveText = "";
                }
            }
        }
        requestAnimationFrame(checkTimeline);
    }

    requestAnimationFrame(checkTimeline);
}

chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "INTERCEPTED_SUBTITLES") {
        processTimedTextPayload(message.payload);
    }
});

window.addEventListener('load', () => {
    setTimeout(startSyncEngine, 1500);
});