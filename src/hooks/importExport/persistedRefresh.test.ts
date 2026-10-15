import { describe, expect, it, vi } from 'vitest';
import { projectArchiveImportStored, settlePersistedRefresh } from './persistedRefresh';

describe('settlePersistedRefresh', () => {
  it('reports a finished write when the refresh throws, and retry does not run the write', async () => {
    const write = vi.fn(() => 'stored');
    const refresh = vi.fn(async (): Promise<void> => {
      throw new Error('snapshot read failed');
    });
    const settled = await settlePersistedRefresh(write(), refresh);
    expect(write).toHaveBeenCalledTimes(1);
    expect(settled.kind).toBe('written-refresh-pending');
    if (settled.kind !== 'written-refresh-pending') return;
    refresh.mockRejectedValueOnce(new Error('snapshot read failed'));
    refresh.mockResolvedValueOnce(undefined);
    const retried = await settled.retryRefresh();
    expect(write).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(retried.kind).toBe('written-refresh-pending');
    if (retried.kind !== 'written-refresh-pending') return;
    const refreshed = await retried.retryRefresh();
    expect(write).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(3);
    expect(refreshed).toEqual({ kind: 'written-refreshed', value: 'stored' });
  });
});

describe('projectArchiveImportStored', () => {
  it('keeps a boolean mock and treats an unconfirmed write as not stored', () => {
    expect(projectArchiveImportStored(true)).toBe(true);
    expect(projectArchiveImportStored(false)).toBe(false);
    expect(projectArchiveImportStored({ kind: 'written-refreshed' })).toBe(true);
    expect(
      projectArchiveImportStored({
        kind: 'written-refresh-pending',
        retryRefresh: async () => ({ kind: 'written-refreshed' }),
      }),
    ).toBe(true);
    expect(projectArchiveImportStored({ kind: 'write-unconfirmed' })).toBe(false);
  });
});
