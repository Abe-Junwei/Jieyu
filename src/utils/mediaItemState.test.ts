import { describe, expect, it } from 'vitest';
import {
  isAuxiliaryRecordingMediaRow,
  isMediaItemBytesMissing,
  isMediaItemPlaceholderRow,
  managedAcousticMediaState,
  missingAcousticMediaState,
  placeholderMediaState,
} from './mediaItemState';

describe('media item state fields (2B-C)', () => {
  it('reads timelineKind only; no filename or details heuristics', () => {
    expect(isMediaItemPlaceholderRow({ timelineKind: 'placeholder' })).toBe(true);
    expect(isMediaItemPlaceholderRow({ timelineKind: 'acoustic' })).toBe(false);
  });

  it('builds consistent state triples', () => {
    expect(placeholderMediaState()).toEqual({
      timelineKind: 'placeholder',
      byteLocation: 'none',
      availability: 'missing',
    });
    const blob = new Blob(['abc'], { type: 'audio/wav' });
    expect(managedAcousticMediaState(blob, 'f'.repeat(64))).toEqual({
      timelineKind: 'acoustic',
      byteLocation: 'managed',
      availability: 'available',
      contentSize: 3,
      contentSha256: 'f'.repeat(64),
    });
    expect(missingAcousticMediaState({ contentSize: 3 })).toEqual({
      timelineKind: 'acoustic',
      byteLocation: 'none',
      availability: 'missing',
      contentSize: 3,
    });
  });

  it('flags acoustic rows whose bytes are missing', () => {
    expect(isMediaItemBytesMissing({ timelineKind: 'acoustic', availability: 'missing' })).toBe(
      true,
    );
    expect(isMediaItemBytesMissing({ timelineKind: 'placeholder', availability: 'missing' })).toBe(
      false,
    );
    expect(isMediaItemBytesMissing({ timelineKind: 'acoustic', availability: 'available' })).toBe(
      false,
    );
  });

  it('treats translation/transcription recordings as auxiliary media rows', () => {
    expect(isAuxiliaryRecordingMediaRow({ details: { source: 'translation-recording' } })).toBe(
      true,
    );
    expect(isAuxiliaryRecordingMediaRow({ details: { source: 'transcription-recording' } })).toBe(
      true,
    );
    expect(isAuxiliaryRecordingMediaRow({ details: {} })).toBe(false);
  });
});
