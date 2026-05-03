/**
 * ADR-0028: isolate dictation-mode final STT routing from command-bridge path.
 */

import type { SttResult } from './VoiceInputService';

export interface DictationSttFinalRoutePipeline {
  onSttResult(result: SttResult): void;
}

/**
 * When a dictation pipeline is active and `result` is final, commits interim→final,
 * feeds the pipeline, then returns true (caller should return without intent routing).
 */
export function tryRouteFinalSttToDictationPipeline(input: {
  pipeline: DictationSttFinalRoutePipeline | null;
  result: SttResult;
  commitFinalTranscript: (text: string, confidence: number) => void;
  recordDictationQuality: () => void;
  scheduleEngineCheck: () => void;
}): boolean {
  const { pipeline, result } = input;
  if (!pipeline || !result.isFinal) return false;
  input.commitFinalTranscript(result.text, result.confidence);
  pipeline.onSttResult(result);
  input.recordDictationQuality();
  input.scheduleEngineCheck();
  return true;
}
