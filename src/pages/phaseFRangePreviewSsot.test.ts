import { describe, expect, it } from 'vitest';
import { TIMELINE_PARITY_MATRIX, TIMELINE_PARITY_MATRIX_VERSION } from './timelineParityMatrix';

/**
 * 阶段 F·1 工程锚点：语段范围拖建「预览状态」读模型 SSOT（编排 + 主波形渲染贯通）。
 * 产品说明见 docs/execution/plans/时间轴视口单写者与声学插件重构规划-2026-04-21.md §4「阶段 1」。
 */
describe('phaseFRangePreviewSsotParity', () => {
  it('locks matrix version for phase F·1 SSOT contract drift', () => {
    expect(TIMELINE_PARITY_MATRIX_VERSION).toBe(18);
  });

  it('declares phase-f-range-preview-ssot as full parity with regression anchors', () => {
    const row = TIMELINE_PARITY_MATRIX.find((r) => r.id === 'phase-f-range-preview-ssot');
    expect(row, 'matrix row phase-f-range-preview-ssot').toBeDefined();
    if (!row) return;
    expect(row.parity.waveform).toBe('full');
    expect(row.parity.textOnly).toBe('full');
    expect(row.parity.vertical).toBe('full');
    expect(row.testAnchors).toContain('src/pages/phaseFRangePreviewSsot.test.ts');
    expect(row.testAnchors).toContain('src/utils/segmentRangeGesturePreviewReadModel.test.ts');
    expect(row.testAnchors).toContain('src/utils/segmentRangeGesturePreviewWriter.test.ts');
    expect(row.testAnchors).toContain('src/hooks/useSegmentRangeGesturePreviewWriter.test.ts');
    expect(row.verticalGapZh?.length).toBeGreaterThan(0);
  });
});
