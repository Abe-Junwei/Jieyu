// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PERSIST_RECORD_KEY,
  readPersistRecord,
  readStorageDiagnostics,
  requestPersistAtStartup,
  requestPersistOnGesture,
} from './storageDurability';

const persist = vi.fn<() => Promise<boolean>>();
const persisted = vi.fn<() => Promise<boolean>>();
const estimate = vi.fn(async () => ({ usage: 2 * 1024 * 1024, quota: 100 * 1024 * 1024 }));

beforeEach(() => {
  localStorage.removeItem(PERSIST_RECORD_KEY);
  persist.mockReset().mockResolvedValue(false);
  persisted.mockReset().mockResolvedValue(false);
  vi.stubGlobal('navigator', { ...navigator, storage: { persist, persisted, estimate } });
});
afterEach(() => vi.unstubAllGlobals());

describe('storageDurability (T44)', () => {
  it('asks once on the first import/save gesture and records the outcome', async () => {
    await expect(requestPersistOnGesture('import')).resolves.toMatchObject({
      outcome: 'denied',
      trigger: 'import',
    });
    await requestPersistOnGesture('save');
    expect(persist).toHaveBeenCalledTimes(1);
    expect(readPersistRecord()).toMatchObject({ trigger: 'import', outcome: 'denied' });

    // 手动按钮总是再问 | The manual button always asks again
    persist.mockResolvedValueOnce(true);
    await expect(requestPersistOnGesture('manual')).resolves.toMatchObject({ outcome: 'granted' });
    expect(persist).toHaveBeenCalledTimes(2);
  });

  it('a startup attempt does not count as the gesture request, and never overwrites one', async () => {
    await requestPersistAtStartup();
    expect(readPersistRecord()).toMatchObject({ trigger: 'startup' });
    await requestPersistOnGesture('import');
    expect(persist).toHaveBeenCalledTimes(2);
    await requestPersistAtStartup();
    expect(readPersistRecord()).toMatchObject({ trigger: 'import' });
  });

  it('records unsupported and errors instead of throwing', async () => {
    persist.mockRejectedValueOnce(new Error('boom'));
    await expect(requestPersistOnGesture('import')).resolves.toMatchObject({
      outcome: 'error',
      error: 'boom',
    });
    vi.stubGlobal('navigator', { ...navigator, storage: undefined });
    await expect(requestPersistOnGesture('import')).resolves.toMatchObject({
      outcome: 'unsupported',
    });
  });

  it('reads estimate and persisted for the diagnostics panel', async () => {
    await expect(readStorageDiagnostics()).resolves.toEqual({
      usageBytes: 2 * 1024 * 1024,
      quotaBytes: 100 * 1024 * 1024,
      persisted: false,
      lastPersistRequest: null,
    });
  });
});
