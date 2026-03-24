import type { SttResult } from './VoiceInputService';
import type { VoiceIntent } from './IntentRouter';

export function refineLlmFallbackIntent(intent: VoiceIntent, sttResult: SttResult): VoiceIntent {
  if (intent.type !== 'action') return intent;
  const refinedConfidence = Number.isFinite(sttResult.confidence)
    ? Math.min(intent.confidence ?? 1, Math.max(0.35, sttResult.confidence * 0.7))
    : (intent.confidence ?? 0.5);
  return {
    ...intent,
    fromFuzzy: true,
    confidence: refinedConfidence,
  };
}
