import { describe, expect, it } from 'vitest';
import type { MediaItemDocType } from '../db';
import { readAudioBlobFromDetails, readNonEmptyAudioBlobFromMediaItem } from './translationRecordingMediaBlob';

describe('translationRecordingMediaBlob', () => {
  describe('readAudioBlobFromDetails', () => {
    it('returns null for non-object details', () => {
      expect(readAudioBlobFromDetails(null)).toBeNull();
      expect(readAudioBlobFromDetails(undefined)).toBeNull();
      expect(readAudioBlobFromDetails('x')).toBeNull();
      expect(readAudioBlobFromDetails(1)).toBeNull();
    });

    it('returns null when audioBlob is missing or not a Blob', () => {
      expect(readAudioBlobFromDetails({})).toBeNull();
      expect(readAudioBlobFromDetails({ audioBlob: 'not-a-blob' })).toBeNull();
      expect(readAudioBlobFromDetails({ audioBlob: new ArrayBuffer(0) })).toBeNull();
    });

    it('returns the Blob when present', () => {
      const blob = new Blob(['a'], { type: 'audio/wav' });
      expect(readAudioBlobFromDetails({ audioBlob: blob })).toBe(blob);
    });
  });

  describe('readNonEmptyAudioBlobFromMediaItem', () => {
    it('returns undefined when item missing or blob missing / empty', () => {
      expect(readNonEmptyAudioBlobFromMediaItem(undefined)).toBeUndefined();
      const emptyDetails = { details: { audioBlob: new Blob([], { type: 'audio/wav' }) } } as unknown as MediaItemDocType;
      expect(readNonEmptyAudioBlobFromMediaItem(emptyDetails)).toBeUndefined();
      const noBlob = { details: {} } as unknown as MediaItemDocType;
      expect(readNonEmptyAudioBlobFromMediaItem(noBlob)).toBeUndefined();
    });

    it('returns blob when media item has non-empty audioBlob in details', () => {
      const blob = new Blob(['pcm'], { type: 'audio/wav' });
      const item = { details: { audioBlob: blob } } as unknown as MediaItemDocType;
      expect(readNonEmptyAudioBlobFromMediaItem(item)).toBe(blob);
    });
  });
});
