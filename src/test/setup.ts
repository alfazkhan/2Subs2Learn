import '@testing-library/jest-dom';
import { vi } from 'vitest';
import { storage as originalStorage } from './wxt-imports';

// Extend globalThis types for testing
declare global {
  interface GlobalThis {
    storage: {
      getItem: (key: string) => Promise<string | null>;
      setItem: (key: string, value: unknown) => Promise<void>;
      watch: (key: string, listener: (value: string) => void) => (() => void) | undefined;
    };
  }
}

// Mock react-dom/client for React component rendering tests
vi.mock('react-dom/client', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    createRoot: vi.fn((container) => ({
      render: vi.fn(() => {}),
      unmount: vi.fn(),
    })),
  };
});

// Create spy functions for storage methods that tests can mock via vi.mocked
const getItemSpy = vi.fn();
const setItemSpy = vi.fn();
const watchSpy = vi.fn();

// Directly assign storage to globalThis so tests can access it via globalThis.storage.getItem
(globalThis as any).storage = {
  getItem: getItemSpy,
  setItem: setItemSpy,
  watch: watchSpy,
};

Object.defineProperty(window, 'ytInitialPlayerResponse', {
  value: {
    captions: {
      playerCaptionsTracklistRenderer: {
        captionTracks: [],
      },
    },
  },
  configurable: true,
  writable: true,
});

globalThis.fetch = vi.fn();

// Mock browser APIs
const mockSendMessage = vi.fn();
const mockTabsGet = vi.fn();
(globalThis as any).browser = {
  runtime: {
    sendMessage: mockSendMessage,
  },
  tabs: {
    get: mockTabsGet,
    query: vi.fn(),
  },
};

// Mock requestTranslations for translation engine
const mockTranslationEngine = {
  max_background_request: 5,
  prefetch_request_chunks: 3,
  requestTranslations: vi.fn(),
};
(globalThis as any).requestTranslations = mockTranslationEngine.requestTranslations;

// Export spies for test files to import
export { getItemSpy, setItemSpy, watchSpy };
export { mockTabsGet };
export { mockSendMessage };
export { mockTranslationEngine };

// Mock chrome.offsendDocumentMessage if available
if (typeof chrome !== 'undefined' && chrome.offscreen) {
  (chrome as any).offsendDocumentMessage = vi.fn();
}

// Mock global functions
vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key: string) => {
  const mocks: Record<string, any> = {
    'local:isExtensionPaused': false,
    'local:currentPlatform': 'YOUTUBE',
    'local:currentVideoID': 'dQw4w9WgXcQ',
    'local:availableTracks': '[]',
    'local:translationPref': JSON.stringify({ sourceLang: 'en', targetLang: 'de' }),
    'local:sourceFontSize': 22,
    'local:targetFontSize': 16,
    'local:windowWidth': 80,
    'local:verticalPosition': 8,
    'local:modelDownloadProgress': JSON.stringify({ status: 'downloading', progress: 50 })
  };

  return mocks[key] ?? null;
});

vi.spyOn(Storage.prototype, 'setItem').mockImplementation((_key: string, _value: any) => {
  return Promise.resolve();
});

vi.spyOn(window, 'addEventListener').mockImplementation((_type: string, _listener: any) => {
  return undefined;
});

vi.spyOn(window, 'removeEventListener').mockImplementation((_type: string, _listener: any) => {
  return undefined;
});