import { describe, expect, it } from 'vitest';
import {
  descendantDraftIndexes,
  liftSenseChildren,
  liftSenseRoots,
  moveSenseSiblingBlock,
  senseDepth,
} from './lexemeSenseTree';

describe('lexemeSenseTree', () => {
  const nodes = [
    { id: 's0' },
    { id: 's1', parentId: 's0' },
    { id: 's2', parentId: 's1' },
    { id: 's3' },
  ];

  it('counts parent hops and treats missing/cyclic parents as roots', () => {
    expect(senseDepth(nodes, 's0')).toBe(0);
    expect(senseDepth(nodes, 's1')).toBe(1);
    expect(senseDepth(nodes, 's2')).toBe(2);
    expect(senseDepth(nodes, 's3')).toBe(0);
    expect(
      senseDepth(
        [
          { id: 'a', parentId: 'b' },
          { id: 'b', parentId: 'a' },
        ],
        'a',
      ),
    ).toBe(1);
  });

  it('drops a parent draft together with descendants', () => {
    expect(descendantDraftIndexes(nodes, 1)).toEqual([1, 2]);
    expect(descendantDraftIndexes(nodes, 0)).toEqual([0, 1, 2]);
    expect(descendantDraftIndexes([{}], 0)).toEqual([0]);
  });

  it('moves a sibling block without splitting descendants', () => {
    const drafts = [{ id: 'a' }, { id: 'a1', parentId: 'a' }, { id: 'b' }];
    expect(moveSenseSiblingBlock(drafts, 0, 1).map((row) => row.id)).toEqual(['b', 'a', 'a1']);
    expect(moveSenseSiblingBlock(drafts, 0, -1)).toBe(drafts);
    expect(moveSenseSiblingBlock(drafts, 1, 1)).toBe(drafts);
    const swapped = moveSenseSiblingBlock(
      [
        { id: 'c1', parentId: 'p' },
        { id: 'c2', parentId: 'p' },
      ],
      0,
      1,
    );
    expect(swapped.map((row) => row.id)).toEqual(['c2', 'c1']);
  });

  it('groups LIFT roots vs children without duplicating nested rows as roots', () => {
    expect(liftSenseRoots(nodes).map((row) => row.id)).toEqual(['s0', 's3']);
    expect(liftSenseChildren(nodes, 's0').map((row) => row.id)).toEqual(['s1']);
    expect(liftSenseChildren(nodes, 's1').map((row) => row.id)).toEqual(['s2']);
  });
});
