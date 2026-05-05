/**
 * Web Speech STT result mapping and fatal-error routing (Phase C2 split).
 * Keeps browser event shaping out of VoiceInputService orchestration.
 */

import type { SttResult } from './VoiceInputService.types';
import type { SpeechRecognitionEvent } from './VoiceInputService.webSpeechSupport';
import type { VoiceInputSttEngine } from './VoiceInputService.fallbackChain';

export function isIgnorableWebSpeechError(error: string): boolean {
  return error === 'no-speech' || error === 'aborted';
}

/** Maps SpeechRecognition result slices to SttResult payloads (same semantics as legacy inline loop). */
export function sttResultsFromWebSpeechEvent(event: SpeechRecognitionEvent, lang: string): SttResult[] {
  const out: SttResult[] = [];
  for (let i = event.resultIndex; i < event.results.length; i++) {
    const result = event.results[i];
    if (!result) continue;
    const primary = result[0];
    if (!primary) continue;

    const alternatives: Array<{ text: string; confidence: number }> = [];
    for (let j = 1; j < result.length; j++) {
      const alt = result[j];
      if (alt) {
        alternatives.push({
          text: alt.transcript,
          confidence: typeof alt.confidence === 'number' && Number.isFinite(alt.confidence) ? alt.confidence : 0,
        });
      }
    }

    out.push({
      text: primary.transcript,
      lang,
      isFinal: result.isFinal,
      confidence:
        typeof primary.confidence === 'number' && Number.isFinite(primary.confidence) ? primary.confidence : 0,
      engine: 'web-speech',
      ...(alternatives.length > 0 ? { alternatives } : {}),
    });
  }
  return out;
}

export type WebSpeechFatalResolution =
  | {
      kind: 'fallback-next';
      nextEngine: VoiceInputSttEngine;
      failureReason: string;
    }
  | {
      kind: 'user-message';
      message: string;
      failureReason: string;
      /** Matches legacy behavior: commercial hint stops the engine; plain message path did not call stop. */
      stopEngineBeforeEmit: boolean;
    };

/**
 * When Web Speech reports a non-ignorable error, decide fallback vs user-visible error.
 * Returns null when the error should be ignored entirely.
 */
export function resolveWebSpeechFatalError(params: {
  error: string;
  chain: readonly VoiceInputSttEngine[];
  commercialConfigured: boolean;
}): WebSpeechFatalResolution | null {
  if (isIgnorableWebSpeechError(params.error)) return null;

  const failureReason = `Web Speech API \u9519\u8bef: ${params.error}`;
  const chain = params.chain;
  const nextIdx = chain.indexOf('web-speech') + 1;
  if (nextIdx < chain.length && chain[nextIdx]) {
    return {
      kind: 'fallback-next',
      nextEngine: chain[nextIdx]!,
      failureReason,
    };
  }

  const code = params.error;
  if (params.commercialConfigured) {
    return {
      kind: 'user-message',
      failureReason,
      stopEngineBeforeEmit: true,
      message: `Web Speech \u4e0d\u53ef\u7528\uff08${code}\uff09\u3002\u8bf7\u5207\u6362\u5230\u5546\u4e1a STT \u5f15\u64ce\uff0c\u6216\u68c0\u67e5 Ollama \u670d\u52a1\u3002`,
    };
  }

  return {
    kind: 'user-message',
    failureReason,
    stopEngineBeforeEmit: false,
    message: `Web Speech \u4e0d\u53ef\u7528\uff08${code}\uff09\u3002`,
  };
}
