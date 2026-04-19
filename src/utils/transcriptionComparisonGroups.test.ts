import { describe, expect, it } from 'vitest';
import type { LayerUnitDocType } from '../db';
import {
  buildComparisonGroups,
  listSegmentsOverlappingTimeRange,
  pickTranslationSegmentForPersist,
} from './transcriptionComparisonGroups';

function makeUnit(id: string, startTime: number, endTime: number): LayerUnitDocType {
  return {
    id,
    textId: 'text-1',
    mediaId: 'media-1',
    startTime,
    endTime,
    createdAt: '2026-04-19T00:00:00.000Z',
    updatedAt: '2026-04-19T00:00:00.000Z',
  } as LayerUnitDocType;
}

describe('buildComparisonGroups', () => {
  it('merges adjacent source units that share the same translation text', () => {
    const units = [
      makeUnit('u1', 0, 1),
      makeUnit('u2', 1.02, 2),
      makeUnit('u3', 2.5, 3.5),
    ];

    const groups = buildComparisonGroups({
      units,
      getSourceText: (unit) => `src-${unit.id}`,
      getTargetText: (unit) => (unit.id === 'u3' ? 'target-b' : 'target-a'),
    });

    expect(groups).toHaveLength(2);
    expect(groups[0]?.sourceItems.map((item) => item.unitId)).toEqual(['u1', 'u2']);
    expect(groups[0]?.targetItems[0]?.text).toBe('target-a');
    expect(groups[0]?.isMultiAnchorGroup).toBe(true);
    expect(groups[1]?.isMultiAnchorGroup).toBe(false);
    expect(groups[1]?.sourceItems.map((item) => item.unitId)).toEqual(['u3']);
  });

  it('falls back to one group per unit when translation text is empty', () => {
    const units = [makeUnit('u1', 0, 1), makeUnit('u2', 1.1, 2)];

    const groups = buildComparisonGroups({
      units,
      getSourceText: (unit) => `src-${unit.id}`,
      getTargetText: () => '',
    });

    expect(groups).toHaveLength(2);
    expect(groups[0]?.sourceItems).toHaveLength(1);
    expect(groups[1]?.sourceItems).toHaveLength(1);
  });

  it('splits multi-line translations into multiple target items within one group', () => {
    const groups = buildComparisonGroups({
      units: [makeUnit('u1', 0, 1)],
      getSourceText: () => 'src-u1',
      getTargetText: () => 'line-a\nline-b',
    });

    expect(groups).toHaveLength(1);
    expect(groups[0]?.targetItems.map((item) => item.text)).toEqual(['line-a', 'line-b']);
  });

  it('ignores units marked to skip processing', () => {
    const units = [
      makeUnit('u1', 0, 1),
      { ...makeUnit('u2', 1.1, 2), tags: { skipProcessing: true } } as LayerUnitDocType,
      makeUnit('u3', 2.1, 3),
    ];

    const groups = buildComparisonGroups({
      units,
      getSourceText: (unit) => `src-${unit.id}`,
      getTargetText: (unit) => `target-${unit.id}`,
    });

    expect(groups.map((group) => group.sourceItems.map((item) => item.unitId))).toEqual([
      ['u1'],
      ['u3'],
    ]);
  });

  it('filters out non-source layer units when sourceLayerIds are provided', () => {
    const units = [
      { ...makeUnit('u1', 0, 1), layerId: 'source-a' } as LayerUnitDocType,
      { ...makeUnit('u2', 1.02, 2), layerId: 'translation-a' } as LayerUnitDocType,
    ];

    const groups = buildComparisonGroups({
      units,
      sourceLayerIds: ['source-a'],
      getSourceText: (unit) => `src-${unit.id}`,
      getTargetText: () => '',
    });

    expect(groups).toHaveLength(1);
    expect(groups[0]?.sourceItems.map((item) => item.unitId)).toEqual(['u1']);
  });

  it('keeps units with omitted layerId when sourceLayerIds are provided (canonical projection)', () => {
    const units = [makeUnit('u1', 0, 1), makeUnit('u2', 1.02, 2)];

    const groups = buildComparisonGroups({
      units,
      sourceLayerIds: ['tr-a'],
      getSourceText: (unit) => `src-${unit.id}`,
      getTargetText: () => '',
    });

    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.sourceItems[0]?.unitId)).toEqual(['u1', 'u2']);
  });

  it('keeps same-bundle untranslated neighbors in one comparison group', () => {
    const units = [
      { ...makeUnit('u1', 0, 1), layerId: 'source-a', rootUnitId: 'bundle-a' } as LayerUnitDocType,
      { ...makeUnit('u2', 1.02, 2), layerId: 'source-b', rootUnitId: 'bundle-a' } as LayerUnitDocType,
    ];

    const groups = buildComparisonGroups({
      units,
      sourceLayerIds: ['source-a', 'source-b'],
      getSourceText: (unit) => `src-${unit.id}`,
      getTargetText: () => '',
    });

    expect(groups).toHaveLength(1);
    expect(groups[0]?.sourceItems.map((item) => item.unitId)).toEqual(['u1', 'u2']);
  });

  it('derives anchor and speaker summary metadata for complex groups', () => {
    const units = [
      { ...makeUnit('u1', 0, 1), layerId: 'tr-a', speaker: 'Alice', speakerId: 'spk-a', rootUnitId: 'bundle-a' } as LayerUnitDocType,
      { ...makeUnit('u2', 1.02, 2), layerId: 'tr-b', speaker: 'Bob', speakerId: 'spk-b', rootUnitId: 'bundle-a' } as LayerUnitDocType,
    ];

    const groups = buildComparisonGroups({
      units,
      getSourceText: (unit) => `src-${unit.id}`,
      getTargetText: () => 'shared-target',
    });

    expect(groups).toHaveLength(1);
    expect((groups[0] as unknown as { primaryAnchorUnitId?: string }).primaryAnchorUnitId).toBe('u1');
    expect((groups[0] as unknown as { primaryAnchorLayerId?: string }).primaryAnchorLayerId).toBe('tr-a');
    expect(groups[0]?.sourceItems.map((item) => (item as unknown as { layerId?: string }).layerId)).toEqual(['tr-a', 'tr-b']);
    expect((groups[0] as unknown as { bundleRootId?: string }).bundleRootId).toBe('bundle-a');
    expect((groups[0] as unknown as { speakerSummary?: string }).speakerSummary).toContain('Alice');
  });

  it('lists segments overlapping a time window', () => {
    const segs = [makeUnit('a', 0, 1), makeUnit('b', 1, 2), makeUnit('c', 3, 4)];
    expect(listSegmentsOverlappingTimeRange(segs, 0.5, 1.5).map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('picks the translation segment with the largest overlap for persistence', () => {
    const segs = [makeUnit('a', 0, 1), makeUnit('b', 0.5, 2.5)];
    const pick = pickTranslationSegmentForPersist(segs, 0, 2);
    expect(pick?.id).toBe('b');
  });
});
