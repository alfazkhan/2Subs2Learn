// extension/popup/popup.js
document.addEventListener('DOMContentLoaded', () => {
    const logContainer = document.getElementById('log-container');
    const pinBtn = document.getElementById('pin-btn');
    const sourceSelect = document.getElementById('source-lang');
    const targetSelect = document.getElementById('target-lang');
    const swapBtn = document.getElementById('swap-btn');
    const displayButtons = document.querySelectorAll('.display-btn');
    const batchInput = document.getElementById('batch-size');
    const offsetInput = document.getElementById('prefetch-offset');

    let currentPrimaryDisplay = 'target';

    // Load saved settings
    chrome.storage.local.get(['sourceLang', 'targetLang', 'primaryDisplay', 'batchSize', 'prefetchOffset'], (data) => {
        if (data.sourceLang) sourceSelect.value = data.sourceLang;
        if (data.targetLang) targetSelect.value = data.targetLang;
        if (data.batchSize) batchInput.value = data.batchSize;
        if (data.prefetchOffset) offsetInput.value = data.prefetchOffset;
        
        if (data.primaryDisplay) {
            currentPrimaryDisplay = data.primaryDisplay;
            displayButtons.forEach(btn => {
                if (btn.dataset.value === currentPrimaryDisplay) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
        }
    });

    function broadcastSettings() {
        const sourceLang = sourceSelect.value;
        const targetLang = targetSelect.value;
        const batchSize = batchInput.value;
        const prefetchOffset = offsetInput.value;

        chrome.storage.local.set({ 
            sourceLang, 
            targetLang, 
            primaryDisplay: currentPrimaryDisplay,
            batchSize,
            prefetchOffset
        });

        // Safely send message to active tab if content script is present
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]?.id) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    type: "UPDATE_SETTINGS",
                    sourceLang,
                    targetLang,
                    primaryDisplay: currentPrimaryDisplay,
                    batchSize,
                    prefetchOffset
                }).catch(() => {
                    // Ignore error if content script hasn't injected yet on non-youtube pages
                });
            }
        });
    }

    // Swap Languages button handler
    swapBtn.addEventListener('click', () => {
        const temp = sourceSelect.value;
        sourceSelect.value = targetSelect.value;
        targetSelect.value = temp;
        broadcastSettings();
    });

    // Display mode buttons handler
    displayButtons.forEach(button => {
        button.addEventListener('click', () => {
            displayButtons.forEach(b => b.classList.remove('active'));
            button.classList.add('active');
            currentPrimaryDisplay = button.dataset.value;
            broadcastSettings();
        });
    });

    sourceSelect.addEventListener('change', broadcastSettings);
    targetSelect.addEventListener('change', broadcastSettings);
    batchInput.addEventListener('change', broadcastSettings);
    offsetInput.addEventListener('change', broadcastSettings);

    pinBtn.addEventListener('click', () => {
        chrome.tabs.create({ url: chrome.runtime.getURL('popup/popup.html') });
    });

    chrome.runtime.onMessage.addListener((message) => {
        if (message.type === "LOG_EVENT") {
            const div = document.createElement('div');
            div.className = 'log-entry';
            div.textContent = `[${message.time}] ${message.text}`;
            logContainer.appendChild(div);
            logContainer.scrollTop = logContainer.scrollHeight;
        }
    });
});