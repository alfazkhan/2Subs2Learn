import fetchSubtitles from '../../entrypoints/youtube.content/fetchSubtitles';

describe('fetchSubtitles', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'ytInitialPlayerResponse', {
      value: {
        captions: {
          playerCaptionsTracklistRenderer: {
            captionTracks: [
              { languageCode: 'en', name: { simpleText: 'English' }, kind: 'subs' },
              { languageCode: 'es', name: { simpleText: 'Spanish' }, kind: 'subs' }
            ]
          }
        }
      },
      configurable: true,
      writable: true,
    });
  });

  it('returns array of caption tracks', () => {
    const tracks = fetchSubtitles();
    expect(tracks).toHaveLength(2);
    const [firstTrack, secondTrack] = tracks;
    expect(firstTrack).toBeDefined();
    expect(secondTrack).toBeDefined();
    expect(firstTrack!.languageCode).toBe('en');
    expect(secondTrack!.languageCode).toBe('es');
  });

  it('returns empty array when no caption tracks', () => {
    Object.defineProperty(window, 'ytInitialPlayerResponse', {
      value: { captions: undefined },
      configurable: true,
      writable: true,
    });
    const tracks = fetchSubtitles();
    expect(tracks).toHaveLength(0);
  });
});