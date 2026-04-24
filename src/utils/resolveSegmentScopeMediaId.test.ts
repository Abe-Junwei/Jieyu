import { describe, expect, it } from 'vitest';
import type { LayerUnitDocType, MediaItemDocType } from '../db';
import { createTimelineUnit } from '../hooks/transcriptionTypes';
import { resolveSegmentMediaIdFromSegmentGraph, resolveSegmentScopeMediaId } from './resolveSegmentScopeMediaId';

function media(id: string): MediaItemDocType {
  const now = '2026-04-23T00:00:00.000Z';
  return {
    id,
    textId: 't1',
    filename: 'x',
    isOfflineCached: false,
    createdAt: now,
  };
}

function unit(id: string, mediaId: string): LayerUnitDocType {
  const now = '2026-04-23T00:00:00.000Z';
  return {
    id,
    textId: 't1',
    mediaId,
    layerId: 'L',
    startTime: 0,
    endTime: 1,
    createdAt: now,
    updatedAt: now,
  } as LayerUnitDocType;
}

describe('resolveSegmentScopeMediaId', () => {
  it('prefers sidebar selected media', () => {
    const m = media('m-sidebar');
    const id = resolveSegmentScopeMediaId(
      m,
      createTimelineUnit('L', 'u1', 'unit'),
      [unit('u1', 'm-other')],
      [media('m-other')],
    );
    expect(id).toBe('m-sidebar');
  });

  it('uses timeline unit host media when sidebar unset', () => {
    const id = resolveSegmentScopeMediaId(
      undefined,
      createTimelineUnit('L', 'u1', 'unit'),
      [unit('u1', 'm-host')],
      [media('m-first'), media('m-host')],
    );
    expect(id).toBe('m-host');
  });

  it('falls back to first media row', () => {
    const id = resolveSegmentScopeMediaId(undefined, null, [], [media('m-first')]);
    expect(id).toBe('m-first');
  });
});

describe('resolveSegmentMediaIdFromSegmentGraph', () => {
  it('returns undefined when selection is not a segment', () => {
    expect(resolveSegmentMediaIdFromSegmentGraph(null, new Map())).toBeUndefined();
    expect(
      resolveSegmentMediaIdFromSegmentGraph(createTimelineUnit('L', 'u1', 'unit'), new Map([['L', [{ id: 'u1', mediaId: 'm-x' }]]])),
    ).toBeUndefined();
  });

  it('returns segment row mediaId when graph is loaded', () => {
    const seg = createTimelineUnit('layer-a', 'seg-1', 'segment');
    const map = new Map<string, Array<{ id: string; mediaId: string }>>([
      ['layer-a', [{ id: 'seg-1', mediaId: 'm-from-graph' }]],
    ]);
    expect(resolveSegmentMediaIdFromSegmentGraph(seg, map)).toBe('m-from-graph');
  });

  it('returns undefined when segment id is missing from layer list', () => {
    const seg = createTimelineUnit('layer-a', 'missing', 'segment');
    const map = new Map([['layer-a', [{ id: 'other', mediaId: 'm1' }]]]);
    expect(resolveSegmentMediaIdFromSegmentGraph(seg, map)).toBeUndefined();
  });
});
