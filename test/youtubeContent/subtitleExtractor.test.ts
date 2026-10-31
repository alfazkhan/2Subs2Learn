import { triggerAndInterceptTimedtextUrl, fetchParsedSubtitle, handleSubtitleExtraction } from '../../entrypoints/youtube.content/subtitleExtractor';
import type { YouTubeCaptionTrack } from '../../types/youtubeTypes';

describe('subtitleExtractor', () => {
  describe('triggerAndInterceptTimedtextUrl', () => {
    it('intercepts timedtext URL when subtitles are toggled', async () => {
      const mockPlayer = {
        toggleSubtitles: vi.fn(() => {
          window.fetch('http://example.com/api/timedtext?fmt=json3&lang=en');
        }),
        isSubtitlesOn: vi.fn(() => false)
      };

      Object.defineProperty(document, 'getElementById', {
        value: vi.fn().mockReturnValue(mockPlayer),
        configurable: true
      });

      Object.defineProperty(window, 'fetch', {
        value: vi.fn().mockResolvedValue(new Response('ok', { status: 200 })),
        configurable: true,
        writable: true,
      });

      const result = await triggerAndInterceptTimedtextUrl();
      expect(result).toContain('/api/timedtext');
      expect(mockPlayer.toggleSubtitles).toHaveBeenCalled();
    });

    it('rejects with error if movie_player not found', async () => {
      Object.defineProperty(document, 'getElementById', {
        value: vi.fn().mockReturnValue(null),
        configurable: true
      });

      await expect(triggerAndInterceptTimedtextUrl()).rejects.toThrow('movie_player not found');
    });
  });

  describe('fetchParsedSubtitle', () => {
    it('parses JSON3 format correctly', async () => {
      const mockResponse = {
        ok: true,
        text: async () => JSON.stringify({
          events: [
            { tStartMs: 1000, dDurationMs: 2000, segs: [{ utf8: 'Hello' }] }
          ]
        })
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockResponse as Response);

      const url = 'http://example.com/api/timedtext?fmt=json3&lang=en';
      const cues = await fetchParsedSubtitle(url);

      expect(cues).toHaveLength(1);
      expect(cues[0].text).toBe('Hello');
      expect(cues[0].start).toBe(1);
      expect(cues[0].duration).toBe(2);
    });

    it('throws error when response is empty', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        text: async () => '1'
      } as Response);

      await expect(fetchParsedSubtitle('http://example.com')).rejects.toThrow('YouTube returned empty or rejected response (1)');
    });
  });

  describe('handleSubtitleExtraction', () => {
    const interceptedUrl = 'https://www.youtube.com/api/timedtext?v=video&lang=de&sig=live';
    const createFetchMock = () => vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({
        events: [{ tStartMs: 0, dDurationMs: 5000, segs: [{ utf8: 'Hello' }] }]
      })
    } as Response);
    const installFetchMock = (fetchMock: ReturnType<typeof createFetchMock>) => {
      Object.defineProperty(window, 'fetch', {
        value: fetchMock,
        configurable: true,
        writable: true,
      });
      Object.defineProperty(globalThis, 'fetch', {
        value: fetchMock,
        configurable: true,
        writable: true,
      });
    };
    const installMockPlayer = () => {
      const mockPlayer = {
        toggleSubtitles: vi.fn(() => window.fetch(interceptedUrl)),
        isSubtitlesOn: vi.fn(() => false)
      };
      Object.defineProperty(document, 'getElementById', {
        value: vi.fn().mockReturnValue(mockPlayer),
        configurable: true
      });
      return mockPlayer;
    };
    const sourceTrack = {
      baseUrl: 'https://www.youtube.com/api/timedtext?v=video&lang=en&sig=stale',
      languageCode: 'en',
      kind: 'captions'
    } as YouTubeCaptionTrack;

    it('uses the intercepted live URL instead of the track base URL', async () => {
      const fetchMock = createFetchMock();
      installFetchMock(fetchMock);
      const mockPlayer = installMockPlayer();

      await handleSubtitleExtraction(sourceTrack, undefined, 'fr');

      const sourceRequest = new URL(String(fetchMock.mock.calls[1]?.[0]));
      expect(sourceRequest.searchParams.get('lang')).toBe('en');
      expect(sourceRequest.searchParams.get('fmt')).toBe('json3');
      expect(sourceRequest.searchParams.get('sig')).toBe('live');
      expect(sourceRequest.searchParams.get('tlang')).toBeNull();
      expect(mockPlayer.toggleSubtitles).toHaveBeenCalledOnce();
    });

    it('keeps the source language when requesting YouTube auto-translation', async () => {
      const fetchMock = createFetchMock();
      installFetchMock(fetchMock);
      installMockPlayer();

      await handleSubtitleExtraction(sourceTrack, undefined, 'fr');

      const translatedRequest = new URL(String(fetchMock.mock.calls[2]?.[0]));
      expect(translatedRequest.searchParams.get('lang')).toBe('en');
      expect(translatedRequest.searchParams.get('tlang')).toBe('fr');
      expect(translatedRequest.searchParams.get('fmt')).toBe('json3');
      expect(translatedRequest.searchParams.get('sig')).toBe('live');
    });

    it('relays subtitles to isolated world', async () => {
      const fetchMock = createFetchMock();
      installFetchMock(fetchMock);
      const mockPlayer = installMockPlayer();
      mockPlayer.isSubtitlesOn.mockReturnValue(true);
      const postMessageSpy = vi.spyOn(window, 'postMessage').mockImplementation(() => {});

      await handleSubtitleExtraction(sourceTrack, undefined, 'fr');

      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'RELAY_SUBTITLES_TO_ISOLATED' }),
        '*'
      );
      expect(mockPlayer.toggleSubtitles).toHaveBeenCalledTimes(2);
    });
  });
});