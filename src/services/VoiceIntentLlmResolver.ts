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
  '\u4f60\u662f\u89e3\u8bed\u8bed\u97f3\u6307\u4ee4\u89e3\u6790\u5668\u3002',
  '\u4f60\u7684\u4efb\u52a1\u662f\u628a\u7528\u6237\u8bed\u97f3\u6587\u672c\u89e3\u6790\u4e3a\u4e00\u4e2a JSON \u610f\u56fe\u5bf9\u8c61\u3002',
  '\u4ec5\u8fd4\u56de JSON\uff0c\u4e0d\u8981\u8fd4\u56de\u989d\u5916\u89e3\u91ca\u3002',
  '\u5141\u8bb8\u7684\u8fd4\u56de\u683c\u5f0f\uff1a',
  '{"type":"action","actionId":"<ActionId>","raw":"<\u539f\u6587>"}',
  '{"type":"tool","toolName":"<tool_name>","params":{},"raw":"<\u539f\u6587>"}',
  '{"type":"chat","text":"<\u539f\u6587>","raw":"<\u539f\u6587>"}',
  '{"tool_call":{"name":"<tool_name>","arguments":{}}}',
  'ActionId \u4ec5\u5141\u8bb8\uff1aplayPause,markSegment,cancel,deleteSegment,mergePrev,mergeNext,splitSegment,undo,redo,selectBefore,selectAfter,selectAll,navPrev,navNext,tabNext,tabPrev,search,toggleNotes,toggleVoice\u3002',
  '\u989d\u5916\u5141\u8bb8\u7684\u5de5\u5177\uff08\u8fd4\u56de type:"tool"\uff0ctoolName \u9009\u5176\u4e00\uff09\uff1a',
  'nav_to_segment, nav_to_time, play_pause, mark_segment, delete_segment, split_at_time, merge_prev, merge_next, undo, redo, focus_segment, zoom_to_segment, toggle_notes, search_segments, auto_gloss_segment, get_current_segment, get_project_summary, get_recent_history。',
].join('\n');

const DEFAULT_MODE_PROMPTS: Record<VoiceResolverMode, string> = {
  command: '\u4f18\u5148\u89e3\u6790\u4e3a action/tool\uff1b\u4ec5\u5728\u65e0\u6cd5\u6620\u5c04\u52a8\u4f5c\u65f6\u8fd4\u56de chat\u3002',
  dictation: '\u82e5\u5185\u5bb9\u50cf\u53e3\u8ff0\u6587\u672c\u5219\u4f18\u5148\u8fd4\u56de chat\uff0c\u4e0d\u8981\u7f16\u9020 action\u3002',
  analysis: '\u4f18\u5148\u8fd4\u56de chat \u6216 tool\uff0c\u7528\u4e8e\u5206\u6790\u4e0e\u95ee\u7b54\u3002',
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
        ? 'LLM \u8fd4\u56de\u4e86\u770b\u4f3c JSON \u7684\u5185\u5bb9\uff0c\u4f46 JSON \u7ed3\u6784\u4e0d\u5b8c\u6574\u3002'
        : 'LLM \u672a\u8fd4\u56de\u53ef\u89e3\u6790\u7684 JSON \u610f\u56fe\u5bf9\u8c61\u3002',
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
      message: 'LLM \u8fd4\u56de\u4e86 JSON \u7247\u6bb5\uff0c\u4f46 JSON \u8bed\u6cd5\u65e0\u6548\u3002',
      rawResponse: responseText,
    };
  }

  const data = asRecord(parsed);
  if (!data) {
    return {
      ok: false,
      errorKind: 'invalid-shape',
      message: 'LLM \u8fd4\u56de\u7684 JSON \u4e0d\u662f\u5bf9\u8c61\u7ed3\u6784\u3002',
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
        message: `LLM \u8fd4\u56de\u4e86\u672a\u6ce8\u518c\u7684 actionId\uff1a${actionId || '(empty)'}`,
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
        message: 'LLM \u8fd4\u56de\u4e86 tool \u7c7b\u578b\uff0c\u4f46\u7f3a\u5c11 toolName\u3002',
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
        message: 'LLM \u8fd4\u56de\u4e86 tool_call\uff0c\u4f46\u7f3a\u5c11 name\u3002',
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
    message: 'LLM \u8fd4\u56de\u7684 JSON \u7f3a\u5c11\u53ef\u8bc6\u522b\u7684 type \u6216 tool_call \u7ed3\u6784\u3002',
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
    ? `\n\u6700\u8fd1\u4e0a\u4e0b\u6587:\n- ${recentContext.join('\n- ')}`
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
