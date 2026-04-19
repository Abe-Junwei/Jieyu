// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useReadyWorkspaceAxisStatus } from './useReadyWorkspaceAxisStatus';

const noop = () => {};
const noopSetSaveState = (_state: { kind: 'done'; message: string } | { kind: 'error'; message: string }) => {};

function baseInput(overrides: Partial<Parameters<typeof useReadyWorkspaceAxisStatus>[0]> = {}) {
  return {
    timelineTopProps: { headerProps: {} },
    selectedMediaUrl: null as string | null,
    isResizingWaveform: false,
    handleWaveformResizeStart: noop,
    layersCount: 1,
    playerIsReady: false,
    playerDuration: 0,
    selectedTimelineMedia: {
      filename: 'document-placeholder.track',
      details: { placeholder: true, timelineMode: 'document' as const },
    },
    unitsOnCurrentMedia: [] as Array<{ endTime: number }>,
    locale: 'en-US' as const,
    loadSnapshot: async () => {},
    setSaveState: noopSetSaveState,
    ...overrides,
  } satisfies Parameters<typeof useReadyWorkspaceAxisStatus>[0];
}

describe('useReadyWorkspaceAxisStatus', () => {
  it('omits axis strip for placeholder logical-axis media row', () => {
    const { result } = renderHook(() => useReadyWorkspaceAxisStatus(baseInput()));

    expect(result.current.timelineTopPropsWithAxisStatus.axisStatus).toBeUndefined();
  });

  it('still surfaces decoding state when acoustic URL is pending', () => {
    const { result } = renderHook(() => useReadyWorkspaceAxisStatus(baseInput({
      selectedMediaUrl: 'blob:decoding',
      playerIsReady: false,
      playerDuration: 0,
      selectedTimelineMedia: {
        filename: 'clip.wav',
        details: { audioBlob: new Blob(['x'], { type: 'audio/wav' }), timelineKind: 'acoustic' as const },
      },
    })));

    const axis = result.current.timelineTopPropsWithAxisStatus.axisStatus;
    expect(axis?.hint).toEqual({ kind: 'acoustic_decoding' });
  });
});
