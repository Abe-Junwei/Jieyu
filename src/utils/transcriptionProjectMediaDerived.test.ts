import { describe, expect, it } from 'vitest';
import type { MediaItemDocType } from '../types/jieyuDbDocTypes';
import {
  computeAudioImportDisposition,
  mergeReloadedMediaRows,
} from './transcriptionProjectMediaDerived';

const NOW = '2026-10-08T12:00:00.000Z';

function media(
  id: string,
  timelineKind: MediaItemDocType['timelineKind'],
  filename = `${id}.wav`,
): MediaItemDocType {
  return {
    id,
    textId: 'text-1',
    filename,
    details: {},
    isOfflineCached: true,
    timelineKind,
    byteLocation: 'none',
    availability: 'missing',
    createdAt: NOW,
  };
}

const placeholderA = media('ph-a', 'placeholder', 'document-placeholder.track');
const placeholderB = media('ph-b', 'placeholder', 'document-placeholder.track');
const missingAcoustic = media('missing', 'acoustic');

describe('computeAudioImportDisposition (rev5 Batch 1 / N4)', () => {
  it('passes the selected placeholder so only that timeline gets the audio', () => {
    expect(
      computeAudioImportDisposition({
        activeTextId: 'text-1',
        mediaItems: [placeholderA, placeholderB],
        selectedTimelineMedia: placeholderB,
      }),
    ).toEqual({ kind: 'simple', placeholderMediaId: 'ph-b' });
  });

  it('does not invent a target when no placeholder is selected', () => {
    expect(
      computeAudioImportDisposition({
        activeTextId: 'text-1',
        mediaItems: [placeholderA, placeholderB],
        selectedTimelineMedia: null,
      }),
    ).toEqual({ kind: 'simple' });
  });

  it('treats a missing acoustic recording as acoustic and offers replace for the selected one', () => {
    expect(
      computeAudioImportDisposition({
        activeTextId: 'text-1',
        mediaItems: [placeholderA, missingAcoustic],
        selectedTimelineMedia: missingAcoustic,
      }),
    ).toEqual({
      kind: 'choose',
      replaceMediaId: 'missing',
      replaceLabel: 'missing.wav',
      replaceHasBytes: false,
    });
  });
});

describe('mergeReloadedMediaRows', () => {
  it('keeps the in-memory blob when a managed row reloads without one', () => {
    const blob = new Blob(['wav'], { type: 'audio/wav' });
    const previous = media('media-1', 'acoustic');
    previous.byteLocation = 'managed';
    previous.availability = 'available';
    previous.details = { audioBlob: blob };
    const reloaded = media('media-1', 'acoustic');
    reloaded.byteLocation = 'managed';
    reloaded.availability = 'available';
    reloaded.details = {};

    const [row] = mergeReloadedMediaRows([previous], [reloaded]);
    expect((row?.details as { audioBlob?: Blob }).audioBlob).toBe(blob);
  });

  it('does not restore a blob onto a recording whose bytes were deleted', () => {
    const blob = new Blob(['wav'], { type: 'audio/wav' });
    const previous = media('media-1', 'acoustic');
    previous.details = { audioBlob: blob };
    const reloaded = media('media-1', 'acoustic');

    const [row] = mergeReloadedMediaRows([previous], [reloaded]);
    expect((row?.details as { audioBlob?: unknown }).audioBlob).toBeUndefined();
  });
});
