// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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
  it('attaches importAcoustic when no_playable_media and importFileRef is provided', () => {
    const click = vi.fn();
    const importFileRef = { current: { click } as unknown as HTMLInputElement };

    const { result } = renderHook(() => useReadyWorkspaceAxisStatus(baseInput({ importFileRef })));

    const axis = result.current.timelineTopPropsWithAxisStatus.axisStatus;
    expect(axis?.hint).toEqual({ kind: 'no_playable_media', sub: 'placeholder' });
    expect(axis?.importAcoustic).toBeDefined();
    axis?.importAcoustic?.onPress();
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('omits importAcoustic when importFileRef is absent', () => {
    const { result } = renderHook(() => useReadyWorkspaceAxisStatus(baseInput()));

    const axis = result.current.timelineTopPropsWithAxisStatus.axisStatus;
    expect(axis?.hint.kind).toBe('no_playable_media');
    expect(axis?.importAcoustic).toBeUndefined();
  });

  it('omits importAcoustic when hint is acoustic_decoding', () => {
    const click = vi.fn();
    const importFileRef = { current: { click } as unknown as HTMLInputElement };

    const { result } = renderHook(() => useReadyWorkspaceAxisStatus(baseInput({
      importFileRef,
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
    expect(axis?.importAcoustic).toBeUndefined();
  });
});
