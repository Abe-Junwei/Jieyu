import type { VoiceIntentLlmResolverConfig } from '../../services/VoiceIntentLlmResolver';

export const DEFAULT_VOICE_INTENT_RESOLVER_CONFIG: VoiceIntentLlmResolverConfig = {
  modePrompts: {
    command: '当前为语音输入的聊天统一路径，优先返回 action/tool；仅在无法映射动作时返回 chat。',
    dictation: '当前偏向口述输入，除非指令非常明确，否则返回 chat。',
    analysis: '与 command 同一条解析与执行链；语气偏分析与讲解，优先 chat/tool，仅在指令非常明确时返回 action。',
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
