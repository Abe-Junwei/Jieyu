import type { Locale } from '../i18n';
import type { ActionId, VoiceIntent, VoiceSession } from './IntentRouter';
import type { CommandBridgeContextFields } from './VoiceAgentService.commandBridge';
import type { VoiceAgentMode, VoiceAgentServiceState } from './VoiceAgentService.types';

export function buildVoiceAgentServiceCommandBridgeFields(input: {
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
}): CommandBridgeContextFields {
  return {
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
  };
}
