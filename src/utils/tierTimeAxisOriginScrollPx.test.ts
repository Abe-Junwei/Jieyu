// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getTierTimeAxisOriginScrollPx,
  getTierTimelineContentPaddingToInnerOffsetPx,
  getTierTimelineInnerOriginScrollPx,
} from './tierTimeAxisOriginScrollPx';

describe('getTierTimeAxisOriginScrollPx', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns padding-left + border-left offset from scroll container to time axis', () => {
    const tier = document.createElement('div');
    document.body.appendChild(tier);
    Object.defineProperty(tier, 'scrollLeft', { value: 50, writable: true, configurable: true });
    vi.spyOn(tier, 'getBoundingClientRect').mockReturnValue({
      left: 10,
      top: 0,
      right: 810,
      bottom: 100,
      width: 800,
      height: 100,
      x: 10,
      y: 0,
      toJSON: () => {},
    } as DOMRect);

    const tc = document.createElement('div');
    tc.className = 'timeline-content';
    tc.style.paddingLeft = '88px';
    tc.style.borderLeftWidth = '2px';
    tc.style.borderLeftStyle = 'solid';
    tier.appendChild(tc);

    vi.spyOn(tc, 'getBoundingClientRect').mockReturnValue({
      left: 10,
      top: 0,
      right: 810,
      bottom: 100,
      width: 800,
      height: 100,
      x: 10,
      y: 0,
      toJSON: () => {},
    } as DOMRect);

    const origin = getTierTimeAxisOriginScrollPx(tier);
    // (tcRect.left + border + pad) - tierRect.left + scrollLeft = (10+2+88)-10+50 = 140
    expect(origin).toBeCloseTo(140, 5);
    const inner = getTierTimelineInnerOriginScrollPx(tier);
    expect(inner.x).toBeCloseTo(140, 5);
    expect(inner.y).toBeCloseTo(0, 5);
    tier.remove();
  });

  it('padding-to-inner offset matches border + padding for overlay alignment', () => {
    const tc = document.createElement('div');
    tc.className = 'timeline-content';
    tc.style.paddingLeft = '96px';
    tc.style.paddingTop = '3px';
    tc.style.borderLeftWidth = '2px';
    tc.style.borderTopWidth = '0';
    tc.style.borderLeftStyle = 'solid';
    document.body.appendChild(tc);
    const off = getTierTimelineContentPaddingToInnerOffsetPx(tc);
    expect(off.x).toBeCloseTo(98, 5);
    expect(off.y).toBeCloseTo(3, 5);
    tc.remove();
  });
});
