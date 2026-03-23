import type { AiChatSettings } from '../ai/providers/providerCatalog';
import { createAiChatProvider } from '../ai/providers/providerCatalog';
import type { ChatMessage } from '../ai/providers/LLMProvider';
import { isActionId, type VoiceIntent } from './IntentRouter';

export type VoiceResolverMode = 'command' | 'dictation' | 'analysis';

export interface VoiceIntentLlmSchemaConfig {
  typeField: string;
  actionIdField: string;
  toolNameField: string;
  paramsField: string;
  chatTextField: string;
  toolCallField: string;
  toolCallNameField: string;
  toolCallArgsField: string;
}

export interface VoiceIntentLlmResolverConfig {
  systemPrompt?: string;
  modePrompts?: Partial<Record<VoiceResolverMode, string>>;
  temperature?: number;
  maxTokens?: number;
  schema?: Partial<VoiceIntentLlmSchemaConfig>;
  buildUserPrompt?: (input: {
    transcript: string;
    mode: VoiceResolverMode;
    recentContext: string[];
  }) => string;
}

export interface ResolveVoiceIntentWithLlmInput {
  transcript: string;
  mode: VoiceResolverMode;
  settings: AiChatSettings;
  recentContext?: string[];
  signal?: AbortSignal;
}

export type VoiceIntentLlmErrorKind =
  | 'empty-input'
  | 'missing-json'
  | 'invalid-json'
  | 'invalid-shape'
  | 'invalid-action'
  | 'missing-tool-name'
  | 'stream-error';

export type VoiceIntentLlmParseResult =
  | { ok: true; intent: VoiceIntent; rawResponse: string }
  | { ok: false; errorKind: VoiceIntentLlmErrorKind; message: string; rawResponse: string };

const DEFAULT_SYSTEM_PROMPT = [
  '你是解语语音指令解析器。',
  '你的任务是把用户语音文本解析为一个 JSON 意图对象。',
  '仅返回 JSON，不要返回额外解释。',
  '允许的返回格式：',
  '{"type":"action","actionId":"<ActionId>","raw":"<原文>"}',
  '{"type":"tool","toolName":"<tool_name>","params":{},"raw":"<原文>"}',
  '{"type":"chat","text":"<原文>","raw":"<原文>"}',
  '{"tool_call":{"name":"<tool_name>","arguments":{}}}',
  'ActionId 仅允许：playPause,markSegment,cancel,deleteSegment,mergePrev,mergeNext,splitSegment,undo,redo,selectBefore,selectAfter,selectAll,navPrev,navNext,tabNext,tabPrev,search,toggleNotes,toggleVoice。',
  '额外允许的工具（返回 type:"tool"，toolName 选其一）：',
  'nav_to_segment, nav_to_time, play_pause, mark_segment, delete_segment, split_at_time, merge_prev, merge_next, undo, redo, focus_segment, zoom_to_segment, toggle_notes, search_segments, auto_gloss_segment, auto_translate_segment, auto_segment, suggest_segment_improvement, analyze_segment_quality, get_current_segment, get_project_summary, get_recent_history。',
].join('\n');

const DEFAULT_MODE_PROMPTS: Record<VoiceResolverMode, string> = {
  command: '优先解析为 action/tool；仅在无法映射动作时返回 chat。',
  dictation: '若内容像口述文本则优先返回 chat，不要编造 action。',
  analysis: '优先返回 chat 或 tool，用于分析与问答。',
};

const DEFAULT_SCHEMA: VoiceIntentLlmSchemaConfig = {
  typeField: 'type',
  actionIdField: 'actionId',
  toolNameField: 'toolName',
  paramsField: 'params',
  chatTextField: 'text',
  toolCallField: 'tool_call',
  toolCallNameField: 'name',
  toolCallArgsField: 'arguments',
};

function extractJsonCandidate(text: string): string | null {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i) ?? text.match(/```\s*([\s\S]*?)```/i);
  if (fenced && fenced[1]) return fenced[1].trim();

  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace < 0 || lastBrace <= firstBrace) return null;
  return text.slice(firstBrace, lastBrace + 1).trim();
}

function asRecord(input: unknown): Record<string, unknown> | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  return input as Record<string, unknown>;
}

function readStringField(record: Record<string, unknown>, field: string): string | null {
  const value = record[field];
  return typeof value === 'string' ? value : null;
}

function buildSchema(config?: Partial<VoiceIntentLlmSchemaConfig>): VoiceIntentLlmSchemaConfig {
  return {
    ...DEFAULT_SCHEMA,
    ...config,
  };
}

export function parseVoiceIntentFromLlmResponse(
  responseText: string,
  rawTranscript: string,
  schemaConfig?: Partial<VoiceIntentLlmSchemaConfig>,
): VoiceIntent | null {
  const result = parseVoiceIntentFromLlmResponseDetailed(responseText, rawTranscript, schemaConfig);
  return result.ok ? result.intent : null;
}

export function parseVoiceIntentFromLlmResponseDetailed(
  responseText: string,
  rawTranscript: string,
  schemaConfig?: Partial<VoiceIntentLlmSchemaConfig>,
): VoiceIntentLlmParseResult {
  const schema = buildSchema(schemaConfig);
  const candidate = extractJsonCandidate(responseText);
  if (!candidate) {
    const trimmedResponse = responseText.trim();
    const looksLikeBrokenJson = trimmedResponse.startsWith('{') || trimmedResponse.startsWith('```');
    return {
      ok: false,
      errorKind: looksLikeBrokenJson ? 'invalid-json' : 'missing-json',
      message: looksLikeBrokenJson
        ? 'LLM 返回了看似 JSON 的内容，但 JSON 结构不完整。'
        : 'LLM 未返回可解析的 JSON 意图对象。',
      rawResponse: responseText,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch (err) {
    console.warn('[VoiceIntentLlmResolver] JSON.parse failed:', err);
    return {
      ok: false,
      errorKind: 'invalid-json',
      message: 'LLM 返回了 JSON 片段，但 JSON 语法无效。',
      rawResponse: responseText,
    };
  }

  const data = asRecord(parsed);
  if (!data) {
    return {
      ok: false,
      errorKind: 'invalid-shape',
      message: 'LLM 返回的 JSON 不是对象结构。',
      rawResponse: responseText,
    };
  }

  const type = readStringField(data, schema.typeField);
  if (type === 'action') {
    const actionId = readStringField(data, schema.actionIdField) ?? '';
    if (!isActionId(actionId)) {
      return {
        ok: false,
        errorKind: 'invalid-action',
        message: `LLM 返回了未注册的 actionId：${actionId || '(empty)'}`,
        rawResponse: responseText,
      };
    }
    return {
      ok: true,
      intent: { type: 'action', actionId, raw: rawTranscript, confidence: 1 },
      rawResponse: responseText,
    };
  }
  if (type === 'tool') {
    const toolName = readStringField(data, schema.toolNameField) ?? '';
    if (!toolName) {
      return {
        ok: false,
        errorKind: 'missing-tool-name',
        message: 'LLM 返回了 tool 类型，但缺少 toolName。',
        rawResponse: responseText,
      };
    }
    const params = asRecord(data[schema.paramsField]) ?? {};
    const stringParams: Record<string, string> = {};
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'string') stringParams[key] = value;
    }
    return {
      ok: true,
      intent: { type: 'tool', toolName, params: stringParams, raw: rawTranscript },
      rawResponse: responseText,
    };
  }
  if (type === 'chat') {
    const text = readStringField(data, schema.chatTextField) ?? rawTranscript;
    return {
      ok: true,
      intent: { type: 'chat', text, raw: rawTranscript },
      rawResponse: responseText,
    };
  }

  const toolCall = asRecord(data[schema.toolCallField]);
  if (toolCall) {
    const toolName = readStringField(toolCall, schema.toolCallNameField) ?? '';
    if (!toolName) {
      return {
        ok: false,
        errorKind: 'missing-tool-name',
        message: 'LLM 返回了 tool_call，但缺少 name。',
        rawResponse: responseText,
      };
    }
    const args = asRecord(toolCall[schema.toolCallArgsField]) ?? {};
    const params: Record<string, string> = {};
    for (const [key, value] of Object.entries(args)) {
      if (typeof value === 'string') params[key] = value;
    }
    return {
      ok: true,
      intent: { type: 'tool', toolName, params, raw: rawTranscript },
      rawResponse: responseText,
    };
  }

  return {
    ok: false,
    errorKind: 'invalid-shape',
    message: 'LLM 返回的 JSON 缺少可识别的 type 或 tool_call 结构。',
    rawResponse: responseText,
  };
}

export async function resolveVoiceIntentWithLlm(input: ResolveVoiceIntentWithLlmInput): Promise<VoiceIntent | null> {
  const resolved = await resolveVoiceIntentWithLlmUsingConfig(input, {});
  return resolved.ok ? resolved.intent : null;
}

export async function resolveVoiceIntentWithLlmUsingConfig(
  input: ResolveVoiceIntentWithLlmInput,
  config: VoiceIntentLlmResolverConfig,
) : Promise<VoiceIntentLlmParseResult> {
  const transcript = input.transcript.trim();
  if (!transcript) {
    return {
      ok: true,
      intent: { type: 'chat', text: '', raw: input.transcript },
      rawResponse: '',
    };
  }

  const provider = createAiChatProvider(input.settings);
  const recentContext = input.recentContext ?? [];
  const modePrompt = config.modePrompts?.[input.mode] ?? DEFAULT_MODE_PROMPTS[input.mode];
  const contextBlock = recentContext.length
    ? `\n最近上下文:\n- ${recentContext.join('\n- ')}`
    : '';

  const userContent = config.buildUserPrompt
    ? config.buildUserPrompt({ transcript, mode: input.mode, recentContext })
    : `mode=${input.mode}\nmodePrompt=${modePrompt}\ntranscript=${transcript}${contextBlock}`;

  const messages: ChatMessage[] = [
    { role: 'system', content: config.systemPrompt ?? DEFAULT_SYSTEM_PROMPT },
    { role: 'user', content: userContent },
  ];

  let response = '';
  for await (const chunk of provider.chat(messages, {
    model: input.settings.model,
    temperature: config.temperature ?? 0,
    maxTokens: config.maxTokens ?? 180,
    ...(input.signal ? { signal: input.signal } : {}),
  })) {
    if (chunk.error) {
      return {
        ok: false,
        errorKind: 'stream-error',
        message: chunk.error,
        rawResponse: response,
      };
    }
    response += chunk.delta;
    if (chunk.done) break;
  }

  return parseVoiceIntentFromLlmResponseDetailed(response, transcript, config.schema);
}
