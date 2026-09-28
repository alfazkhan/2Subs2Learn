// entrypoints/youtube.content/index.tsx
import fetchSubtitles from "./fetchSubtitles";
import { handleSubtitleExtraction } from "./subtitleExtractor";

export default defineContentScript({
    matches: ['*://*.youtube.com/*'],
    world: 'MAIN',

    async main() {
        let lastProcessedVideoId = "";
        let isWaitingForUserSelection = true;

        document.addEventListener('play', (e: Event) => {
            const target = e.target as HTMLElement;
            if (target && target.tagName === 'VIDEO' && isWaitingForUserSelection) {
                e.stopPropagation();
                (target as HTMLVideoElement).pause();
            }
        }, true);

        window.addEventListener('message', (event) => {
            if (event.source !== window || !event.data) return;

            if (event.data.type === 'PLAY_VIDEO') {
                isWaitingForUserSelection = false;
                const video = document.querySelector('video') as HTMLVideoElement;
                const player = document.getElementById('movie_player') as any;
                if (video) video.play().catch(() => {});
                if (player && typeof player.playVideo === 'function') player.playVideo();
            }

            if (event.data.type === 'START_INTERCEPT_SUBTITLES') {
                const { sourceTrack, targetTrack, targetLang } = event.data.payload;
                handleSubtitleExtraction(sourceTrack, targetTrack, targetLang);
            }
        });

        function notifyAvailableTracks() {
            const playerResponse = (window as any).ytInitialPlayerResponse;
            const currentVideoId = playerResponse?.videoDetails?.videoId;

            if (!currentVideoId || currentVideoId === lastProcessedVideoId) {
                return;
            }

            lastProcessedVideoId = currentVideoId;
            isWaitingForUserSelection = true;
            const availableTracks = fetchSubtitles();

            if (availableTracks.length > 0) {
                window.postMessage({
                    type: 'AVAILABLE_TRACKS_READY',
                    payload: availableTracks
                }, '*');
            }
        }

        notifyAvailableTracks();

        document.addEventListener('yt-navigate-finish', (event: any) => {
            const freshResponse = event.detail?.response?.playerResponse || event.detail?.pageData?.playerResponse;
            if (freshResponse) {
                (window as any).ytInitialPlayerResponse = freshResponse;
            }
            notifyAvailableTracks();
        });
    }
});