import { describe, expect, it } from 'vitest';
import type { TimelineUnitView } from '../hooks/timelineUnitView';
import { hasSelectionSourceForUnitMapping, resolveMappedUnitIds, resolveMappedUnitIdsFromSelection, resolveSegmentActionIds, resolveSegmentActionIdsFromSelection, resolveSegmentOnlyIds, resolveSegmentOnlyIdsFromSelection, resolveUnitSelectionMapping } from './selectionIdResolvers';

function utt(id: string): TimelineUnitView {
  return { id, kind: 'unit', mediaId: 'm', layerId: 'l', startTime: 0, endTime: 1, text: '' };
}

function seg(id: string, parent: string): TimelineUnitView {
  return {
    id,
    kind: 'segment',
    mediaId: 'm',
    layerId: 'l',
    startTime: 0,
    endTime: 1,
    text: '',
    parentUnitId: parent,
  };
}

describe('selectionIdResolvers', () => {
  it('maps mixed unit/segment unit ids into unique unit ids', () => {
    const unitViewById = new Map<string, TimelineUnitView>([
      ['utt-1', utt('utt-1')],
      ['seg-a', seg('seg-a', 'utt-1')],
      ['seg-b', seg('seg-b', 'utt-2')],
    ]);

    const result = resolveMappedUnitIds(['utt-1', 'seg-a', 'seg-b'], unitViewById);

    expect(result.sort()).toEqual(['utt-1', 'utt-2']);
  });

  it('ignores blank or unknown unit ids', () => {
    const unitViewById = new Map<string, TimelineUnitView>([['utt-1', utt('utt-1')]]);

    const result = resolveMappedUnitIds(['', '   ', 'unknown', 'utt-1'], unitViewById);

    expect(result).toEqual(['utt-1']);
  });

  it('prefers selectedUnitIds when non-empty', () => {
    const unitViewById = new Map<string, TimelineUnitView>([
      ['utt-1', utt('utt-1')],
      ['seg-a', seg('seg-a', 'utt-2')],
    ]);

    const result = resolveMappedUnitIdsFromSelection({
      selectedUnitIds: new Set(['seg-a']),
      selectedTimelineUnit: { layerId: 'layer-1', unitId: 'utt-1', kind: 'unit' },
      unitViewById,
    });

    expect(Array.from(result)).toEqual(['utt-2']);
  });

  it('falls back to selectedTimelineUnit when selection set is empty', () => {
    const unitViewById = new Map<string, TimelineUnitView>([
      ['utt-1', utt('utt-1')],
      ['seg-a', seg('seg-a', 'utt-2')],
    ]);

    const result = resolveMappedUnitIdsFromSelection({
      selectedUnitIds: new Set(),
      selectedTimelineUnit: { layerId: 'layer-1', unitId: 'seg-a', kind: 'segment' },
      unitViewById,
    });

    expect(Array.from(result)).toEqual(['utt-2']);
  });

  it('keeps only segment ids for segment-only mapping', () => {
    const unitViewById = new Map<string, TimelineUnitView>([
      ['utt-1', utt('utt-1')],
      ['seg-a', seg('seg-a', 'utt-2')],
      ['seg-b', seg('seg-b', 'utt-3')],
    ]);

    const result = resolveSegmentOnlyIds(['utt-1', 'seg-a', 'seg-b', 'seg-a'], unitViewById);

    expect(result.sort()).toEqual(['seg-a', 'seg-b']);
  });

  it('exposes resolveSegmentActionIds as an alias of resolveSegmentOnlyIds', () => {
    const unitViewById = new Map<string, TimelineUnitView>([
      ['utt-1', utt('utt-1')],
      ['seg-a', seg('seg-a', 'utt-2')],
    ]);

    expect(resolveSegmentActionIds(['utt-1', 'seg-a'], unitViewById).sort())
      .toEqual(resolveSegmentOnlyIds(['utt-1', 'seg-a'], unitViewById).sort());

    const fromAlias = resolveSegmentActionIdsFromSelection({
      selectedUnitIds: new Set(['seg-a']),
      selectedTimelineUnit: null,
      unitViewById,
    });
    const fromPrimary = resolveSegmentOnlyIdsFromSelection({
      selectedUnitIds: new Set(['seg-a']),
      selectedTimelineUnit: null,
      unitViewById,
    });
    expect(Array.from(fromAlias)).toEqual(Array.from(fromPrimary));
  });

  it('resolves segment-only ids from selection source without parent fallback', () => {
    const unitViewById = new Map<string, TimelineUnitView>([
      ['utt-1', utt('utt-1')],
      ['seg-a', seg('seg-a', 'utt-2')],
    ]);

    const selectedFromSet = resolveSegmentOnlyIdsFromSelection({
      selectedUnitIds: new Set(['utt-1', 'seg-a']),
      selectedTimelineUnit: null,
      unitViewById,
    });

    const selectedFromFallback = resolveSegmentOnlyIdsFromSelection({
      selectedUnitIds: new Set(),
      selectedTimelineUnit: { layerId: 'layer-1', unitId: 'seg-a', kind: 'segment' },
      unitViewById,
    });

    expect(Array.from(selectedFromSet)).toEqual(['seg-a']);
    expect(Array.from(selectedFromFallback)).toEqual(['seg-a']);
  });

  it('detects mapping source from explicit selection set', () => {
    const result = hasSelectionSourceForUnitMapping({
      selectedUnitIds: new Set(['seg-a']),
      selectedTimelineUnit: null,
    });

    expect(result).toBe(true);
  });

  it('detects mapping source from selected timeline unit fallback', () => {
    const result = hasSelectionSourceForUnitMapping({
      selectedUnitIds: new Set(),
      selectedTimelineUnit: { layerId: 'layer-1', unitId: ' seg-a ', kind: 'segment' },
    });

    expect(result).toBe(true);
  });

  it('returns false when no selection source can be resolved', () => {
    const result = hasSelectionSourceForUnitMapping({
      selectedUnitIds: new Set(),
      selectedTimelineUnit: { layerId: 'layer-1', unitId: '   ', kind: 'segment' },
    });

    expect(result).toBe(false);
  });

  it('reports partial mapping stats when explicit selection is only partly mappable', () => {
    const unitViewById = new Map<string, TimelineUnitView>([
      ['seg-a', seg('seg-a', 'utt-1')],
      ['seg-b', seg('seg-b', 'utt-2')],
    ]);

    const result = resolveUnitSelectionMapping({
      selectedUnitIds: new Set(['seg-a', 'unknown', 'seg-b']),
      selectedTimelineUnit: null,
      unitViewById,
    });

    expect(result.hasSelectionSource).toBe(true);
    expect(result.sourceUnitCount).toBe(3);
    expect(result.unmappedSourceCount).toBe(1);
    expect(Array.from(result.mappedUnitIds).sort()).toEqual(['utt-1', 'utt-2']);
  });

  it('reports fully unmappable selection when selected unit cannot resolve unit', () => {
    const result = resolveUnitSelectionMapping({
      selectedUnitIds: new Set(),
      selectedTimelineUnit: { layerId: 'layer-1', unitId: 'seg-x', kind: 'segment' },
      unitViewById: new Map<string, TimelineUnitView>(),
    });

    expect(result.hasSelectionSource).toBe(true);
    expect(result.sourceUnitCount).toBe(1);
    expect(result.unmappedSourceCount).toBe(1);
    expect(result.mappedUnitIds.size).toBe(0);
  });
});
