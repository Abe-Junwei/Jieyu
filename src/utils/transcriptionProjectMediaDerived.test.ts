import { describe, expect, it } from 'vitest';
import type { MediaItemDocType } from '../types/jieyuDbDocTypes';
import { computeAudioImportDisposition } from './transcriptionProjectMediaDerived';

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
    ).toEqual({ kind: 'choose', replaceMediaId: 'missing', replaceLabel: 'missing.wav' });
  });
});
