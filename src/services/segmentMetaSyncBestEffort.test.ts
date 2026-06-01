import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { scheduleSegmentMetaSyncForUnitIds } from './segmentMetaSyncBestEffort';
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
});
