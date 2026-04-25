import { describe, expect, it } from 'vitest';
import { getAiToolLayerLinkExecutionToolNames } from '../ai/policy/aiToolPolicyMatrix';
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
});
