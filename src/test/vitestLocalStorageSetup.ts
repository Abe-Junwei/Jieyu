import { beforeEach } from 'vitest';

function hasCompleteStorageApi(storage: Partial<Storage> | undefined): storage is Storage {
  return Boolean(
    storage
      && typeof storage.getItem === 'function'
      && typeof storage.setItem === 'function'
      && typeof storage.removeItem === 'function'
      && typeof storage.clear === 'function'
      && typeof storage.key === 'function',
  );
}

function buildMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return [...store.keys()][index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  };
}

beforeEach(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const current = window.localStorage as Partial<Storage> | undefined;
  if (hasCompleteStorageApi(current)) {
    return;
  }

  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: buildMemoryStorage(),
  });
});