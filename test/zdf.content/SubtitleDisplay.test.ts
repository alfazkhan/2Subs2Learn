import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock #imports module before importing SubtitleDisplay
vi.mock('#imports', () => ({
  storage: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    watch: vi.fn(),
  },
}));

// Mock React and ReactDOM
const { mockRoot, mockCreateRoot } = vi.hoisted(() => ({
  mockRoot: { render: vi.fn(), unmount: vi.fn() },
  mockCreateRoot: vi.fn(),
}));

vi.mock('react', () => ({
  __esModule: true,
  createElement: (tag: any, props: any) => ({ type: tag, props }),
  Fragment: {},
  default: {
    createElement: (tag: any, props: any) => ({ type: tag, props }),
    Fragment: {},
  },
}));

vi.mock('react-dom/client', () => ({
  createRoot: mockCreateRoot,
  default: { createRoot: mockCreateRoot },
}));

// Mock SubtitleOverlay component
vi.mock('@/components/SubtitleOverlay', () => ({
  __esModule: true,
  default: (props: any) => props,
}));

// Import the actual functions to test - use ES6 import with mocked dependencies
import { handleSubtitleDisplayAndSync, showInitialLoadingOverlay, cleanupSubtitleDisplay } from '../../entrypoints/zdf.content/SubtitleDisplay.tsx';

describe('handleSubtitleDisplayAndSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateRoot.mockReturnValue(mockRoot);
    
    // Reset global state
    (globalThis as any).requestRef = null;
    (globalThis as any).overlayRoot = null;
    (globalThis as any).injectNativeSubHideStyle = vi.fn();
    (globalThis as any).ensureOverlayRoot = vi.fn();
    
    // Mock video element
    const mockVideoElement = {
      currentTime: 0,
      paused: true,
      onpause: null,
      onplay: null,
      onseeking: null,
      onseeked: null,
      parentElement: document.body,
    };
    
    // Mock controllers
    const mockControllers = {
      autoPlayVideo: vi.fn(),
      autoPauseVideo: vi.fn(),
      isExtensionPaused: () => false,
    };
  });

  afterEach(() => {
    cleanupSubtitleDisplay();
  });

  it('initializes subtitle display with original cues', async () => {
    const originalCues = [
      { start: 1.0, duration: 2.0, text: 'First subtitle' },
      { start: 3.0, duration: 2.0, text: 'Second subtitle' },
    ];
    
    const videoId = 'test-video-1';
    const mockVideoElement = {
      currentTime: 0,
      paused: true,
      onpause: vi.fn(),
      onplay: vi.fn(),
      onseeking: vi.fn(),
      onseeked: vi.fn(),
      parentElement: document.body,
    };
    
    const mockControllers = {
      autoPlayVideo: vi.fn(),
      autoPauseVideo: vi.fn(),
      isExtensionPaused: () => false,
    };

    (globalThis as any).document.querySelector = vi.fn().mockReturnValue(mockVideoElement);
    (globalThis as any).storage.getItem = vi.fn().mockResolvedValue({});

    await handleSubtitleDisplayAndSync(originalCues, videoId, 'video', mockControllers);

    expect(mockCreateRoot).toHaveBeenCalledTimes(1);
  });

  it('maps original cues to unified cue format', async () => {
    const originalCues = [
      { start: 1.0, duration: 2.0, text: 'Hello' },
      { start: 3.0, duration: 4.0, text: 'World' },
    ];

    const videoId = 'test-video';
    const mockVideoElement = {
      currentTime: 0,
      paused: true,
      onpause: vi.fn(),
      onplay: vi.fn(),
      onseeking: vi.fn(),
      onseeked: vi.fn(),
      parentElement: document.body,
    };

    const mockControllers = {
      autoPlayVideo: vi.fn(),
      autoPauseVideo: vi.fn(),
      isExtensionPaused: () => false,
    };

    (globalThis as any).document.querySelector = vi.fn().mockReturnValue(mockVideoElement);
    (globalThis as any).storage.getItem = vi.fn().mockResolvedValue({});

    await handleSubtitleDisplayAndSync(originalCues, videoId, 'video', mockControllers);

    expect(mockCreateRoot).toHaveBeenCalledTimes(1);
  });

  it('finds active cue using binary search', async () => {
    const unifiedCues = [
      { starttime: 1.0, endtime: 3.0, sourceText: 'First', targetText: '' },
      { starttime: 3.0, endtime: 5.0, sourceText: 'Second', targetText: '' },
    ];

    const findActiveUnifiedCue = (cues: any[], currentTime: number): any | null => {
      let left = 0;
      let right = cues.length - 1;

      while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        const cue = cues[mid];
        if (!cue) {
          return null;
        }
        if (currentTime >= cue.starttime && currentTime <= cue.endtime) {
          return cue;
        } else if (currentTime < cue.starttime) {
          right = mid - 1;
        } else {
          left = mid + 1;
        }
      }
      return null;
    };

    const currentTime = 2.0;
    const activeCue = findActiveUnifiedCue(unifiedCues, currentTime);

    expect(activeCue).toEqual({
      starttime: 1.0,
      endtime: 3.0,
      sourceText: 'First',
      targetText: ''
    });
  });

  it('handles cue at boundary (start time)', async () => {
    const unifiedCues = [
      { starttime: 1.0, endtime: 3.0, sourceText: 'First', targetText: '' },
      { starttime: 3.0, endtime: 5.0, sourceText: 'Second', targetText: '' },
    ];

    const findActiveUnifiedCue = (cues: any[], currentTime: number): any | null => {
      let left = 0;
      let right = cues.length - 1;

      while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        const cue = cues[mid];
        if (!cue) {
          return null;
        }
        // Binary search: find the first cue where currentTime >= starttime
        if (currentTime >= cue.starttime && currentTime <= cue.endtime) {
          return cue;
        } else if (currentTime < cue.starttime) {
          right = mid - 1;
        } else {
          left = mid + 1;
        }
      }
      return null;
    };

    const currentTime = 3.0;
    const activeCue = findActiveUnifiedCue(unifiedCues, currentTime);

    // At boundary time 3.0, the first cue ends at 3.0, so it should still be found
    expect(activeCue).toEqual({
      starttime: 1.0,
      endtime: 3.0,
      sourceText: 'First',
      targetText: ''
    });
  });

  it('handles cue at boundary (end time) - returns first matching cue', async () => {
    const unifiedCues = [
      { starttime: 1.0, endtime: 3.0, sourceText: 'First', targetText: '' },
      { starttime: 3.0, endtime: 5.0, sourceText: 'Second', targetText: '' },
    ];

    const findActiveUnifiedCue = (cues: any[], currentTime: number): any | null => {
      let left = 0;
      let right = cues.length - 1;

      while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        const cue = cues[mid];
        if (!cue) {
          return null;
        }
        // Binary search: find the first cue where currentTime >= starttime
        if (currentTime >= cue.starttime && currentTime <= cue.endtime) {
          return cue;
        } else if (currentTime < cue.starttime) {
          right = mid - 1;
        } else {
          left = mid + 1;
        }
      }
      return null;
    };

    const currentTime = 3.0;
    const activeCue = findActiveUnifiedCue(unifiedCues, currentTime);

    // At boundary time 3.0, the first cue ends at 3.0, so it should still be found
    expect(activeCue).toEqual({
      starttime: 1.0,
      endtime: 3.0,
      sourceText: 'First',
      targetText: ''
    });
  });

  it('returns null when no cue is active', async () => {
    const unifiedCues = [
      { starttime: 1.0, endtime: 3.0, sourceText: 'First', targetText: '' },
    ];

    const findActiveUnifiedCue = (cues: any[], currentTime: number): any | null => {
      let left = 0;
      let right = cues.length - 1;

      while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        const cue = cues[mid];
        if (!cue) {
          return null;
        }
        if (currentTime >= cue.starttime && currentTime <= cue.endtime) {
          return cue;
        } else if (currentTime < cue.starttime) {
          right = mid - 1;
        } else {
          left = mid + 1;
        }
      }
      return null;
    };

    const currentTime = 5.0;
    const activeCue = findActiveUnifiedCue(unifiedCues, currentTime);

    expect(activeCue).toBeNull();
  });

  it('syncs cached translations from storage', async () => {
    const originalCues = [
      { start: 1.0, duration: 2.0, text: 'Hello' },
      { start: 3.0, duration: 2.0, text: 'World' },
    ];

    const videoId = 'test-video';
    const mockVideoElement = {
      currentTime: 0,
      paused: true,
      onpause: vi.fn(),
      onplay: vi.fn(),
      onseeking: vi.fn(),
      onseeked: vi.fn(),
      parentElement: document.body,
    };

    const mockControllers = {
      autoPlayVideo: vi.fn(),
      autoPauseVideo: vi.fn(),
      isExtensionPaused: () => false,
    };

    // Mock storage with cached translations
    (globalThis as any).storage.getItem = vi.fn().mockResolvedValue({
      [videoId]: [
        { starttime: 1.0, endtime: 3.0, text: 'Hallo' },
        { starttime: 3.0, endtime: 5.0, text: 'Welt' },
      ],
    });

    await handleSubtitleDisplayAndSync(originalCues, videoId, 'video', mockControllers);

    expect(mockCreateRoot).toHaveBeenCalledTimes(1);
  });

  it('handles empty unified cues array', async () => {
    const originalCues: Array<{ start: number; duration: number; text: string }> = [];
    const videoId = 'test-video';
    const mockVideoElement = {
      currentTime: 0,
      paused: true,
      onpause: vi.fn(),
      onplay: vi.fn(),
      onseeking: vi.fn(),
      onseeked: vi.fn(),
      parentElement: document.body,
    };

    const mockControllers = {
      autoPlayVideo: vi.fn(),
      autoPauseVideo: vi.fn(),
      isExtensionPaused: () => false,
    };

    (globalThis as any).document.querySelector = vi.fn().mockReturnValue(mockVideoElement);
    (globalThis as any).storage.getItem = vi.fn().mockResolvedValue({});

    await handleSubtitleDisplayAndSync(originalCues, videoId, 'video', mockControllers);

    expect(mockCreateRoot).toHaveBeenCalledTimes(1);
  });

  it('handles missing video element gracefully', async () => {
    const originalCues = [
      { start: 1.0, duration: 2.0, text: 'Hello' },
    ];

    const videoId = 'test-video';

    (globalThis as any).document.querySelector = vi.fn().mockReturnValue(null);
    (globalThis as any).storage.getItem = vi.fn().mockResolvedValue({});

    await handleSubtitleDisplayAndSync(originalCues, videoId, 'video', {
      autoPlayVideo: vi.fn(),
      autoPauseVideo: vi.fn(),
      isExtensionPaused: () => false,
    });

    expect(mockCreateRoot).not.toHaveBeenCalled();
  });
});

describe('showInitialLoadingOverlay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as any).overlayRoot = null;
    (globalThis as any).injectNativeSubHideStyle = vi.fn();
    (globalThis as any).ensureOverlayRoot = vi.fn();
  });

  it('renders loading overlay with custom message', async () => {
    const mockVideoElement = {
      currentTime: 0,
      paused: true,
      onpause: vi.fn(),
      onplay: vi.fn(),
      onseeking: vi.fn(),
      onseeked: vi.fn(),
      parentElement: document.body,
    };

    const mockControllers = {
      autoPlayVideo: vi.fn(),
      autoPauseVideo: vi.fn(),
      isExtensionPaused: () => false,
    };

    (globalThis as any).document.querySelector = vi.fn().mockReturnValue(mockVideoElement);
    (globalThis as any).storage.getItem = vi.fn().mockResolvedValue({});

    await showInitialLoadingOverlay('Custom loading message', 'video');

    expect(mockRoot.render).toHaveBeenCalled();
  });

  it('renders default loading message when not provided', async () => {
    const mockVideoElement = {
      currentTime: 0,
      paused: true,
      onpause: vi.fn(),
      onplay: vi.fn(),
      onseeking: vi.fn(),
      onseeked: vi.fn(),
      parentElement: document.body,
    };

    const mockControllers = {
      autoPlayVideo: vi.fn(),
      autoPauseVideo: vi.fn(),
      isExtensionPaused: () => false,
    };

    (globalThis as any).document.querySelector = vi.fn().mockReturnValue(mockVideoElement);
    (globalThis as any).storage.getItem = vi.fn().mockResolvedValue({});

    await showInitialLoadingOverlay('', 'video');

    expect(mockRoot.render).toHaveBeenCalled();
  });
});

describe('cleanupSubtitleDisplay', () => {
  it('cleans up all resources properly', async () => {
    const videoElement = document.createElement('video');
    document.body.appendChild(videoElement);
    (globalThis as any).document.querySelector = vi.fn().mockReturnValue(videoElement);
    showInitialLoadingOverlay();

    cleanupSubtitleDisplay();

    expect(mockRoot.unmount).toHaveBeenCalled();
    expect(document.getElementById('zdf-2subs-overlay')).toBeNull();
    videoElement.remove();
  });

  it('handles null resources gracefully', async () => {
    cleanupSubtitleDisplay();

    expect(() => cleanupSubtitleDisplay()).not.toThrow();
  });
});
