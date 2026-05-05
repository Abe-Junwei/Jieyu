/**
 * ADR-0028: isolate dictation-mode STT routing from command-bridge path.
 * `tryConsumeSttThroughDictationPipeline` is shared by Hook (`useVoiceAgentDictationPipeline`) and `VoiceAgentService`.
 */

import type { SttResult } from './VoiceInputService.types';

export interface DictationSttFinalRoutePipeline {
  onSttResult(result: SttResult): void;
}

export interface TryConsumeSttThroughDictationPipelineInput {
  pipeline: DictationSttFinalRoutePipeline | null;
  result: SttResult;
  setDetectedLang: (lang: string | null) => void;
  clearErrorOnNonEmptyInterim?: () => void;
  clearError?: () => void;
  setInterimText: (text: string) => void;
  setFinalText: (text: string) => void;
  setConfidence: (confidence: number) => void;
  /**
   * When set, final transcripts use this single commit (e.g. `_setState` bundle) instead of
   * separate interim/final/confidence setters — used by legacy `tryRouteFinalSttToDictationPipeline` callers.
   */
  commitFinalTranscript?: (text: string, confidence: number) => void;
  /** Hook: `setAgentState('idle')` after feeding final into the pipeline. */
  afterFinalDictationConsumed?: () => void;
}

/**
 * When a dictation pipeline is active, forwards **interim and final** STT to the pipeline (Hook parity).
 * Returns false when `pipeline` is null (caller continues with non-dictation handling).
 */
export function tryConsumeSttThroughDictationPipeline(
  input: TryConsumeSttThroughDictationPipelineInput,
): boolean {
  const { pipeline, result } = input;
  if (!pipeline) {
    return false;
  }

  if (result.lang) {
    input.setDetectedLang(result.lang);
  }

  if (!result.isFinal) {
    if (result.text.trim().length > 0 && input.clearErrorOnNonEmptyInterim) {
      input.clearErrorOnNonEmptyInterim();
    }
    input.setInterimText(result.text);
    input.setConfidence(result.confidence);
    pipeline.onSttResult(result);
    return true;
  }

  if (input.clearError) {
    input.clearError();
  }
  if (input.commitFinalTranscript) {
    input.commitFinalTranscript(result.text, result.confidence);
  } else {
    input.setInterimText('');
    input.setFinalText(result.text);
    input.setConfidence(result.confidence);
  }
  pipeline.onSttResult(result);
  input.afterFinalDictationConsumed?.();
  return true;
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
  if (!input.pipeline || !input.result.isFinal) {
    return false;
  }
  return tryConsumeSttThroughDictationPipeline({
    pipeline: input.pipeline,
    result: input.result,
    setDetectedLang: () => {},
    setInterimText: () => {},
    setFinalText: () => {},
    setConfidence: () => {},
    commitFinalTranscript: input.commitFinalTranscript,
    afterFinalDictationConsumed: () => {
      input.recordDictationQuality();
      input.scheduleEngineCheck();
    },
  });
}
