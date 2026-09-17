// extension/src/background/background.js
console.log("[2Subs2Learn Background] Service worker active.");

chrome.webRequest.onCompleted.addListener(
    async (details) => {
        if (details.tabId >= 0 && details.url.includes('/api/timedtext')) {
            try {
                const response = await fetch(details.url);
                const subtitleJson = await response.json();

                // Safely send message with a catch handler for inactive/unloaded tabs
                chrome.tabs.sendMessage(details.tabId, {
                    type: "INTERCEPTED_SUBTITLES",
                    payload: subtitleJson,
                    url: details.url
                }).catch(() => {
                    // Content script not yet active on this tab, safe to ignore
                });
            } catch (error) {
                console.error("[2Subs2Learn Background] Failed to fetch stream:", error);
            }
        }
    },
    { urls: ["https://www.youtube.com/api/timedtext*"] }
);