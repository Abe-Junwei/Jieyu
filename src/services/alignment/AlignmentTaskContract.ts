import type { WebMaAlignmentResult } from '../WebMaService';
import type { AlignmentTaskRequest, AlignmentTaskResult } from '../../types/alignmentTask';

export interface AlignmentTaskRuntime<TConfig = unknown> {
  provider: AlignmentTaskRequest['provider'];
  run: (request: AlignmentTaskRequest, config?: TConfig) => Promise<AlignmentTaskResult>;
}

export function createAlignmentTaskResult(input: AlignmentTaskResult): AlignmentTaskResult {
  return {
    ...input,
    words: [...input.words],
    phonemes: [...input.phonemes],
  };
}

export function adaptWebMaAlignmentResult(taskId: string, result: WebMaAlignmentResult): AlignmentTaskResult {
  return createAlignmentTaskResult({
    provider: 'webmaus',
    taskId,
    status: 'succeeded',
    words: result.words,
    phonemes: result.phonemes,
    rawPayload: result.rawTextGrid,
    completedAt: new Date().toISOString(),
  });
}