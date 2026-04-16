import { describe, expect, it } from 'vitest';
import { buildAiToolRequestId } from './toolRequestId';

describe('buildAiToolRequestId', () => {
  it('is stable for the same logical tool call', () => {
    const left = buildAiToolRequestId({
      name: 'set_transcription_text',
      arguments: { unitId: 'u1', text: 'hello' },
    });
    const right = buildAiToolRequestId({
      name: 'set_transcription_text',
      arguments: { text: 'hello', unitId: 'u1' },
    });

    expect(left).toBe(right);
  });

  it('ignores undefined fields when hashing tool arguments', () => {
    const left = buildAiToolRequestId({
      name: 'delete_layer',
      arguments: { layerId: 'layer-1', alias: undefined },
    });
    const right = buildAiToolRequestId({
      name: 'delete_layer',
      arguments: { layerId: 'layer-1' },
    });

    expect(left).toBe(right);
  });
});
