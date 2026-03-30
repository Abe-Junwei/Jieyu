import { describe, expect, it } from 'vitest';
import { adaptWebMaAlignmentResult, createAlignmentTaskResult } from './AlignmentTaskContract';

describe('AlignmentTaskContract', () => {
  it('normalizes alignment task result payloads', () => {
    const result = createAlignmentTaskResult({
      provider: 'webmaus',
      taskId: 'task-1',
      status: 'succeeded',
      words: [{ text: 'hello', startTime: 0, endTime: 0.5 }],
      phonemes: [],
      rawPayload: 'raw-grid',
    });

    expect(result).toEqual({
      provider: 'webmaus',
      taskId: 'task-1',
      status: 'succeeded',
      words: [{ text: 'hello', startTime: 0, endTime: 0.5 }],
      phonemes: [],
      rawPayload: 'raw-grid',
    });
  });

  it('adapts WebMAUS output to provider-neutral contract', () => {
    const result = adaptWebMaAlignmentResult('task-2', {
      taskId: 'task-2',
      words: [{ text: 'hi', startTime: 0.1, endTime: 0.3 }],
      phonemes: [{ text: 'h', startTime: 0.1, endTime: 0.15 }],
      rawTextGrid: 'textgrid-data',
    });

    expect(result.provider).toBe('webmaus');
    expect(result.status).toBe('succeeded');
    expect(result.words[0]).toEqual({ text: 'hi', startTime: 0.1, endTime: 0.3 });
    expect(result.rawPayload).toBe('textgrid-data');
    expect(typeof result.completedAt).toBe('string');
  });
});