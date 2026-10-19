// entrypoints/zd.content/index.ts
import { defineContentScript, storage } from '#imports';
import {
    handleSubtitleDisplayAndSync,
    cleanupSubtitleDisplay,
    showInitialLoadingOverlay
} from './SubtitleDisplay';

interface SubtitleCue {
    start: number;
    duration: number;
    text: string;
}

export default defineContentScript({
    matches: ['*://www.zdf.de/*'],

    main() {
        console.log("[2Subs2Learn ZDF Content] Content script initialized.");

        let lastProcessedUrl = "";
        let currentVideoId = "";
        let subtitleToggleInterval: ReturnType<typeof setInterval> | null = null;
        let isExtensionPausing = false;

        // Only operate on URLs starting with www.zdf.de/play
        const isZdfPlayRoute = (): boolean => {
            return window.location.hostname === 'www.zdf.de' && window.location.pathname.startsWith('/play');
        };

        async function setPlatform() {
            if (isZdfPlayRoute()) {
                await storage.setItem(`local:currentPlatform`, "ZDF");
            }
        }
        setPlatform();

        const extractVideoId = (): string => {
            const path = window.location.pathname;
            const segments = path.split('/').filter(Boolean);
            if (segments.length >= 2) {
                return `${segments[segments.length - 2]}/${segments[segments.length - 1].replace('.html', '')}`;
            }
            return path.replace('.html', '');
        };

        const autoPauseVideo = async () => {
            if (!isZdfPlayRoute()) return;
            isExtensionPausing = true;
            await storage.setItem('local:zdfvideoPlaying', false);

            const attemptPause = () => {
                const videoElement = document.querySelector('video') as HTMLVideoElement;
                if (videoElement) {
                    if (!videoElement.paused) {
                        isExtensionPausing = true;
                        videoElement.pause();
                        console.log("[2Subs2Learn ZDF] Video auto-paused.");
                    }
                    showInitialLoadingOverlay('Fetching subtitles...', 'video');
                    setTimeout(() => { isExtensionPausing = false; }, 150);
                    return true;
                }
                return false;
            };

            if (!attemptPause()) {
                const interval = setInterval(() => {
                    if (!isZdfPlayRoute() || attemptPause()) {
                        clearInterval(interval);
                    }
                }, 200);
                setTimeout(() => clearInterval(interval), 10000);
            }
        };

        const autoPlayVideo = async () => {
            if (!isZdfPlayRoute()) return;
            isExtensionPausing = false;
            await storage.setItem('local:zdfvideoPlaying', true);

            const attemptPlay = () => {
                const videoElement = document.querySelector('video') as HTMLVideoElement;
                if (videoElement) {
                    if (videoElement.paused) {
                        videoElement.play().catch(() => {});
                        console.log("[2Subs2Learn ZDF] Video played");
                    }
                    return true;
                }
                return false;
            };

            if (!attemptPlay()) {
                const interval = setInterval(() => {
                    if (!isZdfPlayRoute() || attemptPlay()) {
                        clearInterval(interval);
                    }
                }, 200);
                setTimeout(() => clearInterval(interval), 5000);
            }
        };

        const parseTimeToSeconds = (timeStr: string): number => {
            if (!timeStr) return 0;
            const parts = timeStr.split(':');
            if (parts.length < 3) return 0;
            return (parseFloat(parts[0]) || 0) * 3600 + (parseFloat(parts[1]) || 0) * 60 + (parseFloat(parts[2]) || 0);
        };

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
                    const innerHtml = p.innerHTML;
                    const cleanedText = innerHtml
                        .replace(/<tt:br\s*\/?>/gi, '\n')
                        .replace(/<br\s*\/?>/gi, '\n')
                        .replace(/<\/?[^>]+(>|$)/g, "")
                        .replace(/\s+/g, ' ')
                        .trim();

                    const finalMultiLineText = cleanedText
                        .split('\n')
                        .map(line => line.trim())
                        .filter(Boolean)
                        .join('\n');

                    if (finalMultiLineText.length > 0) {
                        cues.push({ start: startSec, duration: endSec - startSec, text: finalMultiLineText });
                    }
                }
            }
            return cues;
        };

        // Persistent subtitle enabler: keeps trying until XML is captured
        const autoEnableZdfSubtitles = () => {
            if (subtitleToggleInterval) {
                clearInterval(subtitleToggleInterval);
                subtitleToggleInterval = null;
            }
            if (!isZdfPlayRoute()) return;

            let attemptCount = 0;

            subtitleToggleInterval = setInterval(() => {
                if (!isZdfPlayRoute() || lastProcessedUrl !== "") {
                    if (subtitleToggleInterval) {
                        clearInterval(subtitleToggleInterval);
                        subtitleToggleInterval = null;
                    }
                    return;
                }

                // Check performance entries in case XML already loaded
                const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
                for (let i = entries.length - 1; i >= 0; i--) {
                    const url = entries[i].name;
                    if (url && url.includes('utstreaming.zdf.de/mtt/') && url.endsWith('.xml')) {
                        checkResourceEntry(url);
                        if (lastProcessedUrl !== "") return;
                    }
                }

                const settingsButton = document.querySelector('button[aria-label="Spracheinstellungen anzeigen"]') as HTMLButtonElement;
                if (settingsButton) {
                    attemptCount++;
                    settingsButton.click();

                    setTimeout(() => {
                        const labels = Array.from(document.querySelectorAll('label'));
                        const spans = Array.from(document.querySelectorAll('span'));

                        // If first click didn't trigger XML because Deutsch was already selected, toggle Off then Deutsch
                        if (attemptCount > 1 && lastProcessedUrl === "") {
                            const offOption = labels.find(lbl => lbl.textContent?.includes('Aus') || lbl.textContent?.includes('Ohne')) ||
                                              spans.find(s => s.textContent?.trim() === 'Aus' || s.textContent?.trim() === 'Ohne');
                            if (offOption) (offOption as HTMLElement).click();
                        }

                        setTimeout(() => {
                            const germanLabel = labels.find(lbl => lbl.textContent?.includes('Deutsch')) as HTMLElement;
                            if (germanLabel) {
                                germanLabel.click();
                            } else {
                                const spanText = spans.find(s => s.textContent?.trim() === 'Deutsch') as HTMLElement;
                                if (spanText) spanText.click();
                            }

                            setTimeout(() => {
                                const closeButton = document.querySelector('button[aria-label="Spracheinstellungen schließen"]') as HTMLButtonElement;
                                if (closeButton) closeButton.click();
                            }, 250);
                        }, 150);
                    }, 300);
                }
            }, 1500);

            setTimeout(() => {
                if (subtitleToggleInterval) {
                    clearInterval(subtitleToggleInterval);
                    subtitleToggleInterval = null;
                }
            }, 20000);
        };

        const fetchAndProcessSubtitleUrl = async (url: string) => {
            if (!isZdfPlayRoute()) return;
            if (url === lastProcessedUrl) return;
            lastProcessedUrl = url;

            if (subtitleToggleInterval) {
                clearInterval(subtitleToggleInterval);
                subtitleToggleInterval = null;
            }

            try {
                console.log("[2Subs2Learn ZDF] Fetching subtitle asset URL:", url);
                showInitialLoadingOverlay('Translating initial subtitles...', 'video');

                const response = await fetch(url);
                const xmlText = await response.text();

                const subtitleCues = parseZdfXmlPayload(xmlText);
                currentVideoId = extractVideoId();

                await autoPauseVideo();

                const videoElement = document.querySelector('video') as HTMLVideoElement;
                const currentTime = videoElement ? videoElement.currentTime : 0;

                await handleSubtitleDisplayAndSync(
                    subtitleCues,
                    currentVideoId,
                    'video',
                    {
                        autoPlayVideo,
                        autoPauseVideo,
                        isExtensionPausing: () => isExtensionPausing
                    }
                );

                browser.runtime.sendMessage({
                    type: 'START_BACKGROUND_TRANSLATION',
                    payload: {
                        videoId: currentVideoId,
                        cues: subtitleCues,
                        currentTime
                    }
                }).catch(() => {});

            } catch (err) {
                console.error("[2Subs2Learn ZDF] Failed to fetch XML:", err);
            }
        };

        const checkResourceEntry = (url: string) => {
            if (!isZdfPlayRoute()) return;
            if (url && url.includes('utstreaming.zdf.de/mtt/') && url.endsWith('.xml')) {
                if (url !== lastProcessedUrl) {
                    fetchAndProcessSubtitleUrl(url);
                }
            }
        };

        const observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
                checkResourceEntry(entry.name);
            }
        });

        observer.observe({ entryTypes: ['resource'] });

        const startForCurrentPlayPage = () => {
            if (!isZdfPlayRoute()) {
                cleanupSubtitleDisplay();
                return;
            }
            currentVideoId = extractVideoId();
            setPlatform();
            performance.clearResourceTimings();
            autoPauseVideo();
            autoEnableZdfSubtitles();
        };

        // Only trigger SPA reset when the actual videoId on /play changes
        const setupSpaNavigationDetector = () => {
            let lastTrackedVideoId = isZdfPlayRoute() ? extractVideoId() : "";
            let wasOnPlayRoute = isZdfPlayRoute();

            const checkRouteChange = () => {
                const nowOnPlayRoute = isZdfPlayRoute();
                const newVideoId = nowOnPlayRoute ? extractVideoId() : "";

                if (!nowOnPlayRoute && wasOnPlayRoute) {
                    wasOnPlayRoute = false;
                    lastTrackedVideoId = "";
                    lastProcessedUrl = "";
                    cleanupSubtitleDisplay();
                    browser.runtime.sendMessage({ type: 'RESET_VIDEO_STATE' }).catch(() => {});
                    return;
                }

                if (nowOnPlayRoute && newVideoId !== lastTrackedVideoId) {
                    wasOnPlayRoute = true;
                    lastTrackedVideoId = newVideoId;
                    console.log("[2Subs2Learn ZDF] SPA navigation detected. Resetting for new video...");
                    lastProcessedUrl = "";
                    cleanupSubtitleDisplay();
                    performance.clearResourceTimings();
                    browser.runtime.sendMessage({ type: 'RESET_VIDEO_STATE' }).catch(() => {});
                    autoPauseVideo();
                    autoEnableZdfSubtitles();
                }
            };

            window.addEventListener('popstate', checkRouteChange);
            setInterval(checkRouteChange, 500);
        };

        setupSpaNavigationDetector();

        if (isZdfPlayRoute()) {
            performance.getEntriesByType('resource').forEach((entry: any) => {
                checkResourceEntry(entry.name);
            });
            startForCurrentPlayPage();
        }

        browser.runtime.onMessage.addListener((message) => {
            if (!isZdfPlayRoute()) return;
            if (message.type === 'PLAY_VIDEO_ZDF') {
                console.log("Video Play Event");
                autoPlayVideo();
            }
            if (message.type === 'PAUSE_VIDEO_ZDF') {
                console.log("Video Pause Event");
                autoPauseVideo();
            }
        });
    }
});