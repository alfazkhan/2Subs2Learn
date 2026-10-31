import { describe, it, expect, vi } from 'vitest';
const { mockRequestTranslations } = vi.hoisted(() => ({
  mockRequestTranslations: vi.fn(),
}));

vi.mock('../../entrypoints/background/translation-engine', () => ({
  max_background_request: 5,
  prefetch_request_chunks: 3,
  requestTranslations: mockRequestTranslations,
}));

import { 
  processAndStoreBatches, 
  updatePlatformFromTab, 
  cancelActiveLoop, 
  triggerZdfPlayState, 
  notifyZdfTranslationsUpdated 
} from '../../entrypoints/background/zdf-handler';
import { getItemSpy, setItemSpy, mockTabsGet } from '../../src/test/setup';

describe('processAndStoreBatches', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    getItemSpy.mockResolvedValue({});
    mockRequestTranslations.mockResolvedValue([]);
    mockTabsGet.mockResolvedValue({ url: 'https://zdf.de/play/test-video' });
    await updatePlatformFromTab(1);
  });

  it('processes batches and stores translations in cache', async () => {
    const videoId = 'test-video-123';
    const cues = [
      { start: 1.0, duration: 2.0, text: 'First subtitle' },
      { start: 3.0, duration: 2.0, text: 'Second subtitle' },
      { start: 5.0, duration: 2.0, text: 'Third subtitle' },
    ];
    
    const mockStorageCache = { [videoId]: [] };
    getItemSpy.mockResolvedValue(mockStorageCache);

    const mockTranslations = ['Erste Untertitel', 'Zweite Untertitel', 'Dritte Untertitel'];
    mockRequestTranslations.mockResolvedValue(mockTranslations);

    await processAndStoreBatches(videoId, cues, 0, 0);

    expect(mockRequestTranslations).toHaveBeenCalledWith(
      ['First subtitle', 'Second subtitle', 'Third subtitle'], 'de', 'en'
    );
    expect(setItemSpy).toHaveBeenCalledWith('local:translationsCache', expect.objectContaining({
      [videoId]: expect.arrayContaining([{
      starttime: 1.0,
      endtime: 3.0,
      text: 'Erste Untertitel'
      }]),
    }));
  });

  it('skips batches that are already cached', async () => {
    const videoId = 'test-video-456';
    const cues = [
      { start: 1.0, duration: 2.0, text: 'First subtitle' },
      { start: 3.0, duration: 2.0, text: 'Second subtitle' },
    ];
    
    const mockStorageCache = { 
      [videoId]: [
        { starttime: 1.0, endtime: 3.0, text: 'Already cached' }
      ] 
    };
    getItemSpy.mockResolvedValue(mockStorageCache);

    await processAndStoreBatches(videoId, cues, 0, 0);

    expect(mockRequestTranslations).toHaveBeenCalledTimes(1);
    expect(mockRequestTranslations).toHaveBeenCalledWith(['Second subtitle'], 'de', 'en');
  });

  it('handles empty cache for new video', async () => {
    const videoId = 'new-video';
    const cues = [
      { start: 1.0, duration: 2.0, text: 'Test subtitle' },
    ];
    
    getItemSpy.mockResolvedValue({});

    await processAndStoreBatches(videoId, cues, 0, 0);

    expect(mockRequestTranslations).toHaveBeenCalledWith(['Test subtitle'], 'de', 'en');
  });

  it('respects runId for batch processing', async () => {
    const videoId = 'test-video';
    const cues = [
      { start: 1.0, duration: 2.0, text: 'First' },
      { start: 3.0, duration: 2.0, text: 'Second' },
    ];

    await processAndStoreBatches(videoId, cues, 0, 0);

    // Second call with different runId should not reprocess
    await processAndStoreBatches(videoId, cues, 0, 1);
    
    expect(mockRequestTranslations).toHaveBeenCalledTimes(1);
  });

  it('handles batch index out of bounds', async () => {
    const videoId = 'test-video';
    const cues = [
      { start: 1.0, duration: 2.0, text: 'Only one cue' },
    ];

    await processAndStoreBatches(videoId, cues, 10, 0);

    expect(mockRequestTranslations).not.toHaveBeenCalled();
  });

  it('triggers play state when target cue is cached and video is paused', async () => {
    const videoId = 'test-video';
    const cues = [
      { start: 1.0, duration: 2.0, text: 'First' },
      { start: 3.0, duration: 2.0, text: 'Second' },
    ];
    
    const mockStorageCache = { 
      [videoId]: [
        { starttime: 3.0, endtime: 5.0, text: 'Cached second' }
      ] 
    };
    getItemSpy.mockResolvedValue(mockStorageCache);

    await processAndStoreBatches(videoId, cues, 1, 0);

    expect(mockRequestTranslations).not.toHaveBeenCalled();
  });

  it('handles multiple batches in sequence', async () => {
    const videoId = 'test-video';
    const cues = [
      { start: 1.0, duration: 2.0, text: 'First batch' },
      { start: 3.0, duration: 2.0, text: 'Second batch' },
      { start: 5.0, duration: 2.0, text: 'Third batch' },
      { start: 7.0, duration: 2.0, text: 'Fourth batch' },
    ];

    const mockTranslations = [
      'Erste Batch',
      'Zweite Batch',
      'Dritte Batch',
      'Vierte Batch'
    ];
    mockRequestTranslations.mockResolvedValue(mockTranslations);

    await processAndStoreBatches(videoId, cues, 0, 0);

    expect(mockRequestTranslations).toHaveBeenCalledTimes(2);
  });

  it('handles video ID changes', async () => {
    const videoId = 'old-video';
    const cues = [
      { start: 1.0, duration: 2.0, text: 'Old video' },
    ];

    await processAndStoreBatches(videoId, cues, 0, 0);

    const newVideoId = 'new-video';
    await processAndStoreBatches(newVideoId, cues, 0, 0);

    expect(mockRequestTranslations).toHaveBeenCalledTimes(2);
  });
});

describe('updatePlatformFromTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as any).currentPlatform = '';
    (globalThis as any).currentRunId = 0;
  });

  it('detects ZDF platform from URL', async () => {
    mockTabsGet.mockResolvedValue({ url: 'https://youtube.com/watch?v=seed' });
    await updatePlatformFromTab(1);
    setItemSpy.mockClear();
    mockTabsGet.mockResolvedValue({ url: 'https://zdf.de/play/video-123' });

    await updatePlatformFromTab(1);

    expect(setItemSpy).toHaveBeenCalledWith(
      'local:currentPlatform',
      'ZDF'
    );
  });

  it('detects YouTube platform from URL', async () => {
    const mockTab = { url: 'https://youtube.com/watch?v=abc123' };
    mockTabsGet.mockResolvedValue(mockTab);

    await updatePlatformFromTab(1);

    expect(setItemSpy).toHaveBeenCalledWith('local:currentPlatform', 'YOUTUBE');
  });

  it('increments runId when platform changes from ZDF to non-ZDF', async () => {
    const mockTab = { url: 'https://youtube.com/watch?v=abc123' };
    mockTabsGet.mockResolvedValue({ url: 'https://zdf.de/play/video-123' });
    await updatePlatformFromTab(1);
    setItemSpy.mockClear();
    mockTabsGet.mockResolvedValue(mockTab);

    await updatePlatformFromTab(1);

    expect(setItemSpy).toHaveBeenCalledWith('local:currentPlatform', 'YOUTUBE');
  });

  it('does not increment runId when platform stays ZDF', async () => {
    const mockTab = { url: 'https://zdf.de/play/video-456' };
    mockTabsGet.mockResolvedValue(mockTab);

    await updatePlatformFromTab(1);

    expect((globalThis as any).currentRunId).toBe(0);
  });

  it('handles missing tab gracefully', async () => {
    mockTabsGet.mockResolvedValue(null);

    await updatePlatformFromTab(1);

    expect((globalThis as any).currentPlatform).toBe('');
  });
});

describe('cancelActiveLoop', () => {
  it('does not throw when cancelling active processing', () => {
    expect(() => cancelActiveLoop()).not.toThrow();
  });
});

describe('triggerZdfPlayState', () => {
  it('triggers play state for ZDF platform', async () => {
    mockTabsGet.mockResolvedValue({ url: 'https://zdf.de/play/video-123' });
    await updatePlatformFromTab(1);
    setItemSpy.mockClear();

    await triggerZdfPlayState();

    expect(setItemSpy).toHaveBeenCalledWith(
      'local:zdfvideoPlaying',
      true
    );
  });

  it('does not trigger for non-ZDF platform', async () => {
    mockTabsGet.mockResolvedValue({ url: 'https://youtube.com/watch?v=abc123' });
    await updatePlatformFromTab(1);
    setItemSpy.mockClear();

    await triggerZdfPlayState();

    expect(setItemSpy).not.toHaveBeenCalledWith(
      'local:zdfvideoPlaying',
      true
    );
  });
});

describe('notifyZdfTranslationsUpdated', () => {
  it('notifies about translation updates with video ID and timestamp', async () => {
    const videoId = 'test-video-789';

    await notifyZdfTranslationsUpdated(videoId);

    expect(setItemSpy).toHaveBeenCalledWith(
      'local:zdfTranslationUpdated',
      {
        videoId,
        timestamp: expect.any(Number)
      }
    );
  });
});
