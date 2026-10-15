import { describe, expect, it } from 'vitest';
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
