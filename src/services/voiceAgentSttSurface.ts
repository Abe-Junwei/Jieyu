/**
 * Shared STT → UI surface updates for voice agent paths (ADR-0028: Hook / VoiceAgentService parity).
 */

import type { SttResult } from './VoiceInputService.types';

/**
 * Non-final STT: mirror `useVoiceAgentResultHandler` interim branch when no dictation pipeline consumed the result.
 * Returns true if the result was interim (caller should return without intent routing).
 */
export function applyVoiceSttInterimIfNotFinal(input: {
  result: SttResult;
  clearErrorOnNonEmptyInterim?: () => void;
  setInterimText: (text: string) => void;
  setConfidence: (confidence: number) => void;
}): boolean {
  if (input.result.isFinal) {
    return false;
  }
  if (input.result.text.trim().length > 0 && input.clearErrorOnNonEmptyInterim) {
    input.clearErrorOnNonEmptyInterim();
  }
  input.setInterimText(input.result.text);
  input.setConfidence(input.result.confidence);
  return true;
}
