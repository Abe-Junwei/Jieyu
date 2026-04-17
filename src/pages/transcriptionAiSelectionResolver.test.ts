import { describe, expect, it, vi } from 'vitest';
import type { LayerUnitDocType } from '../db';
import type { TimelineUnitView } from '../hooks/timelineUnitView';
import { buildOwnerUnitCandidates, resolveExplicitOwnerUnitForAi, resolveOwnerUnitForAi, resolveWritableAiTargetId } from './transcriptionAiSelectionResolver';

function makeUnit(overrides: Partial<TimelineUnitView> & Pick<TimelineUnitView, 'id' | 'kind' | 'mediaId' | 'layerId' | 'startTime' | 'endTime' | 'text'>): TimelineUnitView {
  return {
    id: overrides.id,
    kind: overrides.kind,
    mediaId: overrides.mediaId,
    layerId: overrides.layerId,
    startTime: overrides.startTime,
    endTime: overrides.endTime,
    text: overrides.text,
    ...(overrides.parentUnitId ? { parentUnitId: overrides.parentUnitId } : {}),
    ...(overrides.textId ? { textId: overrides.textId } : {}),
    ...(overrides.speakerId ? { speakerId: overrides.speakerId } : {}),
  };
}

function makeUnitDoc(id: string, mediaId: string): LayerUnitDocType {
  return {
    id,
    textId: 'text-1',
    mediaId,
    startTime: 0,
    endTime: 1,
    createdAt: '2026-04-16T00:00:00.000Z',
    updatedAt: '2026-04-16T00:00:00.000Z',
  } as LayerUnitDocType;
}

function makeSegment(id: string, startTime: number, endTime: number): LayerUnitDocType {
  return {
    id,
    textId: 'text-1',
    mediaId: 'media-1',
    layerId: 'layer-1',
    startTime,
    endTime,
    createdAt: '2026-04-16T00:00:00.000Z',
    updatedAt: '2026-04-16T00:00:00.000Z',
  } as LayerUnitDocType;
}

describe('transcriptionAiSelectionResolver', () => {
  it('builds deduped owner unit candidates from the read model', () => {
    const units: TimelineUnitView[] = [
      makeUnit({ id: 'utt-1', kind: 'unit', mediaId: 'media-1', layerId: 'layer-1', startTime: 0, endTime: 1, text: 'one' }),
      makeUnit({ id: 'seg-1', kind: 'segment', mediaId: 'media-1', layerId: 'layer-1', startTime: 0, endTime: 1, text: 'seg' }),
      makeUnit({ id: 'utt-1', kind: 'unit', mediaId: 'media-1', layerId: 'layer-1', startTime: 0, endTime: 1, text: 'duplicate' }),
      makeUnit({ id: 'utt-2', kind: 'unit', mediaId: 'media-2', layerId: 'layer-1', startTime: 2, endTime: 3, text: 'two', textId: 'text-2' }),
    ];

    const getUnitDocById = vi.fn((id: string) => (id === 'utt-1' ? makeUnitDoc('utt-1', 'media-1') : undefined));
    const toSyntheticUnit = vi.fn((unit: TimelineUnitView) => makeUnitDoc(unit.id, unit.mediaId));

    const result = buildOwnerUnitCandidates(units, getUnitDocById, toSyntheticUnit);

    expect(result.map((item) => item.id)).toEqual(['utt-1', 'utt-2']);
    expect(getUnitDocById).toHaveBeenCalledWith('utt-1');
    expect(toSyntheticUnit).toHaveBeenCalledTimes(1);
  });

  it('falls back from direct selection to segment owner resolution', () => {
    const directUnit = makeUnit({ id: 'seg-shadow', kind: 'segment', mediaId: 'media-1', layerId: 'layer-1', startTime: 4, endTime: 6, text: 'shadow', parentUnitId: 'utt-owner' });
    const candidates = [
      makeUnitDoc('utt-owner', 'media-1'),
      makeUnitDoc('utt-other', 'media-1'),
    ];

    const direct = resolveOwnerUnitForAi({
      selectedUnit: directUnit,
      getUnitDocById: (id) => candidates.find((item) => item.id === id),
      selectedTimelineSegment: makeSegment('seg-1', 4, 6),
      ownerCandidates: candidates,
    });

    const fallback = resolveOwnerUnitForAi({
      selectedUnit: null,
      getUnitDocById: (id) => candidates.find((item) => item.id === id),
      selectedTimelineSegment: makeSegment('seg-2', 0.2, 0.8),
      ownerCandidates: candidates,
    });

    const explicitOnlyFallback = resolveExplicitOwnerUnitForAi({
      selectedUnit: null,
      getUnitDocById: (id) => candidates.find((item) => item.id === id),
      selectedTimelineSegment: makeSegment('seg-2', 0.2, 0.8),
      ownerCandidates: candidates,
    });

    expect(direct?.id).toBe('utt-owner');
    expect(fallback?.id).toBe('utt-owner');
    expect(explicitOnlyFallback).toBeUndefined();
  });

  it('resolves writable target id according to explicit writable selection', () => {
    expect(resolveWritableAiTargetId({
      selectedUnitKind: 'segment',
      selectedTimelineSegmentId: 'seg-1',
      snapshotTimelineUnitId: 'seg-shadow',
      explicitOwnerUnitId: 'utt-1',
    })).toBe('seg-1');

    expect(resolveWritableAiTargetId({
      selectedUnitKind: 'unit',
      selectedTimelineSegmentId: 'seg-1',
      snapshotTimelineUnitId: 'seg-shadow',
      explicitOwnerUnitId: 'utt-1',
    })).toBe('utt-1');

    expect(resolveWritableAiTargetId({
      selectedUnitKind: 'unit',
      selectedTimelineSegmentId: 'seg-1',
      snapshotTimelineUnitId: 'seg-shadow',
      explicitOwnerUnitId: undefined,
    })).toBeUndefined();
  });
});
