/**
 * LayerConstraintService 扩展测试
 * Extended tests for validateExisting, repair, canCreate/Delete, getLinked, getMostRecent
 *
 * 已有 constraintModes.test.ts 覆盖 getLayerCreateGuard 与部分 validate/repair。
 * 本文件补充 canCreateLayer, canDeleteLayer, getLinkedLayers,
 * getMostRecentLayerOfType, cycle detection, 以及 repair 边界路径。
 */
import { describe, expect, it } from 'vitest';
import type { LayerDocType, LayerLinkDocType } from '../db';
import {
  canCreateLayer,
  canDeleteLayer,
  getLinkedLayers,
  getMostRecentLayerOfType,
  listIndependentBoundaryTranscriptionLayers,
  repairExistingLayerConstraints,
  validateExistingLayerConstraints,
} from './LayerConstraintService';

// ── helper ───────────────────────────────────────────────────────────────────

let counter = 0;
function makeLayer(
  overrides: Partial<LayerDocType> & { id: string; layerType: 'transcription' | 'translation' },
): LayerDocType {
  counter += 1;
  const ts = `2026-03-25T00:00:${String(counter).padStart(2, '0')}.000Z`;
  return {
    textId: 'text_1',
    key: overrides.key ?? `${overrides.layerType}_${overrides.id}`,
    name: { zho: overrides.id },
    languageId: 'zho',
    modality: 'text',
    createdAt: ts,
    updatedAt: ts,
    ...overrides,
  } as LayerDocType;
}

// ── canCreateLayer ──────────────────────────────────────────────────────────

describe('canCreateLayer', () => {
  it('翻译层需要先有转写层 | translation requires transcription first', () => {
    const result = canCreateLayer([], 'translation');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it('有转写层时可创建翻译层 | allows translation when transcription exists', () => {
    const layers = [makeLayer({ id: 't1', layerType: 'transcription' })];
    const result = canCreateLayer(layers, 'translation');
    expect(result.allowed).toBe(true);
  });

  it('转写层始终允许创建 | transcription is always allowed', () => {
    const result = canCreateLayer([], 'transcription');
    expect(result.allowed).toBe(true);
  });

  it('超过软限制时返回 warning | warns when exceeding soft limit', () => {
    const layers = Array.from({ length: 5 }, (_, i) =>
      makeLayer({ id: `t${i}`, layerType: 'transcription', constraint: 'independent_boundary' }),
    );
    const result = canCreateLayer(layers, 'transcription');
    expect(result.allowed).toBe(true);
    expect(result.warning).toBeTruthy();
  });
});

// ── canDeleteLayer ──────────────────────────────────────────────────────────

describe('canDeleteLayer', () => {
  it('目标不存在时禁止删除 | disallows when target not found', () => {
    const result = canDeleteLayer([], 'nonexistent');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it('翻译层删除始终允许 | allows deleting translation', () => {
    const layers = [
      makeLayer({ id: 't1', layerType: 'transcription', constraint: 'independent_boundary' }),
      makeLayer({ id: 'tl1', layerType: 'translation', parentLayerId: 't1' }),
    ];
    const result = canDeleteLayer(layers, 'tl1');
    expect(result.allowed).toBe(true);
    expect(result.affectedLinkCount).toBe(0);
  });

  it('删除转写层时报告孤儿翻译 | reports orphaned translations on transcription delete', () => {
    const layers = [
      makeLayer({ id: 't1', layerType: 'transcription', constraint: 'independent_boundary' }),
      makeLayer({ id: 't2', layerType: 'transcription', constraint: 'independent_boundary' }),
      makeLayer({ id: 'tl1', layerType: 'translation', parentLayerId: 't1' }),
      makeLayer({ id: 'tl2', layerType: 'translation', parentLayerId: 't1' }),
    ];
    const result = canDeleteLayer(layers, 't1');
    expect(result.allowed).toBe(true);
    expect(result.orphanedTranslationIds).toEqual(['tl1', 'tl2']);
    expect(result.relinkTargetKey).toBeTruthy();
  });

  it('无关联翻译的转写层可直接删除 | allows deletion with no dependent translations', () => {
    const layers = [
      makeLayer({ id: 't1', layerType: 'transcription', constraint: 'independent_boundary' }),
      makeLayer({ id: 't2', layerType: 'transcription', constraint: 'independent_boundary' }),
    ];
    const result = canDeleteLayer(layers, 't1');
    expect(result.allowed).toBe(true);
    expect(result.affectedLinkCount).toBe(0);
  });
});

// ── getLinkedLayers ─────────────────────────────────────────────────────────

describe('getLinkedLayers', () => {
  const emptyLinks: LayerLinkDocType[] = [];

  it('转写层返回关联的翻译层 | transcription returns linked translations', () => {
    const layers = [
      makeLayer({ id: 't1', layerType: 'transcription', constraint: 'independent_boundary' }),
      makeLayer({ id: 'tl1', layerType: 'translation', parentLayerId: 't1' }),
      makeLayer({ id: 'tl2', layerType: 'translation', parentLayerId: 't1' }),
      makeLayer({ id: 'tl3', layerType: 'translation', parentLayerId: 'other' }),
    ];
    const linked = getLinkedLayers(emptyLinks, layers, 't1');
    expect(linked).toHaveLength(2);
    expect(linked.map((l) => l.id)).toEqual(['tl1', 'tl2']);
  });

  it('翻译层返回父转写层 | translation returns parent transcription', () => {
    const layers = [
      makeLayer({ id: 't1', layerType: 'transcription', constraint: 'independent_boundary' }),
      makeLayer({ id: 'tl1', layerType: 'translation', parentLayerId: 't1' }),
    ];
    const linked = getLinkedLayers(emptyLinks, layers, 'tl1');
    expect(linked).toHaveLength(1);
    expect(linked[0]!.id).toBe('t1');
  });

  it('无 parentLayerId 的翻译层返回空 | translation without parent returns empty', () => {
    const layers = [
      makeLayer({ id: 'tl1', layerType: 'translation' }),
    ];
    const linked = getLinkedLayers(emptyLinks, layers, 'tl1');
    expect(linked).toEqual([]);
  });

  it('目标不存在时返回空 | returns empty for unknown layer', () => {
    expect(getLinkedLayers(emptyLinks, [], 'xxx')).toEqual([]);
  });
});

// ── getMostRecentLayerOfType ────────────────────────────────────────────────

describe('getMostRecentLayerOfType', () => {
  it('返回最近创建的指定类型层 | returns most recently created layer of type', () => {
    const layers = [
      makeLayer({ id: 't1', layerType: 'transcription', createdAt: '2026-01-01T00:00:00.000Z' }),
      makeLayer({ id: 't2', layerType: 'transcription', createdAt: '2026-06-01T00:00:00.000Z' }),
      makeLayer({ id: 'tl1', layerType: 'translation', createdAt: '2026-12-01T00:00:00.000Z' }),
    ];
    const most = getMostRecentLayerOfType(layers, 'transcription');
    expect(most?.id).toBe('t2');
  });

  it('无匹配类型时返回 undefined | returns undefined when no match', () => {
    expect(getMostRecentLayerOfType([], 'translation')).toBeUndefined();
  });
});

// ── listIndependentBoundaryTranscriptionLayers ─────────────────────────────

describe('listIndependentBoundaryTranscriptionLayers', () => {
  it('仅返回 independent_boundary 转写层 | only returns independent_boundary transcriptions', () => {
    const layers = [
      makeLayer({ id: 't1', layerType: 'transcription', constraint: 'independent_boundary' }),
      makeLayer({ id: 't2', layerType: 'transcription', constraint: 'symbolic_association', parentLayerId: 't1' }),
      makeLayer({ id: 'tl1', layerType: 'translation', parentLayerId: 't1' }),
    ];
    const result = listIndependentBoundaryTranscriptionLayers(layers);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('t1');
  });

  it('按 sortOrder 排序 | sorts by sortOrder', () => {
    const layers = [
      makeLayer({ id: 'b', layerType: 'transcription', constraint: 'independent_boundary', sortOrder: 2 }),
      makeLayer({ id: 'a', layerType: 'transcription', constraint: 'independent_boundary', sortOrder: 1 }),
    ];
    const result = listIndependentBoundaryTranscriptionLayers(layers);
    expect(result[0]!.id).toBe('a');
    expect(result[1]!.id).toBe('b');
  });
});

// ── validateExistingLayerConstraints — cycle detection ──────────────────────

describe('validateExistingLayerConstraints — cycle', () => {
  it('检测 parentLayerId 循环 | detects parent cycle', () => {
    const layers = [
      makeLayer({ id: 'a', layerType: 'transcription', constraint: 'independent_boundary', parentLayerId: 'b' }),
      makeLayer({ id: 'b', layerType: 'transcription', constraint: 'independent_boundary', parentLayerId: 'a' }),
    ];
    const issues = validateExistingLayerConstraints(layers);
    const cycleIssues = issues.filter((i) => i.code === 'parent-cycle-detected');
    expect(cycleIssues.length).toBeGreaterThanOrEqual(1);
  });

  it('检测 parent-layer-not-found | detects missing parent', () => {
    const layers = [
      makeLayer({ id: 't1', layerType: 'transcription', constraint: 'independent_boundary' }),
      makeLayer({ id: 'tl1', layerType: 'translation', constraint: 'symbolic_association', parentLayerId: 'ghost' }),
    ];
    const issues = validateExistingLayerConstraints(layers);
    expect(issues.some((i) => i.code === 'parent-layer-not-found')).toBe(true);
  });
});

// ── repairExistingLayerConstraints — edge paths ────────────────────────────

describe('repairExistingLayerConstraints — edge paths', () => {
  it('修复根转写层非 independent_boundary | repairs root transcription', () => {
    const layers = [
      makeLayer({ id: 'root', layerType: 'transcription', constraint: 'symbolic_association' }),
    ];
    const { layers: repaired, repairs } = repairExistingLayerConstraints(layers);
    const root = repaired.find((l) => l.id === 'root')!;
    expect(root.constraint).toBe('independent_boundary');
    expect(repairs.some((r) => r.code === 'invalid-root-transcription-constraint')).toBe(true);
  });

  it('无可用父层时降级为 independent_boundary | downgrades when no fallback parent', () => {
    // 只有一个转写层是 symbolic_association（被修复为 independent），翻译层无法找到 fallback
    const layers = [
      makeLayer({ id: 'only', layerType: 'transcription', constraint: 'symbolic_association' }),
      makeLayer({ id: 'tl1', layerType: 'translation', constraint: 'symbolic_association' }),
    ];
    const { layers: repaired } = repairExistingLayerConstraints(layers);
    // 根层修成 independent，翻译层应绑定到该父层
    const tl = repaired.find((l) => l.id === 'tl1')!;
    expect(tl.constraint).toBe('symbolic_association');
    expect(tl.parentLayerId).toBe('only');
  });

  it('修复 cycle 引用 | repairs cycle by rebinding or removing parent', () => {
    const layers = [
      makeLayer({ id: 'ind', layerType: 'transcription', constraint: 'independent_boundary' }),
      makeLayer({ id: 'a', layerType: 'transcription', constraint: 'independent_boundary', parentLayerId: 'b' }),
      makeLayer({ id: 'b', layerType: 'transcription', constraint: 'independent_boundary', parentLayerId: 'a' }),
    ];
    const { layers: repaired, repairs } = repairExistingLayerConstraints(layers);
    const cycleRepairs = repairs.filter((r) => r.code === 'parent-cycle-detected');
    expect(cycleRepairs.length).toBeGreaterThanOrEqual(1);
    expect(validateExistingLayerConstraints(repaired).some((issue) => issue.code === 'parent-cycle-detected')).toBe(false);
  });

  it('time_subdivision 禁用时降级为 symbolic_association | downgrades time_subdivision to symbolic', () => {
    const layers = [
      makeLayer({ id: 't1', layerType: 'transcription', constraint: 'independent_boundary' }),
      makeLayer({ id: 'tl1', layerType: 'translation', constraint: 'time_subdivision', parentLayerId: 't1' }),
    ];
    const { layers: repaired, repairs } = repairExistingLayerConstraints(layers, { time_subdivision: false });
    const tl = repaired.find((l) => l.id === 'tl1')!;
    expect(tl.constraint).toBe('symbolic_association');
    expect(repairs.some((r) => r.code === 'constraint-runtime-not-supported')).toBe(true);
  });
});
