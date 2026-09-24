import { describe, expect, it } from 'vitest';
import {
  canDemoteSense,
  demoteSense,
  descendantDraftIndexes,
  liftSenseChildren,
  liftSenseRoots,
  moveSenseSiblingBlock,
  promoteSense,
  senseDepth,
  type SenseTreeNode,
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

  it('promotes a sense one level without moving descendants or replacing the primary gloss', () => {
    const childOfPrimary = [{ id: 'pet', parentId: 'primary' }];
    const promoted = promoteSense(childOfPrimary, 0, 'primary');
    expect(promoted[0]?.parentId).toBeUndefined();
    const root = [{ id: 'root' }];
    expect(promoteSense(root, 0, 'primary')).toBe(root);
    const nested = [
      { id: 'pet', parentId: 'primary' },
      { id: 'pup', parentId: 'pet' },
      { id: 'kit', parentId: 'pup' },
    ];
    const raised = promoteSense(nested, 2, 'primary');
    expect(raised.map((row) => row.parentId)).toEqual(['primary', 'pet', 'pet']);
    expect(raised.map((row) => row.id)).toEqual(['pet', 'pup', 'kit']);
    const underRoot = [{ id: 'pet' }, { id: 'pup', parentId: 'pet' }];
    expect(promoteSense(underRoot, 1, 'primary')[1]?.parentId).toBeUndefined();
    const withChild = [
      { id: 'pet', parentId: 'primary' },
      { id: 'pup', parentId: 'pet' },
      { id: 'speck', parentId: 'pup' },
    ];
    expect(promoteSense(withChild, 1, 'primary').map((row) => row.parentId)).toEqual([
      'primary',
      'primary',
      'pup',
    ]);
  });

  it('demotes under the previous sibling or the primary gloss and leaves descendants attached', () => {
    const roots = [{ id: 'pet' }, { id: 'hound' }, { id: 'pup', parentId: 'hound' }];
    const underSibling = demoteSense(roots, 1, 'primary');
    expect(underSibling.map((row) => row.id)).toEqual(['pet', 'hound', 'pup']);
    expect(underSibling.map((row) => row.parentId)).toEqual([undefined, 'pet', 'hound']);
    const firstRoot: SenseTreeNode[] = [{ id: 'pet' }];
    expect(demoteSense(firstRoot, 0, 'primary')[0]?.parentId).toBe('primary');
    expect(demoteSense(firstRoot, 0, '')).toBe(firstRoot);
    expect(canDemoteSense(firstRoot, 0, '')).toBe(true);
    const primaryChildren = [
      { id: 'pet', parentId: 'primary' },
      { id: 'hound', parentId: 'primary' },
    ];
    expect(demoteSense(primaryChildren, 0, 'primary')).toBe(primaryChildren);
    expect(canDemoteSense(primaryChildren, 0, 'primary')).toBe(false);
    expect(demoteSense(primaryChildren, 1, 'primary')[1]?.parentId).toBe('pet');
    const mixed = [
      { id: 'root' },
      { id: 'pet', parentId: 'primary' },
      { id: 'hound', parentId: 'primary' },
    ];
    expect(demoteSense(mixed, 2, 'primary')[2]?.parentId).toBe('pet');
    const missingSiblingId = [{}, { id: 'hound' }];
    expect(demoteSense(missingSiblingId, 1, 'primary')).toBe(missingSiblingId);
    expect(canDemoteSense(missingSiblingId, 1, 'primary')).toBe(true);
    const capped = [
      ...Array.from({ length: 7 }, (_, level) => ({
        id: `d${level + 1}`,
        parentId: level === 0 ? 'primary' : `d${level}`,
      })),
      { id: 'a', parentId: 'd7' },
      { id: 'b', parentId: 'd7' },
    ];
    expect(demoteSense(capped, capped.length - 1, 'primary')).toBe(capped);
  });

  it('groups LIFT roots vs children without duplicating nested rows as roots', () => {
    expect(liftSenseRoots(nodes).map((row) => row.id)).toEqual(['s0', 's3']);
    expect(liftSenseChildren(nodes, 's0').map((row) => row.id)).toEqual(['s1']);
    expect(liftSenseChildren(nodes, 's1').map((row) => row.id)).toEqual(['s2']);
  });
});
