import { describe, expect, it } from 'vitest';
import { maxUnitEndTimeSec, resolveTimelineAxisStatus } from './timelineAxisStatus';

describe('timelineAxisStatus', () => {
  it('maxUnitEndTimeSec returns highest endTime', () => {
    expect(maxUnitEndTimeSec([{ endTime: 1 }, { endTime: 5.5 }, { endTime: 3 }])).toBe(5.5);
    expect(maxUnitEndTimeSec([])).toBe(0);
  });

  it('resolveTimelineAxisStatus returns hidden without layers', () => {
    expect(resolveTimelineAxisStatus({
      layersCount: 0,
      selectedMediaUrl: 'blob:x',
      playerIsReady: true,
      playerDuration: 10,
      selectedTimelineMedia: { filename: 'a.wav', details: { audioBlob: new Blob(), timelineKind: 'acoustic' } },
      unitsOnCurrentMedia: [],
    }).kind).toBe('hidden');
  });

  it('flags acoustic_decoding when URL present but player not ready', () => {
    expect(resolveTimelineAxisStatus({
      layersCount: 1,
      selectedMediaUrl: 'blob:x',
      playerIsReady: false,
      playerDuration: 0,
      selectedTimelineMedia: { filename: 'a.wav', details: { audioBlob: new Blob(), timelineKind: 'acoustic' } },
      unitsOnCurrentMedia: [],
    })).toEqual({ kind: 'acoustic_decoding' });
  });

  it('flags duration_short when waveform shell and segments exceed decode duration', () => {
    expect(resolveTimelineAxisStatus({
      layersCount: 1,
      selectedMediaUrl: 'blob:x',
      playerIsReady: true,
      playerDuration: 10,
      selectedTimelineMedia: { filename: 'a.wav', details: { audioBlob: new Blob(), timelineKind: 'acoustic' } },
      unitsOnCurrentMedia: [{ endTime: 50 }],
    })).toEqual({ kind: 'duration_short', acousticSec: 10, maxUnitEndSec: 50 });
  });

  it('returns acoustic_ok when segments fit decode duration', () => {
    expect(resolveTimelineAxisStatus({
      layersCount: 1,
      selectedMediaUrl: 'blob:x',
      playerIsReady: true,
      playerDuration: 10,
      selectedTimelineMedia: { filename: 'a.wav', details: { audioBlob: new Blob(), timelineKind: 'acoustic' } },
      unitsOnCurrentMedia: [{ endTime: 9.9 }],
    })).toEqual({ kind: 'acoustic_ok', acousticSec: 10 });
  });

  it('returns placeholder axis when text-only shell and placeholder row', () => {
    expect(resolveTimelineAxisStatus({
      layersCount: 1,
      selectedMediaUrl: null,
      playerIsReady: false,
      playerDuration: 0,
      selectedTimelineMedia: {
        filename: 'document-placeholder.track',
        details: { placeholder: true, timelineMode: 'document' },
      },
      unitsOnCurrentMedia: [],
    })).toEqual({ kind: 'no_playable_media', sub: 'placeholder' });
  });
});
