// entrypoints/youtube.content/fetchSubtitles.ts
import type { YouTubeCaptionTrack } from "@/types/youtubeTypes";

export default function fetchSubtitles(): YouTubeCaptionTrack[] {
    const playerResponse = (window as any).ytInitialPlayerResponse;
    const captionTracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

    if (!captionTracks || !Array.isArray(captionTracks)) {
        console.log("[fetchSubtitles] No caption tracks available for this video.");
        return [];
    }

    console.log(`[fetchSubtitles] Total raw tracks found: ${captionTracks.length}`);
    return captionTracks;
}