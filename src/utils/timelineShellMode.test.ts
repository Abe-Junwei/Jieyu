import { describe, expect, it } from 'vitest';
import { resolveTimelineShellMode } from './timelineShellMode';

describe('resolveTimelineShellMode', () => {
  it('selects waveform when URL, ready, positive duration, and layers exist', () => {
    expect(resolveTimelineShellMode({
      selectedMediaUrl: 'blob:x',
      playerIsReady: true,
      playerDuration: 12,
      layersCount: 2,
    })).toEqual({ shell: 'waveform', acousticPending: false });
  });

  it('selects text-only with acousticPending when URL exists but player not ready', () => {
    expect(resolveTimelineShellMode({
      selectedMediaUrl: 'blob:x',
      playerIsReady: false,
      playerDuration: 0,
      layersCount: 1,
    })).toEqual({ shell: 'text-only', acousticPending: true });
  });

  it('selects text-only with acousticPending when duration not positive yet', () => {
    expect(resolveTimelineShellMode({
      selectedMediaUrl: 'blob:x',
      playerIsReady: true,
      playerDuration: 0,
      layersCount: 3,
    })).toEqual({ shell: 'text-only', acousticPending: true });
  });

  it('selects text-only without pending when no URL', () => {
    expect(resolveTimelineShellMode({
      selectedMediaUrl: null,
      playerIsReady: false,
      playerDuration: 0,
      layersCount: 2,
    })).toEqual({ shell: 'text-only', acousticPending: false });
  });

  it('selects empty when no layers', () => {
    expect(resolveTimelineShellMode({
      selectedMediaUrl: 'blob:x',
      playerIsReady: true,
      playerDuration: 10,
      layersCount: 0,
    })).toEqual({ shell: 'empty', acousticPending: false });
  });

  it('treats blank URL as no acoustic', () => {
    expect(resolveTimelineShellMode({
      selectedMediaUrl: '   ',
      playerIsReady: true,
      playerDuration: 10,
      layersCount: 1,
    })).toEqual({ shell: 'text-only', acousticPending: false });
  });
});
