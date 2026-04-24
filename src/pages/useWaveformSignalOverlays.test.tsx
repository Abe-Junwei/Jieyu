// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useWaveformSignalOverlays } from './useWaveformSignalOverlays';

describe('useWaveformSignalOverlays', () => {
  it('does not report overlap when only one visible waveform item exists', () => {
    const { result } = renderHook(() => useWaveformSignalOverlays({
      unitsOnCurrentMedia: [
        { id: 'unit-1', startTime: 0, endTime: 3, ai_metadata: { confidence: 0.96 } },
        { id: 'hidden-translation-row', startTime: 0, endTime: 3, ai_metadata: { confidence: 0.96 } },
      ],
      waveformTimelineItems: [
        { id: 'unit-1', startTime: 0, endTime: 3 },
      ],
      activeLayerIdForEdits: 'layer-1',
      resolveNoteIndicatorTarget: vi.fn(() => null),
      zoomPxPerSec: 100,
    }));

    expect(result.current.waveformOverlapOverlays).toEqual([]);
  });
});
