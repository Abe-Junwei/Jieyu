import { describe, expect, it, vi } from 'vitest';
import {
  finishSegmentLayerWrite,
  refreshSegmentLayerView,
  runSegmentLayerWriteReload,
  type SegmentViewRefreshPending,
} from './segmentLayerWriteReload';

function pendingView() {
  return { current: null as SegmentViewRefreshPending | null };
}

describe('runSegmentLayerWriteReload', () => {
  it('returns the write result and refreshes the snapshot when the generation is unchanged', async () => {
    const generation = { current: 0 };
    const reloadSegments = vi.fn(async () => undefined);
    const refreshSegmentUndoSnapshot = vi.fn(async () => undefined);
    const outcome = await runSegmentLayerWriteReload({
      generation,
      pendingView: pendingView(),
      reloadSegments,
      refreshSegmentUndoSnapshot,
      write: async () => 'kept',
    });
    expect(outcome).toEqual({ status: 'applied', value: 'kept' });
    expect(generation.current).toBe(1);
    expect(reloadSegments).toHaveBeenCalledOnce();
    expect(refreshSegmentUndoSnapshot).toHaveBeenCalledOnce();
  });

  it('skips the snapshot refresh when the generation changes', async () => {
    const generation = { current: 0 };
    const refreshSegmentUndoSnapshot = vi.fn(async () => undefined);
    const outcome = await runSegmentLayerWriteReload({
      generation,
      pendingView: pendingView(),
      reloadSegments: async () => {
        generation.current += 1;
      },
      refreshSegmentUndoSnapshot,
      write: async () => 'dropped',
    });
    expect(outcome).toEqual({ status: 'superseded' });
    expect(refreshSegmentUndoSnapshot).not.toHaveBeenCalled();
  });

  it('does not refresh the snapshot when the write throws', async () => {
    const generation = { current: 0 };
    const reloadSegments = vi.fn(async () => undefined);
    const refreshSegmentUndoSnapshot = vi.fn(async () => undefined);
    await expect(
      runSegmentLayerWriteReload({
        generation,
        pendingView: pendingView(),
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

  it('reports a landed write when the view reload throws and skips the snapshot', async () => {
    const generation = { current: 0 };
    const refreshSegmentUndoSnapshot = vi.fn(async () => undefined);
    const outcome = await runSegmentLayerWriteReload({
      generation,
      pendingView: pendingView(),
      reloadSegments: async () => {
        throw new Error('reload failed');
      },
      refreshSegmentUndoSnapshot,
      write: async () => 'kept',
    });
    expect(outcome).toEqual({ status: 'viewStale', value: 'kept', generation: 1 });
    expect(refreshSegmentUndoSnapshot).not.toHaveBeenCalled();
  });

  it('still rejects when the undo snapshot refresh throws after the view reloaded', async () => {
    await expect(
      runSegmentLayerWriteReload({
        generation: { current: 0 },
        pendingView: pendingView(),
        reloadSegments: async () => undefined,
        refreshSegmentUndoSnapshot: async () => {
          throw new Error('snapshot failed');
        },
        write: async () => 'kept',
      }),
    ).rejects.toThrow('snapshot failed');
  });
});

describe('refreshSegmentLayerView', () => {
  it('reloads without writing and then refreshes the snapshot', async () => {
    const write = vi.fn();
    const refreshSegmentUndoSnapshot = vi.fn(async () => undefined);
    const result = await refreshSegmentLayerView({
      generation: { current: 4 },
      expectedGeneration: 4,
      reloadSegments: async () => undefined,
      refreshSegmentUndoSnapshot,
    });
    expect(result).toBe('applied');
    expect(write).not.toHaveBeenCalled();
    expect(refreshSegmentUndoSnapshot).toHaveBeenCalledOnce();
  });

  it('does nothing when the generation has already moved', async () => {
    const reloadSegments = vi.fn(async () => undefined);
    const refreshSegmentUndoSnapshot = vi.fn(async () => undefined);
    const result = await refreshSegmentLayerView({
      generation: { current: 5 },
      expectedGeneration: 4,
      reloadSegments,
      refreshSegmentUndoSnapshot,
    });
    expect(result).toBe('superseded');
    expect(reloadSegments).not.toHaveBeenCalled();
    expect(refreshSegmentUndoSnapshot).not.toHaveBeenCalled();
  });

  it('stays view-stale when the reload throws again', async () => {
    const refreshSegmentUndoSnapshot = vi.fn(async () => undefined);
    const result = await refreshSegmentLayerView({
      generation: { current: 4 },
      expectedGeneration: 4,
      reloadSegments: async () => {
        throw new Error('reload failed');
      },
      refreshSegmentUndoSnapshot,
    });
    expect(result).toBe('viewStale');
    expect(refreshSegmentUndoSnapshot).not.toHaveBeenCalled();
  });
});

describe('finishSegmentLayerWrite', () => {
  it('defers the follow-up until a later refresh when the view is stale', () => {
    const followUp = vi.fn();
    const noteViewStale = vi.fn();
    const recordSuccess = vi.fn();
    const written = finishSegmentLayerWrite({
      outcome: { status: 'viewStale', value: 'kept', generation: 3 },
      noteViewStale,
      actionLabel: '拆分句段',
      failureKey: 'transcription.error.action.segmentSplitFailed',
      recordSuccess,
      followUp,
    });
    expect(written).toBe('kept');
    expect(followUp).not.toHaveBeenCalled();
    expect(recordSuccess).toHaveBeenCalledOnce();
    expect(noteViewStale).toHaveBeenCalledOnce();
    noteViewStale.mock.calls[0]?.[0].apply();
    expect(followUp).toHaveBeenCalledWith('kept');
  });
});
