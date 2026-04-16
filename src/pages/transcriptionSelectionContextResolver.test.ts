import { describe, expect, it } from 'vitest';
import type { LayerUnitDocType, MediaItemDocType } from '../db';
import { collectNoteTimelineUnitIds, resolveSelectedTimelineMedia, resolveSelectedTimelineRowMeta } from './transcriptionSelectionContextResolver';

function makeUnit(id: string, mediaId: string, startTime: number, endTime: number): LayerUnitDocType {
  return {
    id,
    textId: 'text-1',
    mediaId,
    startTime,
    endTime,
    createdAt: '2026-04-16T00:00:00.000Z',
    updatedAt: '2026-04-16T00:00:00.000Z',
  } as LayerUnitDocType;
}

function makeSegment(id: string, mediaId: string, startTime: number, endTime: number): LayerUnitDocType {
  return {
    id,
    textId: 'text-1',
    mediaId,
    layerId: 'layer-1',
    startTime,
    endTime,
    createdAt: '2026-04-16T00:00:00.000Z',
    updatedAt: '2026-04-16T00:00:00.000Z',
  } as LayerUnitDocType;
}

describe('transcriptionSelectionContextResolver', () => {
  it('resolves row meta from current-media rows first and falls back to same-media sorting', () => {
    const units = [
      makeUnit('utt-2', 'media-1', 10, 12),
      makeUnit('utt-1', 'media-1', 2, 4),
      makeUnit('utt-x', 'media-2', 1, 2),
    ];

    const currentMediaRows = [units[0]!, units[1]!];
    const selectedFromCurrentMedia = units[1]!;
    const selectedFromFallbackRows = units[0]!;

    expect(resolveSelectedTimelineRowMeta(currentMediaRows, selectedFromCurrentMedia, units)).toEqual({
      rowNumber: 2,
      start: 2,
      end: 4,
    });

    expect(resolveSelectedTimelineRowMeta([], selectedFromFallbackRows, units)).toEqual({
      rowNumber: 2,
      start: 10,
      end: 12,
    });
  });

  it('collects unique note timeline ids from units and segments', () => {
    const ids = collectNoteTimelineUnitIds(
      [makeUnit('utt-1', 'media-1', 0, 1), makeUnit('utt-1', 'media-1', 0, 1)],
      new Map<string, LayerUnitDocType[]>([
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
    expect(resolveSelectedTimelineMedia(undefined, mediaItemById, null, makeUnit('utt-2', 'media-2', 3, 4))?.id).toBe('media-2');
  });
});
