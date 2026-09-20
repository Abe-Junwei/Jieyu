import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requestPersistentStorage } from './requestPersistentStorage';

describe('requestPersistentStorage', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns null when StorageManager.persist is missing', async () => {
    vi.stubGlobal('navigator', {});
    await expect(requestPersistentStorage()).resolves.toBeNull();
  });

  it('returns the persist() result when supported', async () => {
    const persist = vi.fn(async () => true);
    vi.stubGlobal('navigator', { storage: { persist } });
    await expect(requestPersistentStorage()).resolves.toBe(true);
    expect(persist).toHaveBeenCalledTimes(1);
  });
});
