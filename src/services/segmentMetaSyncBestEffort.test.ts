import { describe, expect, it, vi } from 'vitest';
import { scheduleSegmentMetaSyncForUnitIds } from './segmentMetaSyncBestEffort';
import { SegmentMetaService } from './SegmentMetaService';

vi.mock('./SegmentMetaService', () => ({
  SegmentMetaService: {
    syncForUnitIds: vi.fn(),
  },
}));

describe('scheduleSegmentMetaSyncForUnitIds', () => {
  it('logs when sync fails instead of swallowing silently', async () => {
    vi.mocked(SegmentMetaService.syncForUnitIds).mockRejectedValueOnce(new Error('sync boom'));
    scheduleSegmentMetaSyncForUnitIds(['unit-1'], 'test-context');
    await Promise.resolve();
    await Promise.resolve();
    expect(SegmentMetaService.syncForUnitIds).toHaveBeenCalledWith(['unit-1']);
  });
});
