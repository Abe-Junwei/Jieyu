/**
 * Adaptive STT engine hysteresis — extracted from VoiceAgentService for line budget (P2).
 */

import type { SttEngine } from './VoiceInputService.types';
import type { SpeechQualityAnalyzer } from './SpeechQualityAnalyzer';

const ENGINE_SWITCH_THRESHOLD = 3;

export function applyAdaptiveSttEngineRecommendation(input: {
  listening: boolean;
  currentEngine: SttEngine;
  engineSwitchCounter: number;
  speechQuality: SpeechQualityAnalyzer | null;
  switchEngine: (engine: SttEngine) => void;
}): number {
  const sq = input.speechQuality;
  if (!sq || !input.listening) {
    return 0;
  }

  const targetEngine = sq.recommendSttEngine();

  if (targetEngine === input.currentEngine) {
    return 0;
  }

  const next = input.engineSwitchCounter + 1;
  if (next >= ENGINE_SWITCH_THRESHOLD) {
    input.switchEngine(targetEngine);
    return 0;
  }
  return next;
}
