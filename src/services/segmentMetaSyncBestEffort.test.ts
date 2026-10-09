import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  scheduleSegmentMetaSyncForUnitIds,
  settleSegmentMetaSync,
} from './segmentMetaSyncBestEffort';
import { SegmentMetaService } from './SegmentMetaService';

const warnMock = vi.hoisted(() => vi.fn());

vi.mock('../observability/logger', () => ({
  createLogger: () => ({
    warn: warnMock,
  }),
}));

vi.mock('./SegmentMetaService', () => ({
  SegmentMetaService: {
    syncForUnitIds: vi.fn(),
  },
}));

describe('scheduleSegmentMetaSyncForUnitIds', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(SegmentMetaService.syncForUnitIds).mockResolvedValue(undefined);
    warnMock.mockClear();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.mocked(SegmentMetaService.syncForUnitIds).mockReset();
  });

  it('micro-batches pending unit ids and dedupes repeated ids', async () => {
    scheduleSegmentMetaSyncForUnitIds(['unit-1', 'unit-2'], 'first-source');
    scheduleSegmentMetaSyncForUnitIds(['unit-2', 'unit-3'], 'second-source');

    expect(SegmentMetaService.syncForUnitIds).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(50);

    expect(SegmentMetaService.syncForUnitIds).toHaveBeenCalledTimes(1);
    expect(SegmentMetaService.syncForUnitIds).toHaveBeenCalledWith(['unit-1', 'unit-2', 'unit-3']);
  });

  it('ignores empty ids without scheduling work', async () => {
    scheduleSegmentMetaSyncForUnitIds(['', '   '], 'empty-source');

    await vi.advanceTimersByTimeAsync(50);

    expect(SegmentMetaService.syncForUnitIds).not.toHaveBeenCalled();
  });

  it('logs when sync fails instead of swallowing silently', async () => {
    vi.mocked(SegmentMetaService.syncForUnitIds).mockRejectedValueOnce(new Error('sync boom'));
    scheduleSegmentMetaSyncForUnitIds(['unit-1'], 'test-context');

    await vi.advanceTimersByTimeAsync(50);

    expect(SegmentMetaService.syncForUnitIds).toHaveBeenCalledWith(['unit-1']);
    expect(warnMock).toHaveBeenCalledWith('SegmentMeta sync failed (best-effort)', {
      contexts: ['test-context'],
      unitIdCount: 1,
      error: 'sync boom',
    });
  });

  it('settleSegmentMetaSync flushes pending ids and waits for the in-flight sync (BF1-N7)', async () => {
    let finish: () => void = () => {};
    let done = false;
    vi.mocked(SegmentMetaService.syncForUnitIds).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = () => {
            done = true;
            resolve();
          };
        }),
    );
    scheduleSegmentMetaSyncForUnitIds(['unit-9'], 'settle-context');

    const settled = settleSegmentMetaSync();
    // 不等 50ms 定时器即已发起 | started without waiting for the 50 ms timer
    expect(SegmentMetaService.syncForUnitIds).toHaveBeenCalledWith(['unit-9']);
    let settledYet = false;
    void settled.then(() => {
      settledYet = true;
    });
    await Promise.resolve();
    expect(settledYet).toBe(false);
    finish();
    await settled;
    expect(done).toBe(true);
    await vi.advanceTimersByTimeAsync(50);
    expect(SegmentMetaService.syncForUnitIds).toHaveBeenCalledTimes(1);
  });

  it('settleSegmentMetaSync resolves immediately when idle and survives a failed sync', async () => {
    await settleSegmentMetaSync();
    vi.mocked(SegmentMetaService.syncForUnitIds).mockRejectedValueOnce(new Error('boom'));
    scheduleSegmentMetaSyncForUnitIds(['unit-1'], 'fail-context');
    await expect(settleSegmentMetaSync()).resolves.toBeUndefined();
    expect(warnMock).toHaveBeenCalled();
  });
});
