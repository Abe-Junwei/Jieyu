import { describe, expect, it } from 'vitest';
import {
  hasSelectionSourceForUnitMapping,
  resolveMappedUnitIds,
  resolveMappedUnitIdsFromSelection,
  resolveUnitSelectionMapping,
} from './selectionIdResolvers';

describe('selectionIdResolvers', () => {
  it('maps mixed utterance/segment unit ids into unique utterance ids', () => {
    const map = new Map<string, string>([
      ['utt-1', 'utt-1'],
      ['seg-a', 'utt-1'],
      ['seg-b', 'utt-2'],
    ]);

    const result = resolveMappedUnitIds(['utt-1', 'seg-a', 'seg-b'], map);

    expect(result.sort()).toEqual(['utt-1', 'utt-2']);
  });

  it('ignores blank or unknown unit ids', () => {
    const map = new Map<string, string>([['utt-1', 'utt-1']]);

    const result = resolveMappedUnitIds(['', '   ', 'unknown', 'utt-1'], map);

    expect(result).toEqual(['utt-1']);
  });

  it('prefers selectedUnitIds when non-empty', () => {
    const map = new Map<string, string>([
      ['utt-1', 'utt-1'],
      ['seg-a', 'utt-2'],
    ]);

    const result = resolveMappedUnitIdsFromSelection({
      selectedUnitIds: new Set(['seg-a']),
      selectedTimelineUnit: { layerId: 'layer-1', unitId: 'utt-1', kind: 'utterance' },
      unitToUtteranceId: map,
    });

    expect(Array.from(result)).toEqual(['utt-2']);
  });

  it('falls back to selectedTimelineUnit when selection set is empty', () => {
    const map = new Map<string, string>([
      ['utt-1', 'utt-1'],
      ['seg-a', 'utt-2'],
    ]);

    const result = resolveMappedUnitIdsFromSelection({
      selectedUnitIds: new Set(),
      selectedTimelineUnit: { layerId: 'layer-1', unitId: 'seg-a', kind: 'segment' },
      unitToUtteranceId: map,
    });

    expect(Array.from(result)).toEqual(['utt-2']);
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
    const map = new Map<string, string>([
      ['seg-a', 'utt-1'],
      ['seg-b', 'utt-2'],
    ]);

    const result = resolveUnitSelectionMapping({
      selectedUnitIds: new Set(['seg-a', 'unknown', 'seg-b']),
      selectedTimelineUnit: null,
      unitToUtteranceId: map,
    });

    expect(result.hasSelectionSource).toBe(true);
    expect(result.sourceUnitCount).toBe(3);
    expect(result.unmappedSourceCount).toBe(1);
    expect(Array.from(result.mappedUnitIds).sort()).toEqual(['utt-1', 'utt-2']);
  });

  it('reports fully unmappable selection when selected unit cannot resolve utterance', () => {
    const result = resolveUnitSelectionMapping({
      selectedUnitIds: new Set(),
      selectedTimelineUnit: { layerId: 'layer-1', unitId: 'seg-x', kind: 'segment' },
      unitToUtteranceId: new Map<string, string>(),
    });

    expect(result.hasSelectionSource).toBe(true);
    expect(result.sourceUnitCount).toBe(1);
    expect(result.unmappedSourceCount).toBe(1);
    expect(result.mappedUnitIds.size).toBe(0);
  });
});
