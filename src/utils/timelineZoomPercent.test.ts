import { describe, expect, it } from 'vitest';
import {
  resolveOneToOneZoomPercent,
  resolveTimelineZoomPercentMin,
  timelineZoomPercentFromSlider,
} from './timelineZoomPercent';

describe('timeline zoom percent', () => {
  it('keeps 1:1 below fit-all when the span is already denser than 100 px/s', () => {
    expect(resolveOneToOneZoomPercent(200)).toBe(50);
    expect(resolveTimelineZoomPercentMin(200)).toBe(50);
  });

  it('does not zoom out past fit-all when 1:1 is finer than the whole span', () => {
    expect(resolveOneToOneZoomPercent(40)).toBe(250);
    expect(resolveTimelineZoomPercentMin(40)).toBe(100);
  });

  it('maps the left end of the slider to the minimum percent', () => {
    expect(timelineZoomPercentFromSlider(0, 200, 1600)).toBe(50);
    expect(timelineZoomPercentFromSlider(0, 40, 1600)).toBe(100);
  });
});
