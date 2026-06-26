// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import {
  applyTierScrollToWaveSurfer,
  isExtendedDocumentTimeline,
  syncWaveScrollToTier,
  syncWaveScrollToTierOverlayLeft,
} from './waveformTierScrollSync';

function mockWaveSurfer(input: { width?: number; scrollWidth?: number; scroll?: number }) {
  const wrapper = document.createElement('div');
  Object.defineProperty(wrapper, 'scrollWidth', {
    configurable: true,
    value: input.scrollWidth ?? 1000,
  });
  let scroll = input.scroll ?? 0;
  return {
    getWidth: () => input.width ?? 200,
    getWrapper: () => wrapper,
    getScroll: () => scroll,
    setScroll: vi.fn((next: number) => {
      scroll = next;
    }),
  };
}

describe('isExtendedDocumentTimeline', () => {
  it('is true when document span exceeds decoded media duration', () => {
    expect(isExtendedDocumentTimeline(120, 60)).toBe(true);
  });

  it('is false when spans are equal or media is longer', () => {
    expect(isExtendedDocumentTimeline(60, 60)).toBe(false);
    expect(isExtendedDocumentTimeline(30, 60)).toBe(false);
  });
});

describe('syncWaveScrollToTier', () => {
  it('clamps WaveSurfer scroll when tier scroll is past media end', () => {
    const ws = mockWaveSurfer({ width: 200, scrollWidth: 1000 });
    syncWaveScrollToTier(ws as never, 900, 10, 60);
    expect(ws.setScroll).toHaveBeenCalledWith(800);
  });

  it('mirrors tier scroll while still inside media duration', () => {
    const ws = mockWaveSurfer({ width: 200, scrollWidth: 1000 });
    syncWaveScrollToTier(ws as never, 250, 10, 60);
    expect(ws.setScroll).toHaveBeenCalledWith(250);
  });

  it('must not treat visible ruler window end as document span (TimeRuler regression)', () => {
    const mediaDurSec = 60;
    const documentSpanSec = 120;
    const visibleRulerEndSec = 30;
    expect(isExtendedDocumentTimeline(documentSpanSec, mediaDurSec)).toBe(true);
    expect(isExtendedDocumentTimeline(Math.max(mediaDurSec, visibleRulerEndSec), mediaDurSec)).toBe(
      false,
    );
  });
});

describe('syncWaveScrollToTierOverlayLeft', () => {
  it('returns clamped WaveSurfer scroll for overlay state, not raw tier pixels', () => {
    const ws = mockWaveSurfer({ width: 200, scrollWidth: 1000 });
    const overlayLeft = syncWaveScrollToTierOverlayLeft(ws as never, 900, 10, 60);
    expect(ws.setScroll).toHaveBeenCalledWith(800);
    expect(overlayLeft).toBe(800);
  });
});

describe('applyTierScrollToWaveSurfer', () => {
  it('uses tier-primary sync on extended document timelines', () => {
    const ws = mockWaveSurfer({ width: 200, scrollWidth: 1000 });
    const overlayScrollLeft = applyTierScrollToWaveSurfer({
      ws: ws as never,
      tierScrollLeftPx: 900,
      zoomPxPerSec: 10,
      mediaDurSec: 60,
      documentSpanSec: 120,
    });
    expect(ws.setScroll).toHaveBeenCalledWith(800);
    expect(overlayScrollLeft).toBe(800);
  });

  it('passes tier scroll through when document span matches media', () => {
    const ws = mockWaveSurfer({ width: 200, scrollWidth: 1000 });
    const overlayScrollLeft = applyTierScrollToWaveSurfer({
      ws: ws as never,
      tierScrollLeftPx: 320,
      zoomPxPerSec: 10,
      mediaDurSec: 60,
      documentSpanSec: 60,
    });
    expect(ws.setScroll).toHaveBeenCalledWith(320);
    expect(overlayScrollLeft).toBe(320);
  });

  it('passes tier scroll through when acoustic is longer than the document axis', () => {
    // 声学更长：非 extended-document，WaveSurfer 主导，波形完整可滚（不钳在文献轴内）。
    const ws = mockWaveSurfer({ width: 200, scrollWidth: 67000 });
    const overlayScrollLeft = applyTierScrollToWaveSurfer({
      ws: ws as never,
      tierScrollLeftPx: 5000,
      zoomPxPerSec: 10,
      mediaDurSec: 6700,
      documentSpanSec: 1800,
    });
    expect(ws.setScroll).toHaveBeenCalledWith(5000);
    expect(overlayScrollLeft).toBe(5000);
  });
});
