// Mock storage that integrates with globalThis.storage for test compatibility
let getItemValue: string | null = null;
let setItemValue: string | undefined = undefined;

// Type guard to check if we're in a test environment
function isTestEnvironment(): boolean {
  return (globalThis as any).storage !== undefined;
}

export const storage = {
  getItem: async (_key: string): Promise<string | null> => {
    // Check if we're in a test environment and use globalThis.storage value if available
    if (isTestEnvironment() && (globalThis as any).storage.getItem) {
      try {
        const result = await (globalThis as any).storage.getItem(_key);
        return result ?? null;
      } catch {
        // Fallback to mock behavior
        return null;
      }
    }
    return getItemValue ?? null;
  },
  setItem: async (_key: string, _value: string): Promise<void> => {
    // Check if we're in a test environment and use globalThis.storage value if available
    if (isTestEnvironment() && (globalThis as any).storage.setItem) {
      try {
        await (globalThis as any).storage.setItem(_key, _value);
        return;
      } catch {
        // Fallback to mock behavior
        setItemValue = _value;
      }
    }
    setItemValue = _value;
  },
  watch: (_key: string, _listener: (value: string) => void): (() => void) | undefined => {
    // Check if we're in a test environment and use globalThis.storage value if available
    if (isTestEnvironment() && (globalThis as any).storage.watch) {
      try {
        const watcher = (globalThis as any).storage.watch(_key, _listener);
        return watcher;
      } catch {
        // Fallback to mock behavior
        return () => {};
      }
    }
    return () => {};
  },
};

export const defineContentScript = (_value: string) => _value;
