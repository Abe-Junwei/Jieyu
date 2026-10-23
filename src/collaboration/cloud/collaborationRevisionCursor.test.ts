import { describe, expect, it } from 'vitest';
import {
  advanceContiguousRevision,
  forceRevisionCursor,
} from './collaborationRevisionCursor';

describe('advanceContiguousRevision (#361)', () => {
  it('失败缺口未补时，更高 revision 不推进已提交游标 | gap blocks higher revisions', () => {
    const pending = new Set<number>();
    // cursor=9; rev 10 failed (never recorded); rev 11 succeeds
    const after11 = advanceContiguousRevision(9, pending, 11);
    expect(after11.committed).toBe(9);
    expect(after11.didAdvance).toBe(false);
    expect(pending.has(11)).toBe(true);

    // recovery later applies 10 → advances through 11
    const after10 = advanceContiguousRevision(after11.committed, pending, 10);
    expect(after10.committed).toBe(11);
    expect(after10.didAdvance).toBe(true);
    expect(pending.size).toBe(0);
  });

  it('连续成功时逐步推进 | contiguous successes advance step by step', () => {
    const pending = new Set<number>();
    expect(advanceContiguousRevision(9, pending, 10)).toEqual({
      committed: 10,
      didAdvance: true,
    });
    expect(advanceContiguousRevision(10, pending, 11)).toEqual({
      committed: 11,
      didAdvance: true,
    });
  });

  it('force 仍可跳到更高（出站/水合）| force may jump for outbound/hydration', () => {
    expect(forceRevisionCursor(9, 11)).toBe(11);
  });
});
