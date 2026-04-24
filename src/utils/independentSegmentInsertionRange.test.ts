import { describe, expect, it } from 'vitest';
import { clampIndependentSegmentInsertionRange } from './independentSegmentInsertionRange';

describe('clampIndependentSegmentInsertionRange', () => {
  it('在空白轴上保持用户选区（仅最小跨度抬升）', () => {
    const r = clampIndependentSegmentInsertionRange(1, 2, [], Number.POSITIVE_INFINITY);
    expect(r).toEqual({ ok: true, start: 1, end: 2 });
  });

  it('将起点钳制到上一段 end+gap', () => {
    const r = clampIndependentSegmentInsertionRange(0.5, 3, [{ startTime: 0, endTime: 1 }], 100);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.start).toBeCloseTo(1.02, 3);
      expect(r.end).toBe(3);
    }
  });

  it('两语段间间隙不足以容纳最小时长时判为不可插入', () => {
    const r = clampIndependentSegmentInsertionRange(1.02, 1.04, [
      { startTime: 0, endTime: 1 },
      { startTime: 1.05, endTime: 2 },
    ], 10);
    expect(r.ok).toBe(false);
  });
});
