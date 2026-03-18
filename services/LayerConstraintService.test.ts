/**
 * 层约束验证服务测试
 * Layer constraint service tests
 */
import { describe, it, expect } from 'vitest';
import type { TranslationLayerDocType, LayerLinkDocType } from '../db';
import {
  canCreateLayer,
  canDeleteLayer,
  getLinkedLayers,
  getMostRecentLayerOfType,
} from './LayerConstraintService';

// ─── 测试数据工厂 | Test data factories ─────────────────────────────

const now = '2026-03-15T00:00:00.000Z';

function makeLayer(
  overrides: Partial<TranslationLayerDocType> & { id: string; key: string; layerType: 'transcription' | 'translation' },
): TranslationLayerDocType {
  return {
    textId: 'text_1',
    name: { zho: overrides.key },
    languageId: 'cmn',
    modality: 'text',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as TranslationLayerDocType;
}

function makeLink(trcKey: string, trlId: string): LayerLinkDocType {
  return {
    id: `link_${trcKey}_${trlId}`,
    transcriptionLayerKey: trcKey,
    tierId: trlId,
    linkType: 'free',
    isPreferred: false,
    createdAt: now,
  };
}

// ─── canCreateLayer ──────────────────────────────────────────────────

describe('canCreateLayer', () => {
  it('allows creating transcription layer on empty project', () => {
    const result = canCreateLayer([], 'transcription');
    expect(result.allowed).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('blocks creating translation layer when no transcription layer exists', () => {
    const result = canCreateLayer([], 'translation');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('转写层');
  });

  it('allows creating translation layer when transcription layer exists', () => {
    const layers = [makeLayer({ id: 'trc1', key: 'trc_cmn_abc', layerType: 'transcription' })];
    const result = canCreateLayer(layers, 'translation');
    expect(result.allowed).toBe(true);
  });

  it('warns when transcription layers exceed soft limit', () => {
    const layers = Array.from({ length: 5 }, (_, i) =>
      makeLayer({ id: `trc${i}`, key: `trc_cmn_${i}`, layerType: 'transcription' }),
    );
    const result = canCreateLayer(layers, 'transcription');
    expect(result.allowed).toBe(true);
    expect(result.warning).toContain('5');
  });

  it('warns when translation layers exceed soft limit', () => {
    const trc = makeLayer({ id: 'trc1', key: 'trc_cmn_abc', layerType: 'transcription' });
    const trls = Array.from({ length: 10 }, (_, i) =>
      makeLayer({ id: `trl${i}`, key: `trl_eng_${i}`, layerType: 'translation' }),
    );
    const result = canCreateLayer([trc, ...trls], 'translation');
    expect(result.allowed).toBe(true);
    expect(result.warning).toContain('10');
  });

  it('no warning when below soft limit', () => {
    const layers = [
      makeLayer({ id: 'trc1', key: 'trc_cmn_abc', layerType: 'transcription' }),
      makeLayer({ id: 'trl1', key: 'trl_eng_xyz', layerType: 'translation' }),
    ];
    const result = canCreateLayer(layers, 'translation');
    expect(result.allowed).toBe(true);
    expect(result.warning).toBeUndefined();
  });
});

// ─── canDeleteLayer ──────────────────────────────────────────────────

describe('canDeleteLayer', () => {
  it('blocks deleting the last transcription layer when translations exist', () => {
    const layers = [
      makeLayer({ id: 'trc1', key: 'trc_cmn_abc', layerType: 'transcription' }),
      makeLayer({ id: 'trl1', key: 'trl_eng_xyz', layerType: 'translation' }),
    ];
    const result = canDeleteLayer(layers, [], 'trc1');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('翻译层');
  });

  it('allows deleting the last transcription layer when no translations exist', () => {
    const layers = [
      makeLayer({ id: 'trc1', key: 'trc_cmn_abc', layerType: 'transcription' }),
    ];
    const result = canDeleteLayer(layers, [], 'trc1');
    expect(result.allowed).toBe(true);
  });

  it('allows deleting a transcription layer when others remain', () => {
    const layers = [
      makeLayer({ id: 'trc1', key: 'trc_cmn_abc', layerType: 'transcription' }),
      makeLayer({ id: 'trc2', key: 'trc_yue_def', layerType: 'transcription' }),
      makeLayer({ id: 'trl1', key: 'trl_eng_xyz', layerType: 'translation' }),
    ];
    const links = [makeLink('trc_cmn_abc', 'trl1')];
    const result = canDeleteLayer(layers, links, 'trc1');
    expect(result.allowed).toBe(true);
    expect(result.affectedLinkCount).toBe(1);
  });

  it('allows deleting a translation layer and counts affected links', () => {
    const layers = [
      makeLayer({ id: 'trc1', key: 'trc_cmn_abc', layerType: 'transcription' }),
      makeLayer({ id: 'trl1', key: 'trl_eng_xyz', layerType: 'translation' }),
    ];
    const links = [makeLink('trc_cmn_abc', 'trl1')];
    const result = canDeleteLayer(layers, links, 'trl1');
    expect(result.allowed).toBe(true);
    expect(result.affectedLinkCount).toBe(1);
  });

  it('returns not allowed for non-existent layer', () => {
    const result = canDeleteLayer([], [], 'nonexistent');
    expect(result.allowed).toBe(false);
  });

  it('detects orphaned translation layers when deleting a transcription layer', () => {
    const trc1 = makeLayer({ id: 'trc1', key: 'trc_cmn_abc', layerType: 'transcription' });
    const trc2 = makeLayer({ id: 'trc2', key: 'trc_yue_def', layerType: 'transcription', createdAt: '2026-03-15T12:00:00.000Z' });
    const trl1 = makeLayer({ id: 'trl1', key: 'trl_eng_xyz', layerType: 'translation' });
    const layers = [trc1, trc2, trl1];
    // trl1 only linked to trc1 → will be orphaned
    const links = [makeLink('trc_cmn_abc', 'trl1')];
    const result = canDeleteLayer(layers, links, 'trc1');
    expect(result.allowed).toBe(true);
    expect(result.orphanedTranslationIds).toEqual(['trl1']);
    expect(result.relinkTargetKey).toBe('trc_yue_def');
  });

  it('does not report orphans when translation has other links', () => {
    const trc1 = makeLayer({ id: 'trc1', key: 'trc_cmn_abc', layerType: 'transcription' });
    const trc2 = makeLayer({ id: 'trc2', key: 'trc_yue_def', layerType: 'transcription' });
    const trl1 = makeLayer({ id: 'trl1', key: 'trl_eng_xyz', layerType: 'translation' });
    const layers = [trc1, trc2, trl1];
    // trl1 linked to both trc1 and trc2 → not orphaned
    const links = [makeLink('trc_cmn_abc', 'trl1'), makeLink('trc_yue_def', 'trl1')];
    const result = canDeleteLayer(layers, links, 'trc1');
    expect(result.allowed).toBe(true);
    expect(result.orphanedTranslationIds).toBeUndefined();
    expect(result.relinkTargetKey).toBeUndefined();
  });

  it('picks most recent remaining transcription as relink target', () => {
    const trc1 = makeLayer({ id: 'trc1', key: 'trc_cmn_1', layerType: 'transcription', createdAt: '2026-03-10T00:00:00.000Z' });
    const trc2 = makeLayer({ id: 'trc2', key: 'trc_cmn_2', layerType: 'transcription', createdAt: '2026-03-12T00:00:00.000Z' });
    const trc3 = makeLayer({ id: 'trc3', key: 'trc_cmn_3', layerType: 'transcription', createdAt: '2026-03-14T00:00:00.000Z' });
    const trl1 = makeLayer({ id: 'trl1', key: 'trl_eng_1', layerType: 'translation' });
    const layers = [trc1, trc2, trc3, trl1];
    // trl1 only linked to trc3
    const links = [makeLink('trc_cmn_3', 'trl1')];
    const result = canDeleteLayer(layers, links, 'trc3');
    expect(result.orphanedTranslationIds).toEqual(['trl1']);
    expect(result.relinkTargetKey).toBe('trc_cmn_2'); // trc2 is more recent than trc1
  });
});

// ─── getLinkedLayers ─────────────────────────────────────────────────

describe('getLinkedLayers', () => {
  const trc1 = makeLayer({ id: 'trc1', key: 'trc_cmn_abc', layerType: 'transcription' });
  const trc2 = makeLayer({ id: 'trc2', key: 'trc_yue_def', layerType: 'transcription' });
  const trl1 = makeLayer({ id: 'trl1', key: 'trl_eng_xyz', layerType: 'translation' });
  const trl2 = makeLayer({ id: 'trl2', key: 'trl_jpn_uvw', layerType: 'translation' });
  const layers = [trc1, trc2, trl1, trl2];
  const links = [
    makeLink('trc_cmn_abc', 'trl1'),
    makeLink('trc_cmn_abc', 'trl2'),
    makeLink('trc_yue_def', 'trl1'),
  ];

  it('finds linked translations for a transcription layer', () => {
    const linked = getLinkedLayers(links, layers, 'trc1');
    expect(linked.map((l) => l.id)).toEqual(['trl1', 'trl2']);
  });

  it('finds linked transcriptions for a translation layer', () => {
    const linked = getLinkedLayers(links, layers, 'trl1');
    expect(linked.map((l) => l.id)).toEqual(['trc1', 'trc2']);
  });

  it('returns empty array for layer with no links', () => {
    const linked = getLinkedLayers(links, layers, 'trc2');
    // trc2 is linked to trl1 only
    expect(linked.map((l) => l.id)).toEqual(['trl1']);
  });

  it('returns empty array for non-existent layer', () => {
    expect(getLinkedLayers(links, layers, 'nonexistent')).toEqual([]);
  });
});

// ─── getMostRecentLayerOfType ────────────────────────────────────────

describe('getMostRecentLayerOfType', () => {
  it('returns the most recently created layer of given type', () => {
    const layers = [
      makeLayer({ id: 'trc1', key: 'trc_cmn_1', layerType: 'transcription', createdAt: '2026-03-14T00:00:00.000Z' }),
      makeLayer({ id: 'trc2', key: 'trc_cmn_2', layerType: 'transcription', createdAt: '2026-03-15T00:00:00.000Z' }),
      makeLayer({ id: 'trl1', key: 'trl_eng_1', layerType: 'translation', createdAt: '2026-03-15T12:00:00.000Z' }),
    ];
    expect(getMostRecentLayerOfType(layers, 'transcription')?.id).toBe('trc2');
    expect(getMostRecentLayerOfType(layers, 'translation')?.id).toBe('trl1');
  });

  it('returns undefined when no layers of given type exist', () => {
    expect(getMostRecentLayerOfType([], 'transcription')).toBeUndefined();
  });
});
