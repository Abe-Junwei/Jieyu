import { describe, expect, it } from 'vitest';
import { buildLayerTree, emptyFold, parseFold } from './desktopTranscriptionLayerTree';

const layers = ['a', 'b', 'c', 'd'].map((id, index) => ({ id, sortOrder: index }));
const link = (layerId: string, hostLayerId: string, isPreferred: boolean, sortOrder = 0) => ({
  layerId,
  hostLayerId,
  isPreferred,
  sortOrder,
});

describe('buildLayerTree', () => {
  it('puts a layer under its preferred host and keeps unlinked layers as roots', () => {
    const rows = buildLayerTree(layers, [link('b', 'a', true), link('c', 'a', true)], emptyFold());
    expect(rows.map((row) => [row.layerId, row.depth, row.hostId])).toEqual([
      ['a', 0, null],
      ['b', 1, 'a'],
      ['c', 1, 'a'],
      ['d', 0, null],
    ]);
    expect(rows[2]?.lastChild).toBe(true);
    expect(rows[0]?.childCount).toBe(2);
  });

  it('hides children of a collapsed group and keeps the count', () => {
    const rows = buildLayerTree(layers, [link('b', 'a', true), link('c', 'a', true)], {
      groups: ['a'],
      rows: [],
    });
    expect(rows.map((row) => row.layerId)).toEqual(['a', 'd']);
    expect(rows[0]).toMatchObject({ groupCollapsed: true, childCount: 2 });
  });

  it('lists hosts beyond the preferred one without moving the layer', () => {
    const rows = buildLayerTree(
      layers,
      [link('c', 'b', false, 0), link('c', 'a', true, 1), link('c', 'd', false, 2)],
      emptyFold(),
    );
    expect(rows.map((row) => [row.layerId, row.hostId])).toEqual([
      ['a', null],
      ['c', 'a'],
      ['b', null],
      ['d', null],
    ]);
    expect(rows[1]?.otherHostIds).toEqual(['b', 'd']);
    expect(rows[0]?.otherHostIds).toEqual([]);
  });

  it('keeps the real depth and a subtree right after its host, never split by a sibling', () => {
    const six = ['tx', 'or', 'bt', 'gl', 'ph', 'lo'].map((id, index) => ({ id, sortOrder: index }));
    const rows = buildLayerTree(
      six,
      [
        link('or', 'tx', true),
        link('bt', 'or', true),
        link('gl', 'tx', true, 1),
        link('ph', 'tx', true, 2),
        link('ph', 'or', false),
      ],
      emptyFold(),
    );
    expect(rows.map((row) => [row.layerId, row.depth, row.hostId])).toEqual([
      ['tx', 0, null],
      ['or', 1, 'tx'],
      ['bt', 2, 'or'],
      ['gl', 1, 'tx'],
      ['ph', 1, 'tx'],
      ['lo', 0, null],
    ]);
    // The trunk of tx passes the grandchild because or is not tx's last child.
    expect(rows[2]?.guides).toEqual([true]);
    expect(rows[2]?.lastChild).toBe(true);
    expect(rows[1]?.childCount).toBe(1);
    expect(rows[0]?.childCount).toBe(4);
    const collapsed = buildLayerTree(six, [link('or', 'tx', true), link('bt', 'or', true)], {
      groups: ['tx'],
      rows: [],
    });
    expect(collapsed.map((row) => row.layerId)).toEqual(['tx', 'gl', 'ph', 'lo']);
  });

  it('sends layers with a missing host last and survives cycles', () => {
    const rows = buildLayerTree(
      layers,
      [link('b', 'a', true), link('c', 'b', true), link('d', 'zzz', true)],
      emptyFold(),
    );
    expect(rows.map((row) => [row.layerId, row.depth])).toEqual([
      ['a', 0],
      ['b', 1],
      ['c', 2],
      ['d', 0],
    ]);
    const cyc = buildLayerTree(layers, [link('a', 'b', true), link('b', 'a', true)], emptyFold());
    expect(cyc.map((row) => row.layerId).sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('marks a squeezed row and parses a stored fold defensively', () => {
    expect(buildLayerTree(layers, [], { groups: [], rows: ['b'] })[1]?.folded).toBe(true);
    expect(parseFold('{bad')).toEqual(emptyFold());
    expect(parseFold('{"groups":["a",1],"rows":"x"}')).toEqual({ groups: ['a'], rows: [] });
  });
});
