import { describe, expect, it } from 'vitest';
import type { LayerSegmentDocType, MediaItemDocType, UtteranceDocType } from '../db';
import {
  collectNoteTimelineUnitIds,
  resolveSelectedTimelineMedia,
  resolveSelectedTimelineRowMeta,
} from './transcriptionSelectionContextResolver';

function makeUtterance(id: string, mediaId: string, startTime: number, endTime: number): UtteranceDocType {
  return {
    id,
    textId: 'text-1',
    mediaId,
    startTime,
    endTime,
    createdAt: '2026-04-16T00:00:00.000Z',
    updatedAt: '2026-04-16T00:00:00.000Z',
  } as UtteranceDocType;
}

function makeSegment(id: string, mediaId: string, startTime: number, endTime: number): LayerSegmentDocType {
  return {
    id,
    textId: 'text-1',
    mediaId,
    layerId: 'layer-1',
    startTime,
    endTime,
    createdAt: '2026-04-16T00:00:00.000Z',
    updatedAt: '2026-04-16T00:00:00.000Z',
  } as LayerSegmentDocType;
}

describe('transcriptionSelectionContextResolver', () => {
  it('resolves row meta from current-media rows first and falls back to same-media sorting', () => {
    const utterances = [
      makeUtterance('utt-2', 'media-1', 10, 12),
      makeUtterance('utt-1', 'media-1', 2, 4),
      makeUtterance('utt-x', 'media-2', 1, 2),
    ];

    const currentMediaRows = [utterances[0]!, utterances[1]!];
    const selectedFromCurrentMedia = utterances[1]!;
    const selectedFromFallbackRows = utterances[0]!;

    expect(resolveSelectedTimelineRowMeta(currentMediaRows, selectedFromCurrentMedia, utterances)).toEqual({
      rowNumber: 2,
      start: 2,
      end: 4,
    });

    expect(resolveSelectedTimelineRowMeta([], selectedFromFallbackRows, utterances)).toEqual({
      rowNumber: 2,
      start: 10,
      end: 12,
    });
  });

  it('collects unique note timeline ids from utterances and segments', () => {
    const ids = collectNoteTimelineUnitIds(
      [makeUtterance('utt-1', 'media-1', 0, 1), makeUtterance('utt-1', 'media-1', 0, 1)],
      new Map<string, LayerSegmentDocType[]>([
        ['layer-1', [makeSegment('seg-1', 'media-1', 0, 1), makeSegment('seg-1', 'media-1', 0, 1)]],
      ]),
    );

    expect(ids).toEqual(['utt-1', 'seg-1']);
  });

  it('falls back to segment or owner media when selected media is not explicit', () => {
    const mediaItemById = new Map<string, MediaItemDocType>([
      ['media-1', { id: 'media-1' } as MediaItemDocType],
      ['media-2', { id: 'media-2' } as MediaItemDocType],
    ]);

    expect(resolveSelectedTimelineMedia(undefined, mediaItemById, makeSegment('seg-1', 'media-1', 0, 1), null)?.id).toBe('media-1');
    expect(resolveSelectedTimelineMedia(undefined, mediaItemById, null, makeUtterance('utt-2', 'media-2', 3, 4))?.id).toBe('media-2');
  });
});
