// Mock storage that integrates with globalThis.storage for test compatibility
let getItemValue: unknown | null = null;
let setItemValue: unknown = undefined;

export const storage = {
  getItem: async <T = unknown>(_key: string): Promise<T | null> => {
    // Check if we're in a test environment and use globalThis.storage value if available
    if (typeof globalThis !== 'undefined' && globalThis.storage && globalThis.storage.getItem) {
      try {
        const result = await globalThis.storage.getItem(_key);
        return result ?? null;
      } catch {
        // Fallback to mock behavior
        return null;
      }
    }
    return getItemValue ?? null;
  },
  setItem: async <T = unknown>(_key: string, _value: T): Promise<void> => {
    // Check if we're in a test environment and use globalThis.storage value if available
    if (typeof globalThis !== 'undefined' && globalThis.storage && globalThis.storage.setItem) {
      try {
        await globalThis.storage.setItem(_key, _value);
        return;
      } catch {
        // Fallback to mock behavior
        setItemValue = _value;
      }
    }
    setItemValue = _value;
  },
  watch: <T = unknown>(_key: string, _listener: (value: T) => void): (() => void) | undefined => {
    // Check if we're in a test environment and use globalThis.storage value if available
    if (typeof globalThis !== 'undefined' && globalThis.storage && globalThis.storage.watch) {
      try {
        const watcher = globalThis.storage.watch(_key, _listener);
        return watcher;
      } catch {
        // Fallback to mock behavior
        return () => {};
      }
    }
    return () => {};
  },
};

export const defineContentScript = <T>(value: T) => value;
