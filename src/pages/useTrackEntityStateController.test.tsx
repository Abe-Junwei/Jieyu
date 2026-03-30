// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useTrackEntityStateController } from './useTrackEntityStateController';

const { mockLoadTrackEntityStateMapFromDb } = vi.hoisted(() => ({
  mockLoadTrackEntityStateMapFromDb: vi.fn<() => Promise<Record<string, { mode: 'single'; laneLockMap: Record<string, number>; updatedAt: string }>>>(
    async () => ({}),
  ),
}));

vi.mock('../services/TrackEntityStore', async () => {
  const actual = await vi.importActual<typeof import('../services/TrackEntityStore')>('../services/TrackEntityStore');
  return {
    ...actual,
    loadTrackEntityStateMapFromDb: mockLoadTrackEntityStateMapFromDb,
  };
});

describe('useTrackEntityStateController', () => {
  beforeEach(() => {
    mockLoadTrackEntityStateMapFromDb.mockReset();
    mockLoadTrackEntityStateMapFromDb.mockResolvedValue({});
  });

  it('does not rehydrate repeatedly when no media is selected and parent rerenders', async () => {
    const setTranscriptionTrackMode = vi.fn();

    const { result, rerender } = renderHook(
      ({ activeTextId, selectedTimelineMediaId }: { activeTextId: string | null; selectedTimelineMediaId: string | null }) => useTrackEntityStateController({
        activeTextId,
        selectedTimelineMediaId,
        setTranscriptionTrackMode,
      }),
      {
        initialProps: {
          activeTextId: 'text-1',
          selectedTimelineMediaId: null,
        },
      },
    );

    expect(result.current.laneLockMap).toEqual({});
    expect(setTranscriptionTrackMode).toHaveBeenCalledTimes(1);
    expect(setTranscriptionTrackMode).toHaveBeenLastCalledWith('single');

    await waitFor(() => {
      expect(mockLoadTrackEntityStateMapFromDb).toHaveBeenCalledTimes(1);
    });

    rerender({
      activeTextId: 'text-1',
      selectedTimelineMediaId: null,
    });

    expect(result.current.laneLockMap).toEqual({});
    expect(setTranscriptionTrackMode).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      expect(mockLoadTrackEntityStateMapFromDb).toHaveBeenCalledTimes(1);
    });
  });
});