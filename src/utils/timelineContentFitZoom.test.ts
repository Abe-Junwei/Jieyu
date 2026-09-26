import { describe, expect, it } from 'vitest';
import {
  TIMELINE_CONTENT_FIT_MAX_SCROLL_PX,
  TIMELINE_SEGMENT_TEXT_CHROME_PX,
  TIMELINE_SEGMENT_TEXT_EM_PX,
  estimateTimelineSegmentTextWidthPx,
  flattenTimelineContentFitSegments,
  resolveContentFitPxPerSec,
  resolveContentFitZoomPercent,
} from './timelineContentFitZoom';

describe('timelineContentFitZoom', () => {
  it('sizes a segment from character count plus chrome', () => {
    expect(estimateTimelineSegmentTextWidthPx('  ')).toBe(0);
    expect(estimateTimelineSegmentTextWidthPx('猫')).toBe(
      TIMELINE_SEGMENT_TEXT_CHROME_PX + TIMELINE_SEGMENT_TEXT_EM_PX,
    );
    expect(estimateTimelineSegmentTextWidthPx('ab')).toBe(
      TIMELINE_SEGMENT_TEXT_CHROME_PX + 2 * TIMELINE_SEGMENT_TEXT_EM_PX,
    );
  });

  it('uses the strictest text-to-duration ratio', () => {
    const wide = estimateTimelineSegmentTextWidthPx('hello');
    expect(
      resolveContentFitPxPerSec([
        { startTime: 0, endTime: 10, text: 'hello' },
        { startTime: 10, endTime: 11, text: 'hello' },
        { startTime: 11, endTime: 11, text: 'hello' },
        { startTime: 12, endTime: 14, text: '   ' },
      ]),
    ).toBe(wide / 1);
  });

  it('keeps fit-all when that zoom already fits the text', () => {
    expect(
      resolveContentFitZoomPercent({
        fitPxPerSec: 200,
        fitSpanSec: 30,
        segments: [{ startTime: 0, endTime: 10, text: 'hi' }],
      }),
    ).toBe(100);
  });

  it('raises zoom so the narrowest segment shows its full text', () => {
    const text = 'domestic canine';
    const textWidth = estimateTimelineSegmentTextWidthPx(text);
    const fitPxPerSec = 2;
    const percent = resolveContentFitZoomPercent({
      fitPxPerSec,
      fitSpanSec: 600,
      segments: [{ startTime: 0, endTime: 2, text }],
    });
    expect(percent).toBe(Math.ceil((textWidth / 2 / fitPxPerSec) * 100));
    const zoomPxPerSec = fitPxPerSec * (percent / 100);
    expect(2 * zoomPxPerSec).toBeGreaterThanOrEqual(textWidth);
  });

  it('drops other-media rows when a current media id is set', () => {
    const segments = flattenTimelineContentFitSegments(
      new Map([
        [
          'transcription',
          [
            { startTime: 0, endTime: 1, text: 'here', mediaId: 'media-a' },
            { startTime: 2, endTime: 3, text: 'elsewhere', mediaId: 'media-b' },
          ],
        ],
        ['translation', [{ startTime: 0, endTime: 1, text: 'gloss', mediaId: 'media-a' }]],
      ]),
      'media-a',
    );
    expect(segments.map((segment) => segment.text)).toEqual(['here', 'gloss']);
  });

  it('stops growing once the scroll width hits the layout ceiling', () => {
    const fitSpanSec = 10_000;
    const percent = resolveContentFitZoomPercent({
      fitPxPerSec: 1,
      fitSpanSec,
      segments: [{ startTime: 0, endTime: 0.01, text: 'a very long annotation that cannot fit' }],
    });
    const zoomPxPerSec = 1 * (percent / 100);
    expect(fitSpanSec * zoomPxPerSec).toBeLessThanOrEqual(TIMELINE_CONTENT_FIT_MAX_SCROLL_PX + 1);
  });
});
