// extension/src/content.js
import { logEvent } from './core/ui.js';
import { AppConfig } from './core/config.js';
import { initPlatformSyncEngine, parseSubtitlePayload } from './platforms/youtube.js';

logEvent("Core Router", "Extension content script loaded.");

chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "INTERCEPTED_SUBTITLES") {
        parseSubtitlePayload(message.payload, message.url);
    } else if (message.type === "UPDATE_SETTINGS") {
        AppConfig.updateSettings(message);
        logEvent("Settings", "Configuration updated successfully.");
    }
});

window.addEventListener('load', () => {
    setTimeout(initPlatformSyncEngine, 1500);
});

let currentUrl = location.href;
new MutationObserver(() => {
    if (location.href !== currentUrl) {
        currentUrl = location.href;
        setTimeout(initPlatformSyncEngine, 2000);
    }
}).observe(document, { subtree: true, childList: true });