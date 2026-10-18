// entrypoints/zd.content/index.ts
import { defineContentScript, storage } from '#imports';
import { handleSubtitleDisplayAndSync } from './SubtitleDisplay';

interface SubtitleCue {
    start: number;
    duration: number;
    text: string;
}

export default defineContentScript({
    matches: ['*://*.zdf.de/*'],

    main() {
        console.log("[2Subs2Learn ZDF Content] Content script initialized.");

        let lastProcessedUrl = "";
        let currentVideoId = "";

        /* Flow 1: Extract Unique Video ID from URL Path */
        const extractVideoId = (): string => {
            const path = window.location.pathname;
            const segments = path.split('/').filter(Boolean);
            if (segments.length >= 2) {
                return `${segments[segments.length - 2]}/${segments[segments.length - 1].replace('.html', '')}`;
            }
            return path.replace('.html', '');
        };

        /* Flow 2: Auto-Pause Video Element on Load & Update Storage */
        const autoPauseVideo = async () => {
            await storage.setItem('local:zdfvideoPlaying', false);
            const attemptPause = () => {
                const videoElement = document.querySelector('video') as HTMLVideoElement;
                if (videoElement) {
                    if (!videoElement.paused) {
                        videoElement.pause();
                        console.log("[2Subs2Learn ZDF] Video auto-paused.");
                    }
                    return true;
                }
                return false;
            };

            if (!attemptPause()) {
                const interval = setInterval(() => {
                    if (attemptPause()) {
                        clearInterval(interval);
                    }
                }, 300);
            }
        };

        /* Flow 2: Auto-Play Video Element & Update Storage */
        const autoPlayVideo = async () => {
            await storage.setItem('local:zdfvideoPlaying', true);
            const attemptPlay = () => {
                const videoElement = document.querySelector('video') as HTMLVideoElement;
                if (videoElement) {
                    if (videoElement.paused) {
                        videoElement.play();
                        console.log("[2Subs2Learn ZDF] Video played");
                    }
                    return true;
                }
                return false;
            };

            if (!attemptPlay()) {
                const interval = setInterval(() => {
                    if (attemptPlay()) {
                        clearInterval(interval);
                    }
                }, 300);
            }
        };

        /* Flow 3: Parse TTML Time Strings to Float Seconds */
        const parseTimeToSeconds = (timeStr: string): number => {
            if (!timeStr) return 0;
            const parts = timeStr.split(':');
            if (parts.length < 3) return 0;
            return (parseFloat(parts[0]) || 0) * 3600 + (parseFloat(parts[1]) || 0) * 60 + (parseFloat(parts[2]) || 0);
        };

        /* Flow 4: Parse ZDF XML Payload into Structured Subtitle Cues Array */
        const parseZdfXmlPayload = (xmlText: string): SubtitleCue[] => {
            if (!xmlText) return [];
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlText, "text/xml");
            const pElements = xmlDoc.getElementsByTagName("tt:p");
            const cues: SubtitleCue[] = [];

            for (let i = 0; i < pElements.length; i++) {
                const p = pElements[i];
                const begin = p.getAttribute("begin");
                const end = p.getAttribute("end");

                if (begin && end) {
                    const startSec = parseTimeToSeconds(begin);
                    const endSec = parseTimeToSeconds(end);
                    const spans = p.getElementsByTagName("tt:span");
                    let text = "";
                    for (let j = 0; j < spans.length; j++) {
                        text += spans[j].textContent + " ";
                    }
                    text = text.trim();

                    if (text.length > 0) {
                        cues.push({ start: startSec, duration: endSec - startSec, text });
                    }
                }
            }
            return cues;
        };

        /* Flow 5: Automate Player UI Clicks to Select German Subtitles */
        const autoEnableZdfSubtitles = () => {
            const clickInterval = setInterval(() => {
                const settingsButton = document.querySelector('button[aria-label="Spracheinstellungen anzeigen"]') as HTMLButtonElement;
                if (settingsButton) {
                    settingsButton.click();
                    setTimeout(() => {
                        const labels = Array.from(document.querySelectorAll('label'));
                        const germanLabel = labels.find(lbl => lbl.textContent?.includes('Deutsch')) as HTMLElement;
                        if (germanLabel) {
                            germanLabel.click();
                        } else {
                            const spanText = Array.from(document.querySelectorAll('span')).find(s => s.textContent?.trim() === 'Deutsch');
                            if (spanText) spanText.click();
                        }
                        setTimeout(() => {
                            const closeButton = document.querySelector('button[aria-label="Spracheinstellungen schließen"]') as HTMLButtonElement;
                            if (closeButton) closeButton.click();
                        }, 300);
                    }, 300);
                    clearInterval(clickInterval);
                }
            }, 1000);
            setTimeout(() => clearInterval(clickInterval), 10000);
        };

        /* Flow 6: Fetch XML Subtitles, Parse, Trigger Background Translation, and Init Overlay Display */
        const fetchAndProcessSubtitleUrl = async (url: string) => {
            try {
                console.log("[2Subs2Learn ZDF] Fetching subtitle asset URL:", url);
                const response = await fetch(url);
                const xmlText = await response.text();

                const subtitleCues = parseZdfXmlPayload(xmlText);
                currentVideoId = extractVideoId();

                autoPauseVideo();

                // Dispatch full subtitle cue array and video ID to background script
                browser.runtime.sendMessage({
                    type: 'START_BACKGROUND_TRANSLATION',
                    payload: { videoId: currentVideoId, cues: subtitleCues }
                }).catch(() => { });

                // Initialize custom overlay and chunk sync engine
                handleSubtitleDisplayAndSync(subtitleCues, currentVideoId, 'video');

            } catch (err) {
                console.error("[2Subs2Learn ZDF] Failed to fetch XML:", err);
            }
        };

        // Attach native video event listeners to keep storage state in sync with actual video behavior
        const bindVideoListeners = () => {
            const videoElement = document.querySelector('video') as HTMLVideoElement;
            if (videoElement) {
                videoElement.onplay = () => storage.setItem('local:zdfvideoPlaying', true);
                videoElement.onpause = () => storage.setItem('local:zdfvideoPlaying', false);
            }
        };

        // Performance Observer for subtitle files
        const observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
                const url = entry.name;
                if (url && url.includes('utstreaming.zdf.de/mtt/') && url.endsWith('.xml')) {
                    if (url !== lastProcessedUrl) {
                        lastProcessedUrl = url;
                        fetchAndProcessSubtitleUrl(url);
                        bindVideoListeners();
                    }
                }
            }
        });

        observer.observe({ entryTypes: ['resource'] });

        performance.getEntriesByType('resource').forEach((entry: any) => {
            const url = entry.name;
            if (url && url.includes('utstreaming.zdf.de/mtt/') && url.endsWith('.xml')) {
                if (url !== lastProcessedUrl) {
                    lastProcessedUrl = url;
                    fetchAndProcessSubtitleUrl(url);
                    bindVideoListeners();
                }
            }
        });

        /* Flow 8: Handle SPA Navigation via History and Popstate Hooks */
        const handleSpaNavigation = (callback: () => void) => {
            let lastUrl = window.location.href;

            window.addEventListener('popstate', () => {
                if (window.location.href !== lastUrl) {
                    lastUrl = window.location.href;
                    callback();
                }
            });

            const originalPushState = history.pushState;
            history.pushState = function (...args) {
                originalPushState.apply(this, args);
                if (window.location.href !== lastUrl) {
                    lastUrl = window.location.href;
                    callback();
                }
            };

            const originalReplaceState = history.replaceState;
            history.replaceState = function (...args) {
                originalReplaceState.apply(this, args);
                if (window.location.href !== lastUrl) {
                    lastUrl = window.location.href;
                    callback();
                }
            };
        };

        handleSpaNavigation(() => {
            console.log("[2Subs2Learn ZDF] SPA navigation detected. Resetting for new video...");
            lastProcessedUrl = "";
            autoPauseVideo();
            autoEnableZdfSubtitles();
        });

        /* Flow 9: Initial Execution Triggers on Script Mount */
        autoPauseVideo();
        autoEnableZdfSubtitles();
        setTimeout(bindVideoListeners, 1500);

        // Listen for playback messages coming from the background service worker
        browser.runtime.onMessage.addListener((message) => {
            if (message.type === 'PLAY_VIDEO_ZDF') {
                console.log("EVENT: 'PLAY_VIDEO_ZDF'");
                autoPlayVideo();
            }

            if (message.type === 'PAUSE_VIDEO_ZDF') {
                console.log("EVENT: 'PAUSE_VIDEO_ZDF'");
                autoPauseVideo();
            }
        });
    }
});