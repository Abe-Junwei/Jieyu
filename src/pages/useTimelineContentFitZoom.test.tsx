// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { useMemo, useState } from 'react';
import { describe, expect, it } from 'vitest';
import { useTimelineContentFitZoom } from './useTimelineContentFitZoom';

function useHarness(input: {
  text: string;
  zoomMode: 'fit-all' | 'fit-selection' | 'custom';
  fitPxPerSec: number;
  containerWidth: number;
}) {
  const [zoomPercent, setZoomPercent] = useState(100);
  const byLayer = useMemo(
    () =>
      new Map([
        ['transcription', [{ startTime: 0, endTime: 1, text: input.text, mediaId: 'media-a' }]],
      ]),
    [input.text],
  );
  const contentFitZoomPercent = useTimelineContentFitZoom({
    zoomMode: input.zoomMode,
    zoomPercent,
    setZoomPercent,
    fitPxPerSec: input.fitPxPerSec,
    fitSpanSec: 30,
    containerWidth: input.containerWidth,
    byLayer,
    currentMediaId: 'media-a',
  });
  return { zoomPercent, setZoomPercent, contentFitZoomPercent };
}

describe('useTimelineContentFitZoom', () => {
  it('raises the default fit-all zoom so the segment can show its text', () => {
    const { result } = renderHook(() =>
      useHarness({
        text: 'domestic canine',
        zoomMode: 'fit-all',
        fitPxPerSec: 2,
        containerWidth: 60,
      }),
    );
    expect(result.current.zoomPercent).toBe(result.current.contentFitZoomPercent);
    expect(result.current.zoomPercent).toBeGreaterThan(100);
  });

  it('keeps toolbar fit-all at 100% after the default raise', () => {
    const { result } = renderHook(() =>
      useHarness({
        text: 'domestic canine',
        zoomMode: 'fit-all',
        fitPxPerSec: 2,
        containerWidth: 60,
      }),
    );
    const raised = result.current.zoomPercent;
    expect(raised).toBeGreaterThan(100);
    act(() => {
      result.current.setZoomPercent(100);
    });
    expect(result.current.zoomPercent).toBe(100);
  });

  it('does not raise zoom outside fit-all mode', () => {
    const { result } = renderHook(() =>
      useHarness({
        text: 'domestic canine',
        zoomMode: 'custom',
        fitPxPerSec: 2,
        containerWidth: 60,
      }),
    );
    expect(result.current.contentFitZoomPercent).toBeGreaterThan(100);
    expect(result.current.zoomPercent).toBe(100);
  });

  it('tracks a narrower viewport while the raised fit-all zoom is still active', () => {
    const { result, rerender } = renderHook(
      (props: { fitPxPerSec: number; containerWidth: number }) =>
        useHarness({
          text: 'domestic canine',
          zoomMode: 'fit-all',
          fitPxPerSec: props.fitPxPerSec,
          containerWidth: props.containerWidth,
        }),
      { initialProps: { fitPxPerSec: 4, containerWidth: 120 } },
    );
    const wider = result.current.zoomPercent;
    expect(wider).toBeGreaterThan(100);
    rerender({ fitPxPerSec: 2, containerWidth: 60 });
    expect(result.current.zoomPercent).toBeGreaterThan(wider);
  });
});
