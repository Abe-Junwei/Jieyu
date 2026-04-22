import { describe, expect, it } from 'vitest';
import {
  computeEffectiveTimelineShellLayersCount,
  resolveTimelineShellMode,
  timelineShellModeResultToAcousticState,
} from './timelineShellMode';

describe('computeEffectiveTimelineShellLayersCount', () => {
  it('returns the max of orchestrator vs transcription vs translation counts', () => {
    expect(computeEffectiveTimelineShellLayersCount({
      orchestratorLayersCount: 0,
      transcriptionLayerCount: 2,
      translationLayerCount: 1,
    })).toBe(2);
    expect(computeEffectiveTimelineShellLayersCount({
      orchestratorLayersCount: 4,
      transcriptionLayerCount: 1,
      translationLayerCount: 1,
    })).toBe(4);
  });
});

describe('timelineShellModeResultToAcousticState', () => {
  it('maps playable / pending / idle', () => {
    expect(timelineShellModeResultToAcousticState({
      shell: 'waveform',
      acousticPending: false,
      playableAcoustic: true,
    })).toBe('playable');
    expect(timelineShellModeResultToAcousticState({
      shell: 'text-only',
      acousticPending: true,
      playableAcoustic: false,
    })).toBe('pending_decode');
    expect(timelineShellModeResultToAcousticState({
      shell: 'text-only',
      acousticPending: false,
      playableAcoustic: false,
    })).toBe('no_media');
  });
});

describe('resolveTimelineShellMode', () => {
  it('selects waveform when URL, ready, positive duration, and layers exist', () => {
    expect(resolveTimelineShellMode({
      selectedMediaUrl: 'blob:x',
      playerIsReady: true,
      playerDuration: 12,
      layersCount: 2,
    })).toEqual({ shell: 'waveform', acousticPending: false, playableAcoustic: true });
  });

  it('selects text-only with acousticPending when URL exists but player not ready', () => {
    expect(resolveTimelineShellMode({
      selectedMediaUrl: 'blob:x',
      playerIsReady: false,
      playerDuration: 0,
      layersCount: 1,
    })).toEqual({ shell: 'text-only', acousticPending: true, playableAcoustic: false });
  });

  it('selects text-only with acousticPending when duration not positive yet', () => {
    expect(resolveTimelineShellMode({
      selectedMediaUrl: 'blob:x',
      playerIsReady: true,
      playerDuration: 0,
      layersCount: 3,
    })).toEqual({ shell: 'text-only', acousticPending: true, playableAcoustic: false });
  });

  it('selects text-only without pending when no URL', () => {
    expect(resolveTimelineShellMode({
      selectedMediaUrl: null,
      playerIsReady: false,
      playerDuration: 0,
      layersCount: 2,
    })).toEqual({ shell: 'text-only', acousticPending: false, playableAcoustic: false });
  });

  it('keeps text-only when there is no playable URL', () => {
    expect(resolveTimelineShellMode({
      selectedMediaUrl: null,
      playerIsReady: false,
      playerDuration: 0,
      layersCount: 2,
    })).toEqual({ shell: 'text-only', acousticPending: false, playableAcoustic: false });
  });

  it('prefers text-only when comparison view is enabled', () => {
    expect(resolveTimelineShellMode({
      selectedMediaUrl: 'blob:x',
      playerIsReady: true,
      playerDuration: 10,
      layersCount: 2,
      verticalViewEnabled: true,
    })).toEqual({ shell: 'text-only', acousticPending: false, playableAcoustic: false });
  });

  it('selects empty when no layers', () => {
    expect(resolveTimelineShellMode({
      selectedMediaUrl: 'blob:x',
      playerIsReady: true,
      playerDuration: 10,
      layersCount: 0,
    })).toEqual({ shell: 'empty', acousticPending: false, playableAcoustic: false });
  });

  it('treats blank URL as no acoustic', () => {
    expect(resolveTimelineShellMode({
      selectedMediaUrl: '   ',
      playerIsReady: true,
      playerDuration: 10,
      layersCount: 1,
    })).toEqual({ shell: 'text-only', acousticPending: false, playableAcoustic: false });
  });
});
