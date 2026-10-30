// entrypoints/zdf.content/index.ts
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
        let isExtensionPaused = false;
        void storage.getItem('local:isExtensionPaused').then((value) => {
            isExtensionPaused = Boolean(value);
        });
        console.log("ZDF isExtensionPaused", isExtensionPaused)
        let areCuesInitialized = false;
        let unwatchPlayStatus: (() => void) | null = null;

        // Verify if the current URL is strictly under www.zdf.de/play
        const isZdfPlayRoute = (): boolean => {
            return window.location.hostname === 'www.zdf.de' && window.location.pathname.startsWith('/play');
        };

        // Sync active platform identifier into both session and local storage
        const syncPlatformToZdf = async () => {
            if (isZdfPlayRoute()) {
                await Promise.all([
                    storage.setItem('local:currentPlatform', 'ZDF'),
                    storage.setItem('local:currentPlatform', 'ZDF'),
                ]);
            }
        };

        // Extract unique video identifier from the ZDF URL path
        const extractVideoId = (): string => {
            const path = window.location.pathname;
            const segments = path.split('/').filter(Boolean);
            if (segments.length >= 2) {
                const secondLast = segments[segments.length - 2] ?? '';
                const last = segments[segments.length - 1] ?? '';
                return `${secondLast}/${last.replace('.html', '')}`;
            }
            return path.replace('.html', '');
        };

        // Pause the HTML5 video element; only show initial loader if XML cues are not yet loaded
        const autoPauseVideo = async (showInitialLoader: boolean = false) => {
            if (!isZdfPlayRoute()) return;
            isExtensionPaused = true;

            const attemptPause = () => {
                const videoElement = document.querySelector('video') as HTMLVideoElement;
                if (videoElement) {
                    if (!videoElement.paused) {
                        isExtensionPaused = true;
                        videoElement.pause();
                        console.log("[2Subs2Learn ZDF] Video auto-paused.");
                    }
                    if (showInitialLoader && !areCuesInitialized) {
                        showInitialLoadingOverlay('Fetching subtitles...', 'video');
                    }
                    setTimeout(() => { isExtensionPaused = false; }, 150);
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

        // Play the HTML5 video element when translations for the current timestamp are ready
        const autoPlayVideo = async () => {
            if (!isZdfPlayRoute()) return;
            isExtensionPaused = false;
            // Condition 1: Video playback on ZDF ensures currentPlatform is updated to ZDF
            await syncPlatformToZdf();

            const attemptPlay = () => {
                const videoElement = document.querySelector('video') as HTMLVideoElement;
                if (videoElement) {
                    if (videoElement.paused) {
                        videoElement.play().catch(() => { });
                        console.log("Video played");
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

        // Condition 1: Listen to native video element play events on ZDF to update platform state immediately
        const bindVideoPlayListener = () => {
            const videoElement = document.querySelector('video') as HTMLVideoElement;
            if (videoElement) {
                videoElement.addEventListener('play', () => {
                    syncPlatformToZdf();
                });
            }
        };

        // Register watcher for ZDF play/pause state with clean unwatch lifecycle
        const bindPlayStatusWatcher = () => {
            if (unwatchPlayStatus) {
                unwatchPlayStatus();
                unwatchPlayStatus = null;
            }
            unwatchPlayStatus = storage.watch<boolean>('local:zdfvideoPlaying', (newValue) => {
                if (newValue === null || !isZdfPlayRoute()) return;
                if (newValue) {
                    console.log("Video Play Event");
                    autoPlayVideo();
                } else {
                    console.log("Video Pause Event");
                    autoPauseVideo(false);
                }
                console.log("Video is now ", newValue ? "Playing" : "Paused");
            });
        };

        // Convert HH:MM:SS.mmm timestamp string into float seconds
        const parseTimeToSeconds = (timeStr: string): number => {
            if (!timeStr) return 0;
            const parts = timeStr.split(':');
            if (parts.length < 3) return 0;
            const [hours = '0', minutes = '0', seconds = '0'] = parts;
            return (parseFloat(hours) || 0) * 3600 + (parseFloat(minutes) || 0) * 60 + (parseFloat(seconds) || 0);
        };

        // Parse ZDF EBU-TT-D XML subtitle file into SubtitleCues while strictly preserving <tt:br> line breaks
        const parseZdfXmlPayload = (xmlText: string): SubtitleCue[] => {
            if (!xmlText) return [];
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlText, "text/xml");
            const pElements = xmlDoc.getElementsByTagName("tt:p");
            const cues: SubtitleCue[] = [];

            for (let i = 0; i < pElements.length; i++) {
                const p = pElements.item(i);
                if (!p) continue;

                const begin = p.getAttribute("begin");
                const end = p.getAttribute("end");

                if (begin && end) {
                    const startSec = parseTimeToSeconds(begin);
                    const endSec = parseTimeToSeconds(end);
                    const innerHtml = p.innerHTML;

                    // Convert both <tt:br /> and <br /> to \n, then strip tags
                    const textWithBreaks = innerHtml
                        .replace(/<tt:br\s*\/?>/gi, '\n')
                        .replace(/<br\s*\/?>/gi, '\n')
                        .replace(/<\/?[^>]+(>|$)/g, "");

                    // Normalize horizontal spaces only without stripping newlines
                    const finalMultiLineText = textWithBreaks
                        .split('\n')
                        .map(line => line.replace(/[^\S\r\n]+/g, ' ').trim())
                        .filter(Boolean)
                        .join('\n');

                    if (finalMultiLineText.length > 0) {
                        cues.push({ start: startSec, duration: endSec - startSec, text: finalMultiLineText });
                    }
                }
            }
            return cues;
        };

        // Automatically open ZDF player language settings and select German subtitles until XML is captured
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

                const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
                for (let i = entries.length - 1; i >= 0; i--) {
                    const entry = entries[i];
                    if (!entry) continue;
                    const url = entry.name;
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

        // Download and parse the ZDF XML subtitle stream, initialize UI sync, and dispatch task via storage
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
                areCuesInitialized = true;

                await autoPauseVideo(false);

                const videoElement = document.querySelector('video') as HTMLVideoElement;
                const currentTime = videoElement ? videoElement.currentTime : 0;

                await handleSubtitleDisplayAndSync(
                    subtitleCues,
                    currentVideoId,
                    'video',
                    {
                        autoPlayVideo,
                        autoPauseVideo: () => autoPauseVideo(false),
                        isExtensionPaused: () => isExtensionPaused
                    }
                );

                bindVideoPlayListener();

                // Dispatch full subtitle cue array and current timestamp to background worker via session storage
                await storage.setItem('local:zdfActiveTask', {
                    videoId: currentVideoId,
                    cues: subtitleCues,
                    currentTime,
                    timestamp: Date.now()
                });

            } catch (err) {
                console.error("[2Subs2Learn ZDF] Failed to fetch XML:", err);
            }
        };

        // Check if a network resource entry matches ZDF's TTML XML subtitle stream
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

        // Initialize state and subtitle extraction for a newly loaded ZDF play route
        const startForCurrentPlayPage = async () => {
            if (!isZdfPlayRoute()) {
                cleanupSubtitleDisplay();
                return;
            }
            areCuesInitialized = false;
            currentVideoId = extractVideoId();
            await syncPlatformToZdf();
            await storage.setItem('local:zdfvideoPlaying', false);
            bindPlayStatusWatcher();
            bindVideoPlayListener();
            performance.clearResourceTimings();
            autoPauseVideo(true);
            autoEnableZdfSubtitles();
        };

        // Detect SPA route changes on ZDF and cleanly tear down / re-initialize watchers
        const setupSpaNavigationDetector = () => {
            let lastTrackedVideoId = isZdfPlayRoute() ? extractVideoId() : "";
            let wasOnPlayRoute = isZdfPlayRoute();

            const checkRouteChange = async () => {
                const nowOnPlayRoute = isZdfPlayRoute();
                const newVideoId = nowOnPlayRoute ? extractVideoId() : "";

                if (!nowOnPlayRoute && wasOnPlayRoute) {
                    wasOnPlayRoute = false;
                    lastTrackedVideoId = "";
                    lastProcessedUrl = "";
                    areCuesInitialized = false;
                    cleanupSubtitleDisplay();
                    if (unwatchPlayStatus) {
                        unwatchPlayStatus();
                        unwatchPlayStatus = null;
                    }
                    await storage.setItem('local:zdfActiveTask', null);
                    return;
                }

                if (nowOnPlayRoute && newVideoId !== lastTrackedVideoId) {
                    wasOnPlayRoute = true;
                    lastTrackedVideoId = newVideoId;
                    console.log("[2Subs2Learn ZDF] SPA navigation detected. Resetting for new video...");
                    lastProcessedUrl = "";
                    areCuesInitialized = false;
                    cleanupSubtitleDisplay();
                    if (unwatchPlayStatus) {
                        unwatchPlayStatus();
                        unwatchPlayStatus = null;
                    }
                    await storage.setItem('local:zdfActiveTask', null);
                    await startForCurrentPlayPage();
                }
            };

            window.addEventListener('popstate', checkRouteChange);
            setInterval(checkRouteChange, 500);
        };

        // Condition 2: Update currentPlatform when user switches tabs back to ZDF
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && isZdfPlayRoute()) {
                syncPlatformToZdf();
            }
        });

        window.addEventListener('focus', () => {
            if (isZdfPlayRoute()) {
                syncPlatformToZdf();
            }
        });

        setupSpaNavigationDetector();

        if (isZdfPlayRoute()) {
            performance.getEntriesByType('resource').forEach((entry: any) => {
                checkResourceEntry(entry.name);
            });
            startForCurrentPlayPage();
        }
    }
});