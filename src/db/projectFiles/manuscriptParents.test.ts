import { describe, expect, it } from 'vitest';
import { crossManuscriptParentLinks } from './manuscriptParents';

describe('crossManuscriptParentLinks', () => {
  it('rejects a parent link whose ends are in different manuscripts', () => {
    expect(
      crossManuscriptParentLinks([
        { id: 'child', manuscriptId: 'doc-a', parentUnitId: 'parent' },
        { id: 'parent', manuscriptId: 'doc-b' },
      ]),
    ).toEqual([{ unitId: 'child', parentUnitId: 'parent' }]);
  });

  it('allows a parent link inside one manuscript', () => {
    expect(
      crossManuscriptParentLinks([
        { id: 'child', manuscriptId: 'doc-a', parentUnitId: 'parent' },
        { id: 'parent', manuscriptId: 'doc-a' },
      ]),
    ).toEqual([]);
  });
});
