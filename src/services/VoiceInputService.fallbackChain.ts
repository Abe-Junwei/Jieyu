/**
 * STT engine fallback ordering and user-facing labels (Phase C2 split).
 * Kept free of VoiceInputService class imports to avoid cycles.
 */

import type { Region } from '../utils/regionDetection';

export type VoiceInputSttEngine = 'web-speech' | 'whisper-local' | 'commercial';

/**
 * Ordered fallback chain when the preferred engine fails.
 * CN users prefer commercial first (Web Speech / Google is unreliable in mainland China).
 */
export function buildSttFallbackChain(region?: Region): VoiceInputSttEngine[] {
  if (region === 'cn') {
    return ['commercial', 'whisper-local', 'web-speech'];
  }
  return ['web-speech', 'whisper-local', 'commercial'];
}

/**
 * Engines to try starting from `startFrom` (inclusive). If `startFrom` is absent from the chain, retries full chain.
 */
export function sliceSttFallbackChain(
  chain: readonly VoiceInputSttEngine[],
  startFrom: VoiceInputSttEngine,
): VoiceInputSttEngine[] {
  const startIdx = chain.indexOf(startFrom);
  return startIdx >= 0 ? chain.slice(startIdx) : [...chain];
}

/** When commercial engine is selected but no provider is configured. */
export const COMMERCIAL_STT_NOT_CONFIGURED_REASON = '\u672a\u914d\u7f6e\u5546\u4e1a STT provider';

export function commercialSttMissingReason(hasCommercialProvider: boolean): string | null {
  return hasCommercialProvider ? null : COMMERCIAL_STT_NOT_CONFIGURED_REASON;
}

export function sttEngineUiLabel(engine: VoiceInputSttEngine): string {
  switch (engine) {
    case 'web-speech':
      return 'Web Speech API';
    case 'whisper-local':
      return 'Whisper.cpp';
    case 'commercial':
      return '\u5546\u4e1a STT';
    default: {
      const _exhaustive: never = engine;
      return _exhaustive;
    }
  }
}

/** Multiline error shown when every engine in the tried slice failed to start. */
export function formatSttAllEnginesFailedMessage(
  enginesTried: readonly VoiceInputSttEngine[],
  reasons: Partial<Record<VoiceInputSttEngine, string>>,
): string {
  const lines = enginesTried.map((e) => {
    const reason = reasons[e];
    const label = sttEngineUiLabel(e);
    return reason ? `• ${label}\uff1a${reason}` : `• ${label}`;
  });
  const block = lines.join('\n');
  return `\u6240\u6709 STT \u5f15\u64ce\u5747\u4e0d\u53ef\u7528\uff1a\n${block}\n\u8bf7\u68c0\u67e5\u4e0a\u8ff0\u914d\u7f6e\u548c\u7f51\u7edc\u8fde\u63a5\u3002`;
}
