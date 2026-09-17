// extension/src/core/ui.js
import { AppConfig } from './config.js';

export function logEvent(event, details = "") {
    const timeStr = new Date().toLocaleTimeString();
    const text = `${event}: ${details}`;
    try {
        chrome.runtime.sendMessage({ type: "LOG_EVENT", text: text, time: timeStr });
    } catch (e) {}
}

export function createSubtitleBox() {
    let box = document.getElementById('dual-subs-box');
    if (box) return box;

    box = document.createElement('div');
    box.id = 'dual-subs-box';
    box.innerHTML = `
        <div class="sub-line-primary"></div>
        <div class="sub-line-secondary"></div>
    `;

    const playerWrapper = document.querySelector('.html5-video-player') || document.querySelector('#movie_player');
    if (playerWrapper) {
        if (getComputedStyle(playerWrapper).position === 'static') {
            playerWrapper.style.position = 'relative';
        }
        playerWrapper.appendChild(box);
    } else {
        document.body.appendChild(box);
    }
    return box;
}

export function renderDualSubtitles(targetText, sourceText) {
    const box = createSubtitleBox();
    if (!targetText && !sourceText) {
        box.classList.remove('visible');
        box.innerHTML = `<div class="sub-line-primary"></div><div class="sub-line-secondary"></div>`;
        return;
    }

    box.classList.add('visible');
    let primaryText = targetText;
    let secondaryText = sourceText;

    if (AppConfig.primaryDisplay === 'source') {
        primaryText = sourceText;
        secondaryText = targetText;
    }

    box.innerHTML = `
        <div class="sub-line-primary">${primaryText || ''}</div>
        <div class="sub-line-secondary">${secondaryText || ''}</div>
    `;
}

// 1. Chunked Progress Bar injected right above YouTube bottom control bar
export function renderChunkedProgressBar(totalCues, getTranslationStatusFn) {
    let barContainer = document.getElementById('2subs-chunked-progress');
    if (!barContainer) {
        const bottomControls = document.querySelector('.ytp-chrome-bottom');
        if (!bottomControls) return;
        
        barContainer = document.createElement('div');
        barContainer.id = '2subs-chunked-progress';
        barContainer.innerHTML = `
            <div class="chunks-track" id="chunks-track"></div>
        `;
        bottomControls.insertAdjacentElement('beforebegin', barContainer);
    }

    const track = document.getElementById('chunks-track');
    if (!track || totalCues === 0) return;

    const batchSize = AppConfig.batchSize;
    const totalBatches = Math.ceil(totalCues / batchSize);
    let translatedCount = 0;

    let html = '';
    for (let i = 0; i < totalBatches; i++) {
        const start = i * batchSize;
        const end = Math.min(start + batchSize, totalCues);
        const isTranslated = getTranslationStatusFn(start, end);
        if (isTranslated) translatedCount++;

        html += `<div class="chunk-segment ${isTranslated ? 'translated' : ''}"></div>`;
    }

    track.innerHTML = html;
    const percentage = Math.round((translatedCount / totalBatches) * 100) || 0;

    try {
        chrome.runtime.sendMessage({ type: "UPDATE_PROGRESS", percentage });
    } catch (e) {}
}

// 3. Fully visible embedded YouTube page toolbar (VidIQ style)
export function mountEmbeddedToolbar(onSettingsChange) {
    if (!AppConfig.embeddedToolbar) {
        const existing = document.getElementById('2subs-embedded-toolbar');
        if (existing) existing.remove();
        return;
    }

    let toolbar = document.getElementById('2subs-embedded-toolbar');
    if (toolbar) return;

    const secondaryTarget = document.querySelector('#secondary');
    if (!secondaryTarget) return;

    toolbar = document.createElement('div');
    toolbar.id = '2subs-embedded-toolbar';
    toolbar.innerHTML = `
        <div class="embedded-header">
            <span>2Subs2Learn Control Panel</span>
            <span id="embedded-pct" style="color: #EE964B; font-weight: bold;">0% Ready</span>
        </div>
        <div class="embedded-row">
            <label>Source:</label>
            <select id="emb-source">
                <option value="en">English</option>
                <option value="de">German</option>
            </select>
        </div>
        <div class="embedded-row">
            <label>Target:</label>
            <select id="emb-target">
                <option value="de">German</option>
                <option value="en">English</option>
            </select>
            <button id="emb-swap" title="Swap">⇄</button>
        </div>
        <div class="embedded-row">
            <label>Primary Display:</label>
            <button class="emb-btn active" data-val="target">Target</button>
            <button class="emb-btn" data-val="source">Source</button>
        </div>
    `;
    secondaryTarget.insertBefore(toolbar, secondaryTarget.firstChild);

    document.getElementById('emb-source').value = AppConfig.sourceLanguage;
    document.getElementById('emb-target').value = AppConfig.targetLanguage;

    document.getElementById('emb-swap').addEventListener('click', () => {
        const s = document.getElementById('emb-source');
        const t = document.getElementById('emb-target');
        const tmp = s.value; s.value = t.value; t.value = tmp;
        onSettingsChange({ sourceLang: s.value, targetLang: t.value });
    });

    document.getElementById('emb-source').addEventListener('change', (e) => {
        onSettingsChange({ sourceLang: e.target.value });
    });
    document.getElementById('emb-target').addEventListener('change', (e) => {
        onSettingsChange({ targetLang: e.target.value });
    });

    toolbar.querySelectorAll('.emb-btn').forEach(btn => {
        if (btn.dataset.val === AppConfig.primaryDisplay) btn.classList.add('active');
        btn.addEventListener('click', () => {
            toolbar.querySelectorAll('.emb-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            onSettingsChange({ primaryDisplay: btn.dataset.val });
        });
    });
}