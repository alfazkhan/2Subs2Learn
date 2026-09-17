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
        logEvent("UI Manager", "Mounted overlay box onto video player container.");
    } else {
        document.body.appendChild(box);
        logEvent("UI Manager", "Fallback mounted overlay box to body.");
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

    // Dynamic Display Mode: Switch top/bottom layout based on user settings
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