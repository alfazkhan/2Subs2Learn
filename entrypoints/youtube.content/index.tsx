// entrypoints/youtube.content/index.tsx
import { defineContentScript } from '#imports';
import fetchSubtitles from "./fetchSubtitles";
import { handleSubtitleExtraction } from "./subtitleExtractor";

export default defineContentScript({
    matches: ['*://*.youtube.com/*'],
    world: 'MAIN',

    async main() {
        let lastProcessedVideoId = "";
        let adCheckInterval: ReturnType<typeof setInterval> | null = null;
        let navigationTimestamp = Date.now();
        

        // Listen for commands from the ISOLATED world YouTube UI script
        window.addEventListener('message', (event) => {
            if (event.source !== window || !event.data) return;

            if (event.data.type === 'PLAY_VIDEO') {
                const video = document.querySelector('video') as HTMLVideoElement;
                const player = document.getElementById('movie_player') as any;
                if (video) video.play().catch(() => {});
                if (player && typeof player.playVideo === 'function') player.playVideo();
            }

            if (event.data.type === 'START_INTERCEPT_SUBTITLES') {
                console.log("EVENT: 'START_INTERCEPT_SUBTITLES'");
                const { sourceTrack, targetTrack, targetLang } = event.data.payload;
                handleSubtitleExtraction(sourceTrack, targetTrack, targetLang);
            }
        });

        // Verify that YouTube ads have finished and extract available caption tracks
        function checkAndProcessVideo() {
            const player = document.getElementById('movie_player') as any;
            const videoElement = document.querySelector('video') as HTMLVideoElement;

            if (!player || !videoElement) return;

            const playerResponse = (window as any).ytInitialPlayerResponse;
            const currentVideoId = playerResponse?.videoDetails?.videoId;

            if (!currentVideoId || currentVideoId === lastProcessedVideoId) {
                return;
            }

            // Strictly check active player ad states
            const isAdShowing =
                player.classList.contains('ad-showing') ||
                player.classList.contains('ad-interrupting') ||
                (typeof player.getVideoData === 'function' && player.getVideoData()?.isAd === true);

            if (isAdShowing) {
                navigationTimestamp = Date.now();
                return;
            }

            // Wait 1 second after navigation to allow delayed pre-roll ads to mount
            if (Date.now() - navigationTimestamp < 1000) {
                return;
            }

            if (isNaN(videoElement.duration) || videoElement.duration === 0) {
                return;
            }

            lastProcessedVideoId = currentVideoId;

            if (!videoElement.paused) {
                videoElement.pause();
            }
            if (typeof player.pauseVideo === 'function') {
                player.pauseVideo();
            }

            console.log("Video ready. Process started for:", currentVideoId);

            const availableTracks = fetchSubtitles();
            console.log("AVAILABLE TRACKS", availableTracks);

            if (availableTracks.length > 0) {
                window.postMessage({
                    type: 'AVAILABLE_TRACKS_READY',
                    payload: { availableTracks, currentVideoId }
                }, '*');
            }

            if (adCheckInterval) {
                clearInterval(adCheckInterval);
                adCheckInterval = null;
            }
        }

        adCheckInterval = setInterval(checkAndProcessVideo, 200);

        // Reset video detection when YouTube finishes an internal SPA navigation
        document.addEventListener('yt-navigate-finish', (event: any) => {
            const freshResponse = event.detail?.response?.playerResponse || event.detail?.pageData?.playerResponse;
            if (freshResponse) {
                (window as any).ytInitialPlayerResponse = freshResponse;
            }

            navigationTimestamp = Date.now();
            lastProcessedVideoId = "";

            if (!adCheckInterval) {
                adCheckInterval = setInterval(checkAndProcessVideo, 200);
            }
        });
    }
});