// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { resolveTimelineWheelPanDelta, shouldBypassTimelineWheel } from './useZoom';

describe('shouldBypassTimelineWheel', () => {
  it('allows native wheel scrolling inside textarea editors', () => {
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);

    expect(shouldBypassTimelineWheel(textarea)).toBe(true);
  });

  it('allows native wheel scrolling inside explicitly scrollable descendants', () => {
    const scroller = document.createElement('div');
    scroller.setAttribute('data-allow-native-scroll', 'true');
    const child = document.createElement('span');
    scroller.appendChild(child);
    document.body.appendChild(scroller);

    expect(shouldBypassTimelineWheel(child)).toBe(true);
  });

  it('keeps timeline wheel handling for plain non-scrollable surfaces', () => {
    const div = document.createElement('div');
    document.body.appendChild(div);

    expect(shouldBypassTimelineWheel(div)).toBe(false);
  });

  it('does not bypass due to page-level scroller outside timeline boundary', () => {
    const pageScroller = document.createElement('div');
    pageScroller.style.overflowY = 'auto';
    Object.defineProperty(pageScroller, 'scrollHeight', { value: 400, configurable: true });
    Object.defineProperty(pageScroller, 'clientHeight', { value: 200, configurable: true });

    const timelineBoundary = document.createElement('div');
    const waveformTarget = document.createElement('div');
    timelineBoundary.appendChild(waveformTarget);
    pageScroller.appendChild(timelineBoundary);
    document.body.appendChild(pageScroller);

    expect(shouldBypassTimelineWheel(waveformTarget, timelineBoundary)).toBe(false);
  });
});

describe('resolveTimelineWheelPanDelta', () => {
  it('prefers horizontal delta when horizontal gesture dominates', () => {
    expect(resolveTimelineWheelPanDelta({ deltaX: -120, deltaY: 20 })).toBe(-120);
  });

  it('falls back to vertical delta when vertical movement dominates', () => {
    expect(resolveTimelineWheelPanDelta({ deltaX: -10, deltaY: -80 })).toBe(-80);
  });
});
