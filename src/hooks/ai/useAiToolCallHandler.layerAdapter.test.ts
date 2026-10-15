import { describe, expect, it, vi } from 'vitest';
import { getAiToolLayerLinkExecutionToolNames } from '../../ai/policy/aiToolPolicyMatrix';
import { getDb } from '../../db';
import { layerAdapter } from './useAiToolCallHandler.layerAdapter';

describe('layerAdapter', () => {
  it('keeps layer-link handles aligned with policy SSOT', () => {
    expect(layerAdapter.handles).toEqual([
      'create_transcription_layer',
      'create_translation_layer',
      'delete_layer',
      ...getAiToolLayerLinkExecutionToolNames(),
    ]);
    expect(layerAdapter.handles).not.toContain('set_transcription_text');
  });

  it('returns clear error when delete_layer receives unsupported layerType', async () => {
    const result = await layerAdapter.execute({
      locale: 'zh-CN',
      call: {
        name: 'delete_layer',
        arguments: {
          layerType: 'gloss',
          languageQuery: '中文',
        },
      },
      transcriptionLayers: [],
      translationLayers: [],
    } as never);

    expect(result.ok).toBe(false);
    expect(result.message).toContain('无效的层类型');
    expect(result.message).toContain('gloss');
  });

  it('reports delete_layer as not written when the tier row is still there', async () => {
    const db = await getDb();
    const now = new Date().toISOString();
    await db.dexie.tier_definitions.put({
      id: 'layer-keep',
      textId: 'text-1',
      key: 'layer-keep',
      name: { default: 'Keep' },
      tierType: 'time-aligned',
      contentType: 'transcription',
      languageId: 'eng',
      createdAt: now,
      updatedAt: now,
    });

    const result = await layerAdapter.execute({
      locale: 'zh-CN',
      call: { name: 'delete_layer', arguments: { layerId: 'layer-keep' } },
      transcriptionLayers: [{ id: 'layer-keep' }],
      translationLayers: [],
      deleteLayer: async () => {
        throw new Error('rolled back');
      },
    } as never);

    expect(result.ok).toBe(false);
    expect(result.message).toContain('layer-keep');
  });

  it('treats delete_layer as done when the tier row is already gone', async () => {
    const result = await layerAdapter.execute({
      locale: 'zh-CN',
      call: { name: 'delete_layer', arguments: { layerId: 'layer-gone' } },
      transcriptionLayers: [{ id: 'layer-gone' }],
      translationLayers: [],
      deleteLayer: async () => {
        throw new Error('post-commit');
      },
    } as never);

    expect(result.ok).toBe(true);
  });

  it('treats create_transcription_layer as done when a matching tier row landed before the throw', async () => {
    const db = await getDb();
    const now = new Date().toISOString();
    const result = await layerAdapter.execute({
      locale: 'zh-CN',
      call: { name: 'create_transcription_layer', arguments: { languageId: 'eng' } },
      transcriptionLayers: [],
      translationLayers: [],
      createLayer: async () => {
        await db.dexie.tier_definitions.put({
          id: 'layer-new-eng',
          textId: 'text-1',
          key: 'layer-new-eng',
          name: { default: 'English' },
          tierType: 'time-aligned',
          contentType: 'transcription',
          languageId: 'eng',
          createdAt: now,
          updatedAt: now,
        });
        throw new Error('post-commit');
      },
    } as never);

    expect(result.ok).toBe(true);
  });
});

const COMPENSATION_TTL_MS = 60_000;

async function seedCompensationTier(id: string): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.dexie.tier_definitions.put({
    id,
    textId: 'text-comp',
    key: id,
    name: { default: id },
    tierType: 'time-aligned',
    contentType: 'translation',
    languageId: 'eng',
    createdAt: now,
    updatedAt: now,
  });
}

function compensationRef(layerId: string, createdAt = Date.now()) {
  return {
    current: new Map([['req-comp', { layerId, layerType: 'translation' as const, createdAt }]]),
  };
}

describe('layerAdapter compensation rollback', () => {
  it('removes a fresh compensated layer and says it was rolled back', async () => {
    await seedCompensationTier('layer-rolled-back');
    const db = await getDb();
    const held = compensationRef('layer-rolled-back');

    const result = await layerAdapter.execute({
      locale: 'zh-CN',
      call: {
        name: 'link_translation_layer',
        requestId: 'req-comp',
        arguments: { transcriptionLayerId: 'trc-missing', translationLayerId: 'trl-any' },
      },
      compensationRef: held,
      COMPENSATION_TTL_MS,
      resolveTranscriptionLayerForLink: () => null,
      deleteLayer: async (id: string) => {
        await db.dexie.tier_definitions.delete(id);
      },
    } as never);

    expect(result.ok).toBe(false);
    expect(result.message).toContain('已自动回滚刚创建的层（layer-rolled-back）');
    expect(await db.dexie.tier_definitions.get('layer-rolled-back')).toBeUndefined();
    expect(held.current.has('req-comp')).toBe(false);
  });

  it('says rollback failed when the compensated layer is still there', async () => {
    await seedCompensationTier('layer-stuck');
    const db = await getDb();
    const held = compensationRef('layer-stuck');

    const result = await layerAdapter.execute({
      locale: 'zh-CN',
      call: {
        name: 'link_translation_layer',
        requestId: 'req-comp',
        arguments: { transcriptionLayerId: 'trc-missing', translationLayerId: 'trl-any' },
      },
      compensationRef: held,
      COMPENSATION_TTL_MS,
      resolveTranscriptionLayerForLink: () => null,
      deleteLayer: async () => {
        throw new Error('blocked');
      },
    } as never);

    expect(result.ok).toBe(false);
    expect(result.message).toContain('回滚失败，刚创建的层还在（layer-stuck）');
    expect(await db.dexie.tier_definitions.get('layer-stuck')).toBeTruthy();
    expect(held.current.has('req-comp')).toBe(false);
  });

  it('keeps the rolled-back sentence when the delete landed and then threw', async () => {
    await seedCompensationTier('layer-landed');
    const db = await getDb();

    const result = await layerAdapter.execute({
      locale: 'zh-CN',
      call: {
        name: 'link_translation_layer',
        requestId: 'req-comp',
        arguments: { transcriptionLayerId: 'trc-missing', translationLayerId: 'trl-any' },
      },
      compensationRef: compensationRef('layer-landed'),
      COMPENSATION_TTL_MS,
      resolveTranscriptionLayerForLink: () => null,
      deleteLayer: async (id: string) => {
        await db.dexie.tier_definitions.delete(id);
        throw new Error('post-commit');
      },
    } as never);

    expect(result.ok).toBe(false);
    expect(result.message).toContain('已自动回滚刚创建的层（layer-landed）');
    expect(result.message).not.toContain('回滚失败');
    expect(await db.dexie.tier_definitions.get('layer-landed')).toBeUndefined();
  });

  it('leaves an expired compensated layer in place', async () => {
    await seedCompensationTier('layer-expired');
    const db = await getDb();
    const held = compensationRef('layer-expired', Date.now() - COMPENSATION_TTL_MS - 1);

    const result = await layerAdapter.execute({
      locale: 'zh-CN',
      call: {
        name: 'link_translation_layer',
        requestId: 'req-comp',
        arguments: { transcriptionLayerId: 'trc-missing', translationLayerId: 'trl-any' },
      },
      compensationRef: held,
      COMPENSATION_TTL_MS,
      resolveTranscriptionLayerForLink: () => null,
      deleteLayer: async (id: string) => {
        await db.dexie.tier_definitions.delete(id);
      },
    } as never);

    expect(result.message).toContain('未找到可用转写层');
    expect(result.message).not.toContain('已自动回滚');
    expect(await db.dexie.tier_definitions.get('layer-expired')).toBeTruthy();
    expect(held.current.has('req-comp')).toBe(true);
  });

  it('clears compensation on a successful link and leaves the layer', async () => {
    await seedCompensationTier('layer-linked');
    const db = await getDb();
    const held = compensationRef('layer-linked');
    const trc = { id: 'trc-ok', key: 'trc_ok', name: { default: '转写' } };
    const trl = { id: 'trl-ok', key: 'trl_ok', name: { default: '翻译' } };

    const result = await layerAdapter.execute({
      locale: 'zh-CN',
      call: {
        name: 'link_translation_layer',
        requestId: 'req-comp',
        arguments: { transcriptionLayerId: 'trc-ok', translationLayerId: 'trl-ok' },
      },
      compensationRef: held,
      COMPENSATION_TTL_MS,
      transcriptionLayers: [trc],
      translationLayers: [trl],
      layerLinks: [],
      resolveTranscriptionLayerForLink: () => trc,
      resolveTranslationLayerForLink: () => trl,
      toggleLayerLink: async () => undefined,
      deleteLayer: async (id: string) => {
        await db.dexie.tier_definitions.delete(id);
      },
    } as never);

    expect(result.ok).toBe(true);
    expect(result.message).toContain('已链接');
    expect(await db.dexie.tier_definitions.get('layer-linked')).toBeTruthy();
    expect(held.current.has('req-comp')).toBe(false);
  });

  it('throws the delete error when the tier row cannot be read back', async () => {
    await seedCompensationTier('layer-unreadable');
    const db = await getDb();
    const spy = vi
      .spyOn(db.dexie.tier_definitions, 'get')
      .mockRejectedValue(new Error('read failed'));

    try {
      await expect(
        layerAdapter.execute({
          locale: 'zh-CN',
          call: {
            name: 'link_translation_layer',
            requestId: 'req-comp',
            arguments: { transcriptionLayerId: 'trc-missing', translationLayerId: 'trl-any' },
          },
          compensationRef: compensationRef('layer-unreadable'),
          COMPENSATION_TTL_MS,
          resolveTranscriptionLayerForLink: () => null,
          deleteLayer: async () => {
            throw new Error('delete failed');
          },
        } as never),
      ).rejects.toThrow('delete failed');
    } finally {
      spy.mockRestore();
    }
  });
});
