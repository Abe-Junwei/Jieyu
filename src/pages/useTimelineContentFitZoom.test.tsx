// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { useMemo, useState } from 'react';
import { describe, expect, it } from 'vitest';
import { useTimelineContentFitZoom } from './useTimelineContentFitZoom';

function useHarness(input: { text: string; fitPxPerSec: number }) {
  const [zoomPercent] = useState(100);
  const byLayer = useMemo(
    () =>
      new Map([
        ['transcription', [{ startTime: 0, endTime: 1, text: input.text, mediaId: 'media-a' }]],
      ]),
    [input.text],
  );
  const contentFitZoomPercent = useTimelineContentFitZoom({
    fitPxPerSec: input.fitPxPerSec,
    fitSpanSec: 30,
    byLayer,
    currentMediaId: 'media-a',
  });
  return { zoomPercent, contentFitZoomPercent };
}

describe('useTimelineContentFitZoom', () => {
  it('reports a higher density for the slider without changing fit-all', () => {
    const { result } = renderHook(() =>
      useHarness({
        text: 'domestic canine',
        fitPxPerSec: 2,
      }),
    );
    expect(result.current.contentFitZoomPercent).toBeGreaterThan(100);
    expect(result.current.zoomPercent).toBe(100);
  });
});
