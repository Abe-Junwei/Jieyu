/**
 * VoiceAgentService STT 结果 → 状态与 commandBridge 的单一委托入口（ADR-0028 Phase B2）。
 * Keeps `VoiceAgentService` class focused on lifecycle; STT branch logic lives here next to commandBridge.
 */

import type { SttResult } from './VoiceInputService';
import type { SpeechAnnotationPipeline } from './SpeechAnnotationPipeline';
import type { SpeechQualityAnalyzer } from './SpeechQualityAnalyzer';
import type { ActionId, VoiceSession } from './IntentRouter';
import type { VoiceAgentServiceState } from './VoiceAgentService';
import {
  buildCommandBridgeContext,
  handleFinalSttResult,
  type CommandBridgeContextFields,
} from './VoiceAgentService.commandBridge';
import { tryConsumeSttThroughDictationPipeline } from './voiceAgentServiceDictationSttRoute';
import { applyVoiceSttInterimIfNotFinal } from './voiceAgentSttSurface';

export type VoiceAgentServiceSttDispatchOutcome =
  | { status: 'consumed' }
  | { status: 'bridge'; session: VoiceSession; intentAliasMap: Record<string, ActionId> };

export async function dispatchVoiceAgentServiceSttResult(input: {
  result: SttResult;
  dictationPipeline: SpeechAnnotationPipeline | null;
  speechQuality: SpeechQualityAnalyzer | null | undefined;
  setState: (partial: Partial<VoiceAgentServiceState>) => void;
  /** Dictation pipeline final: quality + engine hysteresis (caller-owned). */
  onDictationPipelineFinalComplete?: () => void;
  getBridgeFields: () => CommandBridgeContextFields;
}): Promise<VoiceAgentServiceSttDispatchOutcome> {
  const { result, dictationPipeline, speechQuality, setState, getBridgeFields, onDictationPipelineFinalComplete } = input;

  if (
    tryConsumeSttThroughDictationPipeline({
      pipeline: dictationPipeline,
      result,
      setDetectedLang: (lang) => {
        setState({ detectedLang: lang });
      },
      clearErrorOnNonEmptyInterim: () => {
        setState({ error: null });
      },
      clearError: () => {
        setState({ error: null });
      },
      setInterimText: (text) => {
        setState({ interimText: text });
      },
      setFinalText: (text) => {
        setState({ finalText: text });
      },
      setConfidence: (confidence) => {
        setState({ confidence });
      },
      ...(onDictationPipelineFinalComplete !== undefined
        ? { afterFinalDictationConsumed: onDictationPipelineFinalComplete }
        : {}),
    })
  ) {
    return { status: 'consumed' };
  }

  if (result.lang) {
    setState({ detectedLang: result.lang });
  }

  if (
    applyVoiceSttInterimIfNotFinal({
      result,
      clearErrorOnNonEmptyInterim: () => {
        setState({ error: null });
      },
      setInterimText: (text) => {
        setState({ interimText: text });
      },
      setConfidence: (confidence) => {
        setState({ confidence });
      },
    })
  ) {
    return { status: 'consumed' };
  }

  speechQuality?.recordSegmentQuality('command');

  const mutations = await handleFinalSttResult(
    buildCommandBridgeContext(getBridgeFields()),
    result,
  );

  return {
    status: 'bridge',
    session: mutations.session,
    intentAliasMap: mutations.intentAliasMap,
  };
}
