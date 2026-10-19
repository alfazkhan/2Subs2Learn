// entrypoints/youtube.content/index.tsx
import fetchSubtitles from "./fetchSubtitles";
import { handleSubtitleExtraction } from "./subtitleExtractor";

export default defineContentScript({
    matches: ['*://*.youtube.com/watch*'],
    world: 'MAIN',

    async main() {
        let lastProcessedVideoId = "";
        let isWaitingForUserSelection = false;
        let adCheckInterval: NodeJS.Timeout | null = null;
        let navigationTimestamp = Date.now();
        async function setPlatform() {
            await storage.setItem(`local:currentPlatform`, "YOUTUBE")
        }
        setPlatform()
        window.addEventListener('message', (event) => {
            if (event.source !== window || !event.data) return;

            if (event.data.type === 'PLAY_VIDEO') {
                isWaitingForUserSelection = false;
                const video = document.querySelector('video') as HTMLVideoElement;
                const player = document.getElementById('movie_player') as any;
                if (video) video.play().catch(() => { });
                if (player && typeof player.playVideo === 'function') player.playVideo();
            }

            if (event.data.type === 'START_INTERCEPT_SUBTITLES') {
                console.log("EVENT: 'START_INTERCEPT_SUBTITLES'")
                const { sourceTrack, targetTrack, targetLang } = event.data.payload;
                handleSubtitleExtraction(sourceTrack, targetTrack, targetLang);
            }
        });

        function checkAndProcessVideo() {
            const player = document.getElementById('movie_player') as any;
            const videoElement = document.querySelector('video') as HTMLVideoElement;

            if (!player || !videoElement) return;

            const playerResponse = (window as any).ytInitialPlayerResponse;
            const currentVideoId = playerResponse?.videoDetails?.videoId;

            if (!currentVideoId || currentVideoId === lastProcessedVideoId) {
                return;
            }

            // Strictly check active player ad states (avoiding permanent DOM wrappers)
            const isAdShowing =
                player.classList.contains('ad-showing') ||
                player.classList.contains('ad-interrupting') ||
                (typeof player.getVideoData === 'function' && player.getVideoData()?.isAd === true);

            if (isAdShowing) {
                // An ad is actively playing, reset the timer to wait for it to finish
                navigationTimestamp = Date.now();
                return;
            }

            // Give a short 1-second buffer window right after navigation for a delayed ad to register.
            if (Date.now() - navigationTimestamp < 1000) {
                return;
            }

            if (isNaN(videoElement.duration) || videoElement.duration === 0) {
                return;
            }

            // Clean video confirmed, ads have cleared
            lastProcessedVideoId = currentVideoId;
            isWaitingForUserSelection = true;

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

        adCheckInterval = setInterval(() => {
            checkAndProcessVideo();
        }, 200);

        document.addEventListener('yt-navigate-finish', (event: any) => {
            const freshResponse = event.detail?.response?.playerResponse || event.detail?.pageData?.playerResponse;
            if (freshResponse) {
                (window as any).ytInitialPlayerResponse = freshResponse;
            }

            // Reset tracking parameters on new video load
            navigationTimestamp = Date.now();
            lastProcessedVideoId = ""; // Allow re-processing if navigating back to a previous ID

            if (!adCheckInterval) {
                adCheckInterval = setInterval(() => {
                    checkAndProcessVideo();
                }, 200);
            }
        });
    }
});