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

  it('draws a groove between a child and a non-preferred host only when both rows show', () => {
    const links = [link('c', 'a', true), link('c', 'b', false)];
    const rows = buildLayerTree(layers, links, emptyFold());
    expect(rows.map((row) => [row.layerId, row.groove])).toEqual(
      [
        ['a', 'none'],
        ['c', 'none'],
        ['b', 'none'],
        ['d', 'none'],
      ].map(([id]) => [id, expect.any(String)]),
    );
    const grooved = Object.fromEntries(rows.map((row) => [row.layerId, row.groove]));
    expect(grooved).toMatchObject({ b: 'start', c: 'end' });
    const hidden = buildLayerTree(layers, links, { groups: ['a'], rows: [] });
    expect(hidden.every((row) => row.groove === 'none')).toBe(true);
  });

  it('flattens to two levels, sends layers with a missing host last, and survives cycles', () => {
    const rows = buildLayerTree(
      layers,
      [link('b', 'a', true), link('c', 'b', true), link('d', 'zzz', true)],
      emptyFold(),
    );
    expect(rows.map((row) => [row.layerId, row.depth])).toEqual([
      ['a', 0],
      ['b', 1],
      ['c', 1],
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
