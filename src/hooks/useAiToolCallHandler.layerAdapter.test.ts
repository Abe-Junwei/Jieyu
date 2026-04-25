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
});
