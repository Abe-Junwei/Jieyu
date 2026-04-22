import { describe, expect, it } from 'vitest';
import { TIMELINE_PARITY_MATRIX, TIMELINE_PARITY_MATRIX_VERSION } from './timelineParityMatrix';

/**
 * 阶段 F 契约锚点：语段范围拖建「单一反馈面」与壳层解耦的验收矩阵行。
 * 实现收敛见 docs/execution/plans/时间轴视口单写者与声学插件重构规划-2026-04-21.md §阶段 F；
 * 阶段 F·1（preview 状态单一写者）为 backlog，见该文档「阶段 1（下一迭代）」。
 */
describe('segmentRangeGestureParity', () => {
  it('locks matrix version for phase F contract drift', () => {
    expect(TIMELINE_PARITY_MATRIX_VERSION).toBe(18);
  });

  it('declares segment-range-gesture-single-surface parity targets', () => {
    const row = TIMELINE_PARITY_MATRIX.find((r) => r.id === 'segment-range-gesture-single-surface');
    expect(row, 'matrix row segment-range-gesture-single-surface').toBeDefined();
    if (!row) return;
    expect(row.parity.waveform).toBe('full');
    expect(row.parity.textOnly).toBe('full');
    expect(row.parity.vertical).toBe('partial');
    expect(row.verticalGapZh?.length).toBeGreaterThan(0);
    expect(row.testAnchors).toContain('src/pages/timelineParityMatrix.test.ts');
    expect(row.testAnchors).toContain('src/pages/segmentRangeGestureParity.test.ts');
    expect(row.testAnchors).toContain('src/pages/TranscriptionPage.structure.test.ts');
    expect(row.testAnchors).toContain('src/hooks/useLasso.test.tsx');
  });
});
