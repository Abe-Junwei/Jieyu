import { describe, expect, it } from 'vitest';
import {
  clickSelection,
  contextMenuSelection,
  emptySelection,
  orderedLayerUnits,
  pruneSelection,
  rangeSelection,
  replaceSelection,
  selectedIds,
  setSelectionFromUnits,
  toggleSelection,
  type SelectionUnit,
} from './desktopTranscriptionSelection';

const layer = (id: string, startMs: number, layerId = 'L'): SelectionUnit => ({
  id,
  layerId,
  startMs,
});

const units: SelectionUnit[] = [
  layer('a', 0),
  layer('b', 1000),
  layer('c', 2000),
  layer('x', 0, 'other'),
];

describe('desktopTranscriptionSelection', () => {
  it('dedupes box picks and sets the anchor on the first id', () => {
    const state = setSelectionFromUnits(['a', 'b', 'a', 'c']);
    expect(selectedIds(state)).toEqual(['a', 'b', 'c']);
    expect(state.anchorId).toBe('a');
  });

  it('toggles within one structure layer and replaces across layers', () => {
    const one = replaceSelection('a');
    const two = toggleSelection(one, layer('c', 2000), units);
    expect(selectedIds(two)).toEqual(['a', 'c']);
    const off = toggleSelection(two, layer('a', 0), units);
    expect(selectedIds(off)).toEqual(['c']);
    const cross = toggleSelection(off, layer('x', 0, 'other'), units);
    expect(selectedIds(cross)).toEqual(['x']);
  });

  it('selects an ordered range from the anchor on the same layer', () => {
    const state = replaceSelection('a');
    const ranged = rangeSelection(state, layer('c', 2000), units);
    expect(selectedIds(ranged)).toEqual(['a', 'b', 'c']);
    expect(ranged.anchorId).toBe('a');
    expect(orderedLayerUnits(units, 'L').map((u) => u.id)).toEqual(['a', 'b', 'c']);
  });

  it('keeps the set on a right-click hit already selected, else replaces', () => {
    const multi = setSelectionFromUnits(['a', 'b']);
    expect(contextMenuSelection(multi, 'b')).toEqual(multi);
    expect(selectedIds(contextMenuSelection(multi, 'c'))).toEqual(['c']);
  });

  it('prunes missing ids and clears when none remain', () => {
    const multi = setSelectionFromUnits(['a', 'b', 'c']);
    expect(selectedIds(pruneSelection(multi, ['b', 'c']))).toEqual(['b', 'c']);
    expect(pruneSelection(multi, [])).toEqual(emptySelection());
  });

  it('routes click modifiers to toggle or range', () => {
    const base = replaceSelection('a');
    expect(
      selectedIds(clickSelection(base, layer('c', 2000), units, { toggle: true, range: false })),
    ).toEqual(['a', 'c']);
    expect(
      selectedIds(clickSelection(base, layer('c', 2000), units, { toggle: false, range: true })),
    ).toEqual(['a', 'b', 'c']);
    expect(
      selectedIds(clickSelection(base, layer('c', 2000), units, { toggle: false, range: false })),
    ).toEqual(['c']);
  });
});
