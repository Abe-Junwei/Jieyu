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

  it('nests a text child under its recording layer when both share a host', () => {
    const voiced = [
      { id: 'a', sortOrder: 0 },
      { id: 'b', sortOrder: 1 },
      { id: 'c', sortOrder: 2, parentId: 'b' },
      { id: 'd', sortOrder: 3 },
    ];
    const rows = buildLayerTree(voiced, [link('b', 'a', true), link('c', 'a', true)], emptyFold());
    expect(rows.map((row) => [row.layerId, row.depth, row.hostId])).toEqual([
      ['a', 0, null],
      ['b', 1, 'a'],
      ['c', 2, 'b'],
      ['d', 0, null],
    ]);
  });

  it('hides children of a collapsed group and keeps the count', () => {
    const rows = buildLayerTree(layers, [link('b', 'a', true), link('c', 'a', true)], {
      groups: ['a'],
      rows: [],
    });
    expect(rows.map((row) => row.layerId)).toEqual(['a', 'd']);
    expect(rows[0]).toMatchObject({ groupCollapsed: true, childCount: 2 });
  });

  it('runs other hosts through side lanes docking a hidden end to its visible ancestor and keeping squeezed rows', () => {
    const links = [link('c', 'a', true), link('c', 'b', false)];
    const rows = buildLayerTree(layers, links, emptyFold());
    expect(rows.map((row) => row.layerId)).toEqual(['a', 'c', 'b', 'd']);
    expect(rows[1]?.lanes).toEqual([{ lane: 0, role: 'child', span: 'first' }]);
    expect(rows[2]?.lanes).toEqual([{ lane: 0, role: 'host', span: 'last' }]);
    expect(rows[3]?.lanes).toEqual([]);
    const hidden = buildLayerTree(layers, links, { groups: ['a'], rows: [] });
    expect(hidden.map((row) => [row.layerId, row.lanes.map((lane) => lane.role)])).toEqual([
      ['a', ['child']],
      ['b', ['host']],
      ['d', []],
    ]);
    const folded = buildLayerTree(layers, links, { groups: [], rows: ['b'] });
    expect(folded.map((row) => row.lanes.map((lane) => lane.role))).toEqual([
      [],
      ['child'],
      ['host'],
      [],
    ]);
  });

  it('reuses a lane once its run ended and counts runs beyond the lane cap', () => {
    const many = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id, index) => ({
      id,
      sortOrder: index,
    }));
    const overlapping = buildLayerTree(
      many,
      [
        link('g', 'a', true),
        link('g', 'b', false),
        link('g', 'c', false),
        link('g', 'd', false),
        link('g', 'e', false),
      ],
      emptyFold(),
    );
    const g = overlapping.find((row) => row.layerId === 'g');
    expect(g?.lanes.map((lane) => lane.lane)).toEqual([0, 1, 2]);
    expect(g?.moreHosts).toBe(1);
    const sequential = buildLayerTree(
      many,
      [link('b', 'a', true), link('b', 'c', false), link('e', 'd', true), link('e', 'f', false)],
      emptyFold(),
    );
    expect(sequential.flatMap((row) => row.lanes.map((lane) => lane.lane))).toEqual([0, 0, 0, 0]);
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
