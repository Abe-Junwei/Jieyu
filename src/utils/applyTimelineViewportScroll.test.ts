// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import {
  applyTimelineViewportScroll,
  applyTimelineViewportWheelPan,
  clampTierScrollLeftPx,
} from './applyTimelineViewportScroll';

function makeTier(scrollWidth: number, clientWidth: number, scrollLeft = 0) {
  const tier = document.createElement('div');
  Object.defineProperty(tier, 'scrollWidth', { value: scrollWidth, configurable: true });
  Object.defineProperty(tier, 'clientWidth', { value: clientWidth, configurable: true });
  Object.defineProperty(tier, 'scrollLeft', {
    value: scrollLeft,
    configurable: true,
    writable: true,
  });
  return tier;
}

describe('applyTimelineViewportScroll', () => {
  it('clamps tier scroll within bounds', () => {
    const tier = makeTier(1000, 200, 50);
    expect(clampTierScrollLeftPx(tier, 900)).toBe(800);
    expect(clampTierScrollLeftPx(tier, -10)).toBe(0);
  });

  it('uses tier authority for extended-document timelines', () => {
    const tier = makeTier(500, 100);
    const wrapper = document.createElement('div');
    Object.defineProperty(wrapper, 'scrollWidth', { value: 300, configurable: true });
    const ws = {
      setScroll: vi.fn(),
      getScroll: vi.fn(() => 42),
      getWidth: vi.fn(() => 200),
      getWrapper: vi.fn(() => wrapper),
    };
    const result = applyTimelineViewportScroll({
      tier,
      ws: ws as never,
      documentSpanSec: 120,
      mediaDurSec: 30,
      zoomPxPerSec: 10,
      targetScrollLeftPx: 150,
    });
    expect(tier.scrollLeft).toBe(150);
    expect(result.viewportScrollLeftPx).toBe(150);
    expect(ws.setScroll).toHaveBeenCalled();
  });

  it('pans by delta through wheel helper', () => {
    const tier = makeTier(500, 100, 40);
    const result = applyTimelineViewportWheelPan({
      tier,
      ws: null,
      documentSpanSec: 60,
      mediaDurSec: 0,
      zoomPxPerSec: 10,
      deltaPx: 15,
    });
    expect(tier.scrollLeft).toBe(55);
    expect(result.viewportScrollLeftPx).toBe(55);
  });
});
