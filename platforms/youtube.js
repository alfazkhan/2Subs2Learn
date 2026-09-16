// platforms/youtube.js
import { BasePlatform } from './basePlatform.js';

export class YouTubePlatform extends BasePlatform {
    isSupported() {
        return window.location.hostname.includes('youtube.com');
    }

    getVideoElement() {
        const video = document.querySelector('video.html5-main-video') || document.querySelector('video');
        return video;
    }

    async initSubtitleListener(onSubtitlesReady) {
        console.log("[2Subs2Learn] YouTubePlatform: Checking for embedded caption tracks...");

        // Try extracting player response from global window scopes
        let playerResponse = window.ytInitialPlayerResponse;

        // If not found immediately, poll for it up to a few seconds
        let attempts = 0;
        while (!playerResponse && attempts < 10) {
            await new Promise(r => setTimeout(r, 1000));
            playerResponse = window.ytInitialPlayerResponse;
            attempts++;
        }

        if (!playerResponse || !playerResponse.captions) {
            console.log("[2Subs2Learn] No captions found in ytInitialPlayerResponse. Trying DOM fallback...");
            this.fallbackDomExtraction(onSubtitlesReady);
            return;
        }

        try {
            const captionTracks = playerResponse.captions.playerCaptionsTracklistRenderer?.captionTracks;
            if (!captionTracks || captionTracks.length === 0) {
                console.warn("[2Subs2Learn] Caption tracks array is empty.");
                return;
            }

            // Find English track or default to the first one
            const targetTrack = captionTracks.find(t => t.languageCode.startsWith('en')) || captionTracks[0];
            // Ensure we request json3 format
            const json3Url = targetTrack.baseUrl.includes('&fmt=json3') 
                ? targetTrack.baseUrl 
                : targetTrack.baseUrl + '&fmt=json3';

            console.log("[2Subs2Learn] Fetching captions from config URL:", json3Url);
            
            const response = await fetch(json3Url);
            const data = await response.json();

            if (data && data.events) {
                const parsedSubs = this.parseSubtitles(data.events);
                console.log(`[2Subs2Learn] Successfully extracted and parsed ${parsedSubs.length} subtitles directly!`);
                onSubtitlesReady(parsedSubs);
            }
        } catch (error) {
            console.error("[2Subs2Learn] Error fetching/parsing caption track config:", error);
        }
    }

    fallbackDomExtraction(onSubtitlesReady) {
        console.log("[2Subs2Learn] Using DOM fallback or waiting for user interaction...");
        // Fallback: Watch for any timedtext fetch manually triggered later
        const originalFetch = window.fetch;
        window.originalFetchRef = originalFetch;
    }

    parseSubtitles(events) {
        return events
            .filter(event => event.segs)
            .map(event => ({
                start: event.tStartMs / 1000,
                duration: (event.dDurationMs || 2000) / 1000,
                text: event.segs.map(seg => seg.utf8 || '').join('').trim()
            }))
            .filter(sub => sub.text.length > 0);
    }
}