import { describe, expect, it } from 'vitest';
import type { MediaItemDocType } from '../db';
import {
  isMediaItemPlaceholderRow,
  MEDIA_TIMELINE_KIND_ACOUSTIC,
  MEDIA_TIMELINE_KIND_PLACEHOLDER,
} from './mediaItemTimelineKind';

function row(partial: Pick<MediaItemDocType, 'filename'> & { details?: Record<string, unknown> }): Pick<MediaItemDocType, 'filename' | 'details'> {
  return partial.details !== undefined
    ? { filename: partial.filename, details: partial.details }
    : { filename: partial.filename };
}

describe('isMediaItemPlaceholderRow', () => {
  it('treats explicit timelineKind placeholder as placeholder', () => {
    expect(isMediaItemPlaceholderRow(row({
      filename: 'custom.track',
      details: { timelineKind: MEDIA_TIMELINE_KIND_PLACEHOLDER },
    }))).toBe(true);
  });

  it('treats explicit timelineKind acoustic as non-placeholder even if legacy flags exist', () => {
    expect(isMediaItemPlaceholderRow(row({
      filename: 'document-placeholder.track',
      details: {
        timelineKind: MEDIA_TIMELINE_KIND_ACOUSTIC,
        placeholder: true,
        timelineMode: 'document',
      },
    }))).toBe(false);
  });

  it('treats legacy rows with real audio payload as acoustic even if old placeholder hints remain', () => {
    expect(isMediaItemPlaceholderRow(row({
      filename: 'document-placeholder.track',
      details: {
        placeholder: true,
        timelineMode: 'document',
        audioBlob: new Blob(['demo'], { type: 'audio/wav' }),
      },
    }))).toBe(false);
  });

  it('falls back to legacy heuristics when timelineKind is absent', () => {
    expect(isMediaItemPlaceholderRow(row({ filename: 'document-placeholder.track', details: {} }))).toBe(true);
    expect(isMediaItemPlaceholderRow(row({ filename: 'a.wav', details: { placeholder: true } }))).toBe(true);
    expect(isMediaItemPlaceholderRow(row({ filename: 'a.wav', details: { timelineMode: 'document' } }))).toBe(true);
    expect(isMediaItemPlaceholderRow(row({ filename: 'a.wav', details: { timelineMode: 'media' } }))).toBe(false);
  });
});
