// extension/background.js
console.log("[2Subs2Learn Background] Service worker started and listening for network traffic.");

// Listen to all network requests made by tabs
chrome.webRequest.onCompleted.addListener(
    async (details) => {
        // Check if the request URL matches YouTube's timedtext API
        if (details.url.includes('/api/timedtext')) {
            console.log("[2Subs2Learn Background INTERCEPT] Captured timedtext request URL:", details.url);

            try {
                // Fetch the response text using the exact cookies/session of the browser tab
                const response = await fetch(details.url);
                const subtitleJson = await response.json();

                console.log("[2Subs2Learn Background INTERCEPT] Successfully intercepted raw subtitle JSON payload:", subtitleJson);

                // Optional: Send this captured data to your active content script
                chrome.tabs.sendMessage(details.tabId, {
                    type: "INTERCEPTED_SUBTITLES",
                    payload: subtitleJson
                });

            } catch (error) {
                console.error("[2Subs2Learn Background INTERCEPT] Failed to read intercepted stream:", error);
            }
        }
    },
    { urls: ["https://www.youtube.com/api/timedtext*"] }
);