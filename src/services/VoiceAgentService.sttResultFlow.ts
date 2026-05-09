import type { Locale } from '../i18n';
import type { SpeechAnnotationPipeline } from './SpeechAnnotationPipeline';
import type { SpeechQualityAnalyzer } from './SpeechQualityAnalyzer';
import type { ActionId, VoiceIntent, VoiceSession } from './IntentRouter';
import type { SttResult } from './VoiceInputService.types';
import type { VoiceAgentMode, VoiceAgentServiceState } from './VoiceAgentService.types';
import type { CommandBridgeContextFields } from './VoiceAgentService.commandBridge';
import type { VoiceAgentServiceSttDispatchOutcome } from './VoiceAgentService.sttResultDispatch';
import { buildVoiceAgentServiceCommandBridgeFields } from './VoiceAgentService.commandBridgeFields';

export async function runVoiceAgentServiceSttResultFlow(input: {
  dispatchSttResult: (params: {
    result: SttResult;
    dictationPipeline: SpeechAnnotationPipeline | null;
    speechQuality: SpeechQualityAnalyzer | null | undefined;
    setState: (partial: Partial<VoiceAgentServiceState>) => void;
    onDictationPipelineFinalComplete?: () => void;
    getBridgeFields: () => CommandBridgeContextFields;
  }) => Promise<VoiceAgentServiceSttDispatchOutcome>;
  result: SttResult;
  dictationPipeline: SpeechAnnotationPipeline | null;
  speechQuality: SpeechQualityAnalyzer | null | undefined;
  mode: VoiceAgentMode;
  safeMode: boolean;
  session: VoiceSession;
  locale: Locale;
  corpusLang: string;
  intentAliasMap: Record<string, ActionId>;
  setState: (partial: Partial<VoiceAgentServiceState>) => void;
  emitStateChange: () => void;
  resolveIntentWithLlm?: (params: {
    text: string;
    mode: VoiceAgentMode;
    session: VoiceSession;
  }) => Promise<VoiceIntent | null>;
  onExecuteAction?: (actionId: ActionId, params?: { segmentIndex?: number }) => void;
  onInsertDictation?: (text: string) => void;
  onSendToAiChat?: (text: string) => void;
  onToolCall?: (call: {
    name: string;
    arguments: Record<string, unknown>;
  }) => Promise<{ ok: boolean; message: string }>;
  onDictationPipelineFinalComplete: () => void;
  onBridgeApplied: (next: {
    session: VoiceSession;
    intentAliasMap: Record<string, ActionId>;
  }) => void;
}): Promise<void> {
  const bridgeFields: CommandBridgeContextFields = buildVoiceAgentServiceCommandBridgeFields({
    mode: input.mode,
    safeMode: input.safeMode,
    session: input.session,
    locale: input.locale,
    corpusLang: input.corpusLang,
    intentAliasMap: input.intentAliasMap,
    setState: input.setState,
    emitStateChange: input.emitStateChange,
    ...(input.resolveIntentWithLlm !== undefined && {
      resolveIntentWithLlm: input.resolveIntentWithLlm,
    }),
    ...(input.onExecuteAction !== undefined && { onExecuteAction: input.onExecuteAction }),
    ...(input.onInsertDictation !== undefined && { onInsertDictation: input.onInsertDictation }),
    ...(input.onSendToAiChat !== undefined && { onSendToAiChat: input.onSendToAiChat }),
    ...(input.onToolCall !== undefined && { onToolCall: input.onToolCall }),
  });

  const out = await input.dispatchSttResult({
    result: input.result,
    dictationPipeline: input.dictationPipeline,
    speechQuality: input.speechQuality,
    setState: input.setState,
    onDictationPipelineFinalComplete: input.onDictationPipelineFinalComplete,
    getBridgeFields: () => bridgeFields,
  });

  if (out.status === 'consumed') return;
  input.onBridgeApplied({
    session: out.session,
    intentAliasMap: out.intentAliasMap,
  });
}
