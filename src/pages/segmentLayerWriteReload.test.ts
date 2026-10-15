import { describe, expect, it, vi } from 'vitest';
import { runSegmentLayerWriteReload } from './segmentLayerWriteReload';

describe('runSegmentLayerWriteReload', () => {
  it('returns the write result and refreshes the snapshot when the generation is unchanged', async () => {
    const generation = { current: 0 };
    const reloadSegments = vi.fn(async () => undefined);
    const refreshSegmentUndoSnapshot = vi.fn(async () => undefined);
    const outcome = await runSegmentLayerWriteReload({
      generation,
      reloadSegments,
      refreshSegmentUndoSnapshot,
      write: async () => 'kept',
    });
    expect(outcome).toEqual({ stale: false, value: 'kept' });
    expect(generation.current).toBe(1);
    expect(reloadSegments).toHaveBeenCalledOnce();
    expect(refreshSegmentUndoSnapshot).toHaveBeenCalledOnce();
  });

  it('skips the snapshot refresh when the generation changes', async () => {
    const generation = { current: 0 };
    const refreshSegmentUndoSnapshot = vi.fn(async () => undefined);
    const outcome = await runSegmentLayerWriteReload({
      generation,
      reloadSegments: async () => {
        generation.current += 1;
      },
      refreshSegmentUndoSnapshot,
      write: async () => 'dropped',
    });
    expect(outcome).toEqual({ stale: true });
    expect(refreshSegmentUndoSnapshot).not.toHaveBeenCalled();
  });

  it('does not refresh the snapshot when the write throws', async () => {
    const generation = { current: 0 };
    const reloadSegments = vi.fn(async () => undefined);
    const refreshSegmentUndoSnapshot = vi.fn(async () => undefined);
    await expect(
      runSegmentLayerWriteReload({
        generation,
        reloadSegments,
        refreshSegmentUndoSnapshot,
        write: async () => {
          throw new Error('split failed');
        },
      }),
    ).rejects.toThrow('split failed');
    expect(generation.current).toBe(1);
    expect(reloadSegments).not.toHaveBeenCalled();
    expect(refreshSegmentUndoSnapshot).not.toHaveBeenCalled();
  });
});
