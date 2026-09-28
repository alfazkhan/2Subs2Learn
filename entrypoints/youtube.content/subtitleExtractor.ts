// entrypoints/youtube.content/subtitleExtractor.ts
import type { YouTubeCaptionTrack } from "@/types/youtubeTypes";

export function triggerAndInterceptTimedtextUrl(): Promise<string> {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            cleanup();
            reject(new Error("Network interception timed out after 7000ms"));
        }, 7000);

        const originalXhrOpen = XMLHttpRequest.prototype.open;
        const originalFetch = window.fetch;

        function cleanup() {
            clearTimeout(timeout);
            XMLHttpRequest.prototype.open = originalXhrOpen;
            window.fetch = originalFetch;
        }

        XMLHttpRequest.prototype.open = function(method: string, url: string | URL, ...rest: any[]) {
            const urlString = typeof url === 'string' ? url : url.toString();
            if (urlString.includes('/api/timedtext')) {
                cleanup();
                resolve(urlString);
            }
            return originalXhrOpen.call(this, method, url, ...rest);
        };

        window.fetch = async function(...args: any[]) {
            const firstArg = args[0];
            const urlString = typeof firstArg === 'string' ? firstArg : firstArg?.url;
            if (urlString && urlString.includes('/api/timedtext')) {
                cleanup();
                resolve(urlString);
            }
            return originalFetch.apply(this, args);
        };

        const player = document.getElementById('movie_player') as any;
        if (player && typeof player.toggleSubtitles === 'function') {
            if (!player.isSubtitlesOn()) {
                player.toggleSubtitles();
            } else {
                player.toggleSubtitles();
                setTimeout(() => player.toggleSubtitles(), 50);
            }
        } else {
            cleanup();
            reject(new Error("movie_player not found or subtitles toggle unavailable"));
        }
    });
}

export async function fetchParsedSubtitle(url: string) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
    
    const rawText = await response.text();
    if (rawText.trim() === "1" || rawText.trim() === "") {
        throw new Error("YouTube returned empty or rejected response (1)");
    }

    const data = JSON.parse(rawText);
    if (!data.events) return [];

    return data.events
        .filter((event: any) => event.segs)
        .map((event: any) => ({
            start: event.tStartMs / 1000,
            duration: (event.dDurationMs || 2000) / 1000,
            text: event.segs.map((seg: any) => seg.utf8 || '').join('').trim()
        }))
        .filter((cue: any) => cue.text.length > 0);
}

export async function handleSubtitleExtraction(sourceTrack: YouTubeCaptionTrack, targetTrack?: YouTubeCaptionTrack, targetLangCode?: string) {
    const player = document.getElementById('movie_player') as any;
    if (!player) return;

    try {
        console.log("[MAIN] Activating subtitle stream to capture authenticated request...");
        const interceptedUrl = await triggerAndInterceptTimedtextUrl();

        const sourceUrlObj = new URL(interceptedUrl, window.location.origin);
        sourceUrlObj.searchParams.set('fmt', 'json3');
        sourceUrlObj.searchParams.set('lang', sourceTrack.languageCode);
        sourceUrlObj.searchParams.delete('tlang');

        const sourceArray = await fetchParsedSubtitle(sourceUrlObj.toString());

        let targetArray: any[] = [];
        const resolvedTargetLang = targetTrack?.languageCode || targetLangCode || 'de';

        if (targetTrack && targetTrack.kind !== 'asr') {
            const targetUrlObj = new URL(interceptedUrl, window.location.origin);
            targetUrlObj.searchParams.set('fmt', 'json3');
            targetUrlObj.searchParams.set('lang', resolvedTargetLang);
            targetUrlObj.searchParams.delete('tlang');
            
            try {
                targetArray = await fetchParsedSubtitle(targetUrlObj.toString());
            } catch (e) {
                console.warn("[MAIN] Human-curated fetch failed, falling back to YouTube auto-translate.");
            }
        }

        if (!targetArray || targetArray.length === 0) {
            const translatedUrlObj = new URL(interceptedUrl, window.location.origin);
            translatedUrlObj.searchParams.set('fmt', 'json3');
            translatedUrlObj.searchParams.set('tlang', resolvedTargetLang);
            targetArray = await fetchParsedSubtitle(translatedUrlObj.toString());
        }

        if (typeof player.toggleSubtitles === 'function' && player.isSubtitlesOn()) {
            player.toggleSubtitles();
        }

        window.postMessage({
            type: 'RELAY_SUBTITLES_TO_ISOLATED',
            payload: { sourceArray, targetArray }
        }, '*');

    } catch (error) {
        console.error("[MAIN] Subtitle interception pipeline failed:", error);
    }
}