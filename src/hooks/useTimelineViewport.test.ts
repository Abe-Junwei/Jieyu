// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import type { MutableRefObject } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type WaveSurfer from 'wavesurfer.js';
import { useTimelineViewport } from './useTimelineViewport';

describe('useTimelineViewport', () => {
  it('exposes projection scalars and scroll aligned with input', () => {
    const waveCanvasRef: MutableRefObject<HTMLDivElement | null> = { current: document.createElement('div') };
    const tierContainerRef: MutableRefObject<HTMLDivElement | null> = { current: document.createElement('div') };
    const playerInstanceRef: MutableRefObject<WaveSurfer | null> = { current: null };
    const setZoomPercent = vi.fn();
    const setZoomMode = vi.fn();

    const { result } = renderHook(() => useTimelineViewport({
      waveCanvasRef,
      tierContainerRef,
      playerInstanceRef,
      playerIsReady: false,
      playerDuration: 0,
      playerCurrentTime: 0,
      playerIsPlaying: false,
      selectedMediaUrl: undefined,
      zoomPercent: 100,
      setZoomPercent,
      setZoomMode,
      fitPxPerSec: 40,
      maxZoomPercent: 500,
      zoomPxPerSec: 40,
      logicalTimelineDurationSec: 60,
      waveformScrollLeft: 12,
    }));

    expect(result.current.projection.zoomPxPerSec).toBe(40);
    expect(result.current.projection.logicalTimelineDurationSec).toBe(60);
    expect(result.current.projection.zoomPercent).toBe(100);
    expect(result.current.projection.maxZoomPercent).toBe(500);
    expect(result.current.projection.fitPxPerSec).toBe(40);
    expect(result.current.projection.waveformScrollLeft).toBe(12);
    expect(typeof result.current.zoomToPercent).toBe('function');
    expect(typeof result.current.zoomToUnit).toBe('function');
  });
});
