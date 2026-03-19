import type { VoiceIntentLlmResolverConfig } from '../../services/VoiceIntentLlmResolver';

export const DEFAULT_VOICE_INTENT_RESOLVER_CONFIG: VoiceIntentLlmResolverConfig = {
  modePrompts: {
    command: '优先返回 action/tool，除非明确是问答。',
    dictation: '当前偏向口述输入，除非指令非常明确，否则返回 chat。',
    analysis: '当前偏向分析请求，优先返回 chat/tool。',
  },
  schema: {
    typeField: 'type',
    actionIdField: 'actionId',
    toolNameField: 'toolName',
    paramsField: 'params',
    chatTextField: 'text',
    toolCallField: 'tool_call',
    toolCallNameField: 'name',
    toolCallArgsField: 'arguments',
  },
};
