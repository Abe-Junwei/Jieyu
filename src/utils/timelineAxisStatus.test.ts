import { describe, expect, it } from 'vitest';
import {
  maxUnitEndTimeSec,
  resolveTimelineAxisStatus,
  shouldShowLogicalAxisLengthOnAxisStrip,
} from './timelineAxisStatus';

describe('timelineAxisStatus', () => {
  it('maxUnitEndTimeSec returns highest endTime', () => {
    expect(maxUnitEndTimeSec([{ endTime: 1 }, { endTime: 5.5 }, { endTime: 3 }])).toBe(5.5);
    expect(maxUnitEndTimeSec([])).toBe(0);
  });

  it('resolveTimelineAxisStatus returns hidden without layers', () => {
    expect(
      resolveTimelineAxisStatus({
        layersCount: 0,
        selectedMediaUrl: 'blob:x',
        playerIsReady: true,
        playerDuration: 10,
        selectedTimelineMedia: {
          filename: 'a.wav',
          details: { audioBlob: new Blob(), timelineKind: 'acoustic' },
        },
        unitsOnCurrentMedia: [],
      }).kind,
    ).toBe('hidden');
  });

  it('flags acoustic_decoding when URL present but player not ready', () => {
    expect(
      resolveTimelineAxisStatus({
        layersCount: 1,
        selectedMediaUrl: 'blob:x',
        playerIsReady: false,
        playerDuration: 0,
        selectedTimelineMedia: {
          filename: 'a.wav',
          details: { audioBlob: new Blob(), timelineKind: 'acoustic' },
        },
        unitsOnCurrentMedia: [],
      }),
    ).toEqual({ kind: 'acoustic_decoding' });
  });

  it('returns acoustic_ok when acoustic exceeds established logical span (no post-import strip warning)', () => {
    expect(
      resolveTimelineAxisStatus({
        layersCount: 1,
        selectedMediaUrl: 'blob:x',
        playerIsReady: true,
        playerDuration: 300,
        selectedTimelineMedia: { filename: 'a.wav', details: {} },
        unitsOnCurrentMedia: [{ endTime: 100 }],
      }),
    ).toEqual({ kind: 'acoustic_ok', acousticSec: 300 });
  });

  it('returns acoustic_ok when acoustic is longer but no established logical span', () => {
    expect(
      resolveTimelineAxisStatus({
        layersCount: 1,
        selectedMediaUrl: 'blob:x',
        playerIsReady: true,
        playerDuration: 300,
        selectedTimelineMedia: { filename: 'a.wav', details: {} },
        unitsOnCurrentMedia: [],
      }),
    ).toEqual({ kind: 'acoustic_ok', acousticSec: 300 });
  });

  it('flags duration_short when segments exceed acoustic even if document axis is shorter', () => {
    expect(
      resolveTimelineAxisStatus({
        layersCount: 1,
        selectedMediaUrl: 'blob:x',
        playerIsReady: true,
        playerDuration: 300,
        selectedTimelineMedia: { filename: 'a.wav', details: {} },
        unitsOnCurrentMedia: [{ endTime: 350 }],
      }),
    ).toEqual({ kind: 'duration_short', acousticSec: 300, maxUnitEndSec: 350 });
  });

  it('flags duration_short when waveform shell and segments exceed decode duration', () => {
    expect(
      resolveTimelineAxisStatus({
        layersCount: 1,
        selectedMediaUrl: 'blob:x',
        playerIsReady: true,
        playerDuration: 10,
        selectedTimelineMedia: {
          filename: 'a.wav',
          details: { audioBlob: new Blob(), timelineKind: 'acoustic' },
        },
        unitsOnCurrentMedia: [{ endTime: 50 }],
      }),
    ).toEqual({ kind: 'duration_short', acousticSec: 10, maxUnitEndSec: 50 });
  });

  it('returns acoustic_ok when segments fit decode duration', () => {
    expect(
      resolveTimelineAxisStatus({
        layersCount: 1,
        selectedMediaUrl: 'blob:x',
        playerIsReady: true,
        playerDuration: 10,
        selectedTimelineMedia: {
          filename: 'a.wav',
          details: { audioBlob: new Blob(), timelineKind: 'acoustic' },
        },
        unitsOnCurrentMedia: [{ endTime: 9.9 }],
      }),
    ).toEqual({ kind: 'acoustic_ok', acousticSec: 10 });
  });

  it('hides axis strip for placeholder logical-axis media row', () => {
    expect(
      resolveTimelineAxisStatus({
        layersCount: 1,
        selectedMediaUrl: null,
        playerIsReady: false,
        playerDuration: 0,
        selectedTimelineMedia: {
          filename: 'document-placeholder.track',
          details: { placeholder: true, timelineMode: 'document' },
        },
        unitsOnCurrentMedia: [],
      }),
    ).toEqual({ kind: 'hidden' });
  });

  describe('shouldShowLogicalAxisLengthOnAxisStrip', () => {
    it('is true for document|media + no_playable_media + positive finite logicalDurationSec', () => {
      expect(
        shouldShowLogicalAxisLengthOnAxisStrip({
          logicalDurationSec: 120,
          hintKind: 'no_playable_media',
        }),
      ).toBe(true);
      expect(
        shouldShowLogicalAxisLengthOnAxisStrip({
          logicalDurationSec: 120,
          hintKind: 'no_playable_media',
        }),
      ).toBe(true);
    });

    it('is false for acoustic_ok even with positive finite logicalDurationSec', () => {
      expect(
        shouldShowLogicalAxisLengthOnAxisStrip({
          logicalDurationSec: 180,
          hintKind: 'acoustic_ok',
        }),
      ).toBe(false);
    });

    it('is false for hints other than no_playable_media', () => {
      expect(
        shouldShowLogicalAxisLengthOnAxisStrip({
          logicalDurationSec: 120,
          hintKind: 'acoustic_ok',
        }),
      ).toBe(false);
      expect(
        shouldShowLogicalAxisLengthOnAxisStrip({
          logicalDurationSec: 120,
          hintKind: 'duration_short',
        }),
      ).toBe(false);
    });

    it('returns acoustic_ok when established logical already covers acoustic duration', () => {
      expect(
        resolveTimelineAxisStatus({
          layersCount: 1,
          selectedMediaUrl: 'blob:x',
          playerIsReady: true,
          playerDuration: 6700,
          selectedTimelineMedia: { filename: 'a.wav', details: {} },
          unitsOnCurrentMedia: [{ endTime: 1500 }],
        }),
      ).toEqual({ kind: 'acoustic_ok', acousticSec: 6700 });
    });

    it('is false when logical duration missing or non-positive', () => {
      expect(
        shouldShowLogicalAxisLengthOnAxisStrip({
          hintKind: 'no_playable_media',
        }),
      ).toBe(false);
      expect(
        shouldShowLogicalAxisLengthOnAxisStrip({
          logicalDurationSec: 0,
          hintKind: 'no_playable_media',
        }),
      ).toBe(false);
      expect(
        shouldShowLogicalAxisLengthOnAxisStrip({
          logicalDurationSec: Number.NaN,
          hintKind: 'no_playable_media',
        }),
      ).toBe(false);
    });
  });
});
