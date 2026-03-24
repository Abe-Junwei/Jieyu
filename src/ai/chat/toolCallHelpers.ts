import { featureFlags } from '../config/featureFlags';
import { resolveLanguageQuery } from '../../utils/langMapping';
import { buildAiToolRequestId } from '../toolRequestId';
import {
  formatActionClarify,
  formatNonActionFallback,
  formatTargetClarify,
  formatToolCancelledMessage,
  formatToolFailureMessage,
  formatToolGraySkippedMessage,
  formatToolPendingMessage,
  formatToolRollbackSkippedMessage,
  formatToolSuccessMessage,
} from '../messages';
import type { AiToolFeedbackStyle } from '../providers/providerCatalog';
import type {
  AiChatToolCall,
  AiChatToolName,
  AiClarifyCandidate,
  AiPromptContext,
  AiSessionMemory,
  AiToolDecisionMode,
  PreviewContract,
  UiChatMessage,
} from '../../hooks/useAiChat';

export type ToolPlannerClarifyReason =
  | 'missing-utterance-target'
  | 'missing-split-position'
  | 'missing-translation-layer-target'
  | 'missing-layer-link-target'
  | 'missing-layer-target'
  | 'missing-language-target';

export type ToolPlannerDecision = 'resolved' | 'clarify';

export interface ToolPlannerResult {
  decision: ToolPlannerDecision;
  call: AiChatToolCall;
  reason?: ToolPlannerClarifyReason;
}

export type ToolIntentDecision = 'execute' | 'clarify' | 'ignore' | 'cancel';

export interface ToolIntentAssessment {
  decision: ToolIntentDecision;
  score: number;
  hasExecutionCue: boolean;
  hasActionVerb: boolean;
  hasActionTarget: boolean;
  hasExplicitId: boolean;
  hasMetaQuestion: boolean;
  hasTechnicalDiscussion: boolean;
}

export interface ToolIntentAssessmentOptions {
  allowDeicticExecution?: boolean;
}

export interface ToolAuditContext {
  userText: string;
  providerId: string;
  model: string;
  toolDecisionMode: AiToolDecisionMode;
  toolFeedbackStyle: AiToolFeedbackStyle;
  plannerDecision?: ToolPlannerDecision;
  plannerReason?: ToolPlannerClarifyReason;
  intentAssessment?: ToolIntentAssessment;
}

export interface ToolIntentAuditMetadata {
  schemaVersion: 1;
  phase: 'intent';
  requestId: string;
  assistantMessageId: string;
  toolCall: AiChatToolCall;
  context: ToolAuditContext;
}

export interface ToolDecisionAuditMetadata {
  schemaVersion: 1;
  phase: 'decision';
  requestId: string;
  assistantMessageId: string;
  source: 'human' | 'ai' | 'system';
  toolCall: AiChatToolCall;
  context: ToolAuditContext;
  executed: boolean;
  outcome: string;
  message?: string;
  reason?: string;
  durationMs?: number;
}

function normalizeToolCallName(rawName: string): AiChatToolName | null {
  const name = rawName.trim().toLowerCase();
  if (!name) return null;

  if (name === 'create_transcription_segment') return name;
  if (name === 'split_transcription_segment') return name;
  if (name === 'delete_transcription_segment') return name;
  if (name === 'clear_translation_segment') return name;
  if (['split_segment', 'split_transcription_row', 'split_row', 'split_utterance', 'cut_segment', 'split_current_segment'].includes(name)) return 'split_transcription_segment';
  if (['create_transcription_row', 'create_segment', 'new_segment', 'add_segment', 'new_transcription_row', 'add_transcription_row'].includes(name)) return 'create_transcription_segment';
  if (['delete_transcription_row', 'remove_transcription_row', 'remove_utterance', 'delete_utterance', 'remove_row', 'delete_row', 'delete_segment', 'remove_segment'].includes(name)) return 'delete_transcription_segment';
  if (['delete_translation_row', 'clear_translation_text', 'clear_translation', 'empty_translation', 'remove_translation_text', 'clear_segment_translation'].includes(name)) return 'clear_translation_segment';
  if (name === 'set_transcription_text') return name;
  if (name === 'set_translation_text') return name;
  if (name === 'create_transcription_layer') return name;
  if (name === 'create_translation_layer') return name;
  if (name === 'delete_layer') return name;
  if (name === 'link_translation_layer') return name;
  if (name === 'unlink_translation_layer') return name;
  if (name === 'auto_gloss_utterance') return name;
  if (name === 'set_token_pos') return name;
  if (name === 'set_token_gloss') return name;

  if (['auto_gloss', 'auto_gloss_selected', 'gloss_utterance', 'auto_annotate'].includes(name)) {
    return 'auto_gloss_utterance';
  }

  if (['create_layer', 'new_layer', 'add_layer', 'new_transcription_layer', 'add_transcription_layer'].includes(name)) {
    return 'create_transcription_layer';
  }
  if (['new_translation_layer', 'add_translation_layer'].includes(name)) {
    return 'create_translation_layer';
  }
  if (['remove_layer', 'delete_translation_layer', 'delete_transcription_layer'].includes(name)) {
    return 'delete_layer';
  }
  if (['link_layer', 'create_layer_link', 'add_layer_link', 'connect_layers', 'toggle_layer_link'].includes(name)) {
    return 'link_translation_layer';
  }
  if (['unlink_layer', 'remove_layer_link', 'disconnect_layers'].includes(name)) {
    return 'unlink_translation_layer';
  }

  return null;
}

function extractBalancedJsonObjects(rawText: string): string[] {
  const results: string[] = [];
  const text = rawText.trim();
  if (!text.includes('{')) return results;

  for (let start = 0; start < text.length; start += 1) {
    if (text[start] !== '{') continue;

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let cursor = start; cursor < text.length; cursor += 1) {
      const ch = text[cursor]!;

      if (escaped) {
        escaped = false;
        continue;
      }

      if (ch === '\\') {
        escaped = true;
        continue;
      }

      if (ch === '"') {
        inString = !inString;
        continue;
      }

      if (inString) continue;

      if (ch === '{') {
        depth += 1;
      } else if (ch === '}') {
        depth -= 1;
        if (depth === 0) {
          const candidate = text.slice(start, cursor + 1).trim();
          if (candidate.length > 0) {
            results.push(candidate);
          }
          break;
        }
      }
    }
  }

  return results;
}

export function parseToolCallFromText(rawText: string): AiChatToolCall | null {
  const text = rawText.trim();
  if (text.length === 0) return null;

  const candidates: string[] = [text, ...extractBalancedJsonObjects(text)];
  const jsonFenceRegex = /```(?:json)?\s*([\s\S]*?)```/gi;
  let matched = jsonFenceRegex.exec(text);
  while (matched) {
    const candidate = (matched[1] ?? '').trim();
    if (candidate.length > 0) candidates.push(candidate);
    matched = jsonFenceRegex.exec(text);
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      const holder = (typeof parsed === 'object' && parsed !== null && 'tool_call' in parsed)
        ? (parsed as { tool_call: unknown }).tool_call
        : parsed;

      if (!holder || typeof holder !== 'object') continue;
      const call = holder as { name?: unknown; arguments?: unknown };
      if (typeof call.name !== 'string') continue;
      const normalizedName = normalizeToolCallName(call.name);
      if (!normalizedName) {
        continue;
      }

      const args = (call.arguments && typeof call.arguments === 'object')
        ? call.arguments as Record<string, unknown>
        : {};
      return { name: normalizedName, arguments: args };
    } catch {
      // 候选可能包含自然语言片段，解析失败属于正常分支 | Candidates may contain natural language; parse failure is expected on non-JSON text
    }
  }

  return null;
}

export function parseLegacyNarratedToolCall(text: string): AiChatToolCall | null {
  const patterns = [
    /我识别到你想执行[“\”]([^”\”]+)[“\”]/,
    /I think you want to (?:run|use|execute) [“\']([^”\']+)[“\']/i,
    /you want to (?:run|use|execute) [“\']([^”\']+)[“\']/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const legacyName = match[1]?.trim() ?? '';
    const normalizedName = normalizeToolCallName(legacyName);
    if (!normalizedName) continue;
    return { name: normalizedName, arguments: {} };
  }
  return null;
}

const AMBIGUOUS_LANGUAGE_TARGET_PATTERN = /^(und|unknown|auto|default)$/i;

function isAmbiguousLanguageTarget(value: unknown): boolean {
  if (typeof value !== 'string') return true;
  const trimmed = value.trim();
  if (trimmed.length === 0) return true;
  return AMBIGUOUS_LANGUAGE_TARGET_PATTERN.test(trimmed);
}

function requiresConcreteLanguageTarget(callName: AiChatToolName): boolean {
  return callName === 'create_transcription_layer' || callName === 'create_translation_layer';
}

function getFirstNonEmptyString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return '';
}

function inferDeleteLayerArgumentsFromText(userText: string): Partial<AiChatToolCall['arguments']> {
  const normalizedText = userText.trim();
  if (!normalizedText) return {};

  let layerType: 'translation' | 'transcription' | undefined;
  if (/(翻译层|译文层)/i.test(normalizedText)) layerType = 'translation';
  if (/(转写层|转录层|听写层)/i.test(normalizedText)) layerType = 'transcription';

  const languageQueryMatch = normalizedText.match(/删除\s*(.+?)\s*(?:翻译层|译文层|转写层|转录层|听写层|层)/i);
  const languageQuery = languageQueryMatch?.[1]?.trim();

  const result: Partial<AiChatToolCall['arguments']> = {};
  if (layerType) result.layerType = layerType;
  if (languageQuery) result.languageQuery = languageQuery;
  return result;
}

const TOOL_ARG_MAX_ID_LENGTH = 128;
const TOOL_ARG_MAX_TEXT_LENGTH = 5000;

function validateArgId(args: Record<string, unknown>, key: string, required: boolean): string | null {
  if (!(key in args)) return required ? `缺少 ${key}。` : null;
  const value = args[key];
  if (typeof value !== 'string') return `${key} 必须是字符串。`;
  const trimmed = value.trim();
  if (trimmed.length === 0) return `${key} 不能为空。`;
  if (trimmed.length > TOOL_ARG_MAX_ID_LENGTH) return `${key} 长度不能超过 ${TOOL_ARG_MAX_ID_LENGTH}。`;
  return null;
}

function validateArgText(args: Record<string, unknown>): string | null {
  const value = args.text;
  if (typeof value !== 'string') return 'text 必须是字符串。';
  const trimmed = value.trim();
  if (trimmed.length === 0) return 'text 不能为空。';
  if (trimmed.length > TOOL_ARG_MAX_TEXT_LENGTH) return `text 长度不能超过 ${TOOL_ARG_MAX_TEXT_LENGTH}。`;
  return null;
}

function validateSplitSegmentArgs(args: Record<string, unknown>): string | null {
  const idValidation = validateArgId(args, 'utteranceId', true);
  if (idValidation) return idValidation;

  if (!('splitTime' in args)) return null;
  const splitTime = args.splitTime;
  if (typeof splitTime !== 'number' || !Number.isFinite(splitTime)) {
    return 'splitTime 必须是数值（秒）。';
  }
  if (splitTime < 0) {
    return 'splitTime 不能为负数。';
  }
  return null;
}

function validateArgLayerCreate(args: Record<string, unknown>, allowModality: boolean): string | null {
  const languageId = args.languageId;
  const languageQuery = args.languageQuery;
  const effectiveLang = (typeof languageId === 'string' && languageId.trim().length > 0)
    ? languageId.trim()
    : (typeof languageQuery === 'string' && languageQuery.trim().length > 0)
      ? languageQuery.trim()
      : '';
  if (effectiveLang.length === 0) {
    return 'languageId 必须是非空字符串。';
  }
  if (isAmbiguousLanguageTarget(effectiveLang)) {
    return 'languageId 不能是 und/unknown/auto/default，请提供明确语言。';
  }
  if (effectiveLang.length > 32) return 'languageId/languageQuery 长度不能超过 32。';
  if ('alias' in args) {
    const alias = args.alias;
    if (typeof alias !== 'string') return 'alias 必须是字符串。';
    if (alias.trim().length > 64) return 'alias 长度不能超过 64。';
  }
  if (allowModality && 'modality' in args) {
    const modality = args.modality;
    if (typeof modality !== 'string') return 'modality 必须是字符串。';
    if (!['text', 'audio', 'mixed'].includes((modality as string).trim().toLowerCase())) {
      return 'modality 必须是 text/audio/mixed 之一。';
    }
  }
  return null;
}

function validateDeleteLayerArgs(args: Record<string, unknown>): string | null {
  const layerIdValidation = validateArgId(args, 'layerId', false);
  if (layerIdValidation) return layerIdValidation;
  const hasLayerId = typeof args.layerId === 'string' && args.layerId.trim().length > 0;
  if (hasLayerId) return null;
  const layerType = args.layerType;
  if (layerType !== 'translation' && layerType !== 'transcription') {
    return '缺少 layerId，且 layerType 必须是 translation/transcription 之一。';
  }
  const languageQuery = args.languageQuery;
  if (typeof languageQuery !== 'string' || languageQuery.trim().length === 0) {
    return '缺少 layerId 时必须提供 languageQuery。';
  }
  if (languageQuery.trim().length > 32) return 'languageQuery 长度不能超过 32。';
  return null;
}

function validateLinkLayerArgs(args: Record<string, unknown>): string | null {
  if (!('transcriptionLayerId' in args) && !('transcriptionLayerKey' in args)) {
    return '缺少 transcriptionLayerId/transcriptionLayerKey。';
  }
  if (!('translationLayerId' in args) && !('layerId' in args)) {
    return '缺少 translationLayerId/layerId。';
  }
  return validateArgId(args, 'transcriptionLayerId', false)
    ?? validateArgId(args, 'transcriptionLayerKey', false)
    ?? validateArgId(args, 'translationLayerId', false)
    ?? validateArgId(args, 'layerId', false);
}

interface ToolContextFillSpec {
  utteranceId?: boolean;
  translationLayerId?: boolean;
  linkBothLayers?: boolean;
  layerTargetInference?: boolean;
}

interface ToolStrategy {
  label: string;
  contextFill?: ToolContextFillSpec;
  destructive?: boolean;
  validateArgs?: (args: Record<string, unknown>) => string | null;
  riskSpec?: {
    summary: (args: Record<string, unknown>) => string;
    preview: string[];
  };
}

const TOOL_STRATEGY_TABLE: Record<AiChatToolName, ToolStrategy> = {
  create_transcription_segment: {
    label: '创建句段',
    contextFill: { utteranceId: true },
    validateArgs: (args) => validateArgId(args, 'utteranceId', true),
  },
  split_transcription_segment: {
    label: '切分句段',
    contextFill: { utteranceId: true },
    validateArgs: validateSplitSegmentArgs,
  },
  delete_transcription_segment: {
    label: '删除句段',
    contextFill: { utteranceId: true },
    destructive: true,
    validateArgs: (args) => validateArgId(args, 'utteranceId', true),
    riskSpec: {
      summary: (args) => {
        const utteranceId = typeof args.utteranceId === 'string' ? args.utteranceId : '';
        const target = utteranceId.trim().length > 0 ? utteranceId : 'current-segment';
        return `将删除 1 条句段（目标：${target}）`;
      },
      preview: [
        '该句段的时间范围与转写文本会被清除',
        '可通过撤销（Undo）恢复',
        '关联翻译可能变为空引用',
      ],
    },
  },
  clear_translation_segment: {
    label: '清空翻译',
    contextFill: { utteranceId: true, translationLayerId: true },
    validateArgs: (args) => validateArgId(args, 'utteranceId', true) ?? validateArgId(args, 'layerId', true),
  },
  set_transcription_text: {
    label: '写入转写',
    contextFill: { utteranceId: true },
    validateArgs: (args) => validateArgText(args) ?? validateArgId(args, 'utteranceId', true),
  },
  set_translation_text: {
    label: '写入翻译',
    contextFill: { utteranceId: true, translationLayerId: true },
    validateArgs: (args) => validateArgText(args) ?? validateArgId(args, 'utteranceId', true) ?? validateArgId(args, 'layerId', true),
  },
  create_transcription_layer: {
    label: '创建转写层',
    validateArgs: (args) => validateArgLayerCreate(args, false),
  },
  create_translation_layer: {
    label: '创建翻译层',
    validateArgs: (args) => validateArgLayerCreate(args, true),
  },
  delete_layer: {
    label: '删除层',
    contextFill: { layerTargetInference: true },
    destructive: true,
    validateArgs: validateDeleteLayerArgs,
    riskSpec: {
      summary: (args) => {
        const layerId = typeof args.layerId === 'string' ? args.layerId.trim() : '';
        const layerType = typeof args.layerType === 'string' ? args.layerType.trim() : '';
        const languageQuery = typeof args.languageQuery === 'string' ? args.languageQuery.trim() : '';
        const typeLabel = layerType === 'transcription' ? '转写层' : layerType === 'translation' ? '翻译层' : '层';
        if (languageQuery) {
          return `将删除整层数据（目标：${languageQuery}${typeLabel}${layerId ? `，ID：${layerId}` : ''}）`;
        }
        const layerLabel = layerId || 'current-layer';
        return `将删除整层数据（目标层：${layerLabel}）`;
      },
      preview: [
        '该层下的文本会被一并移除',
        '可通过撤销（Undo）恢复',
        '与该层相关的链接/对齐关系可能失效',
      ],
    },
  },
  link_translation_layer: {
    label: '关联翻译层',
    contextFill: { linkBothLayers: true },
    validateArgs: validateLinkLayerArgs,
  },
  unlink_translation_layer: {
    label: '解除翻译层关联',
    contextFill: { linkBothLayers: true },
    validateArgs: validateLinkLayerArgs,
  },
  auto_gloss_utterance: {
    label: '自动词汇标注',
    contextFill: { utteranceId: true },
    validateArgs: (args) => validateArgId(args, 'utteranceId', true),
  },
  set_token_pos: {
    label: '设置词性',
    contextFill: { utteranceId: true },
    validateArgs: (args) => validateArgId(args, 'utteranceId', false),
  },
  set_token_gloss: {
    label: '设置词汇标注',
    contextFill: {},
    validateArgs: (args) => validateArgId(args, 'tokenId', true),
  },
  play_pause: { label: '播放/暂停', contextFill: {}, validateArgs: () => null },
  undo: { label: '撤销', contextFill: {}, validateArgs: () => null },
  redo: { label: '重做', contextFill: {}, validateArgs: () => null },
  search_segments: { label: '搜索句段', contextFill: {}, validateArgs: () => null },
  toggle_notes: { label: '切换备注', contextFill: {}, validateArgs: () => null },
  mark_segment: { label: '标记句段', contextFill: {}, validateArgs: () => null },
  delete_segment: { label: '删除句段', contextFill: {}, validateArgs: () => null },
  auto_gloss_segment: {
    label: '自动标注',
    contextFill: { utteranceId: true },
    validateArgs: (args) => validateArgId(args, 'utteranceId', false),
  },
  auto_translate_segment: {
    label: '自动翻译',
    contextFill: { utteranceId: true },
    validateArgs: (args) => validateArgId(args, 'utteranceId', false),
  },
  nav_to_segment: {
    label: '导航到句段',
    contextFill: {},
    validateArgs: (args) => validateArgId(args, 'segmentIndex', true),
  },
  nav_to_time: {
    label: '导航到时间',
    contextFill: {},
    validateArgs: (args) => validateArgId(args, 'timeSeconds', true),
  },
  focus_segment: {
    label: '聚焦句段',
    contextFill: {},
    validateArgs: (args) => validateArgId(args, 'segmentId', true),
  },
  zoom_to_segment: {
    label: '缩放至句段',
    contextFill: {},
    validateArgs: (args) => validateArgId(args, 'segmentId', true),
  },
  split_at_time: {
    label: '时间点分割',
    contextFill: {},
    validateArgs: (args) => validateArgId(args, 'timeSeconds', true),
  },
  merge_prev: { label: '合并上一个', contextFill: {}, validateArgs: () => null },
  merge_next: { label: '合并下一个', contextFill: {}, validateArgs: () => null },
  auto_segment: {
    label: '自动切分',
    contextFill: {},
    validateArgs: (args) => validateArgId(args, 'startTime', false),
  },
  suggest_segment_improvement: {
    label: '建议改进',
    contextFill: { utteranceId: true },
    validateArgs: (args) => validateArgId(args, 'utteranceId', false),
  },
  analyze_segment_quality: {
    label: '分析质量',
    contextFill: { utteranceId: true },
    validateArgs: (args) => validateArgId(args, 'utteranceId', false),
  },
  get_current_segment: { label: '获取当前句段', contextFill: {}, validateArgs: () => null },
  get_project_summary: { label: '获取项目摘要', contextFill: {}, validateArgs: () => null },
  get_recent_history: { label: '获取最近历史', contextFill: {}, validateArgs: () => null },
};

export function planToolCallTargets(
  call: AiChatToolCall,
  userText: string,
  context: AiPromptContext | null | undefined,
): ToolPlannerResult {
  const shortTerm = context?.shortTerm;
  const currentUtteranceId = getFirstNonEmptyString(shortTerm?.selectedUtteranceId);
  const currentUtteranceStartSec = typeof shortTerm?.selectedUtteranceStartSec === 'number' && Number.isFinite(shortTerm.selectedUtteranceStartSec)
    ? shortTerm.selectedUtteranceStartSec
    : undefined;
  const currentUtteranceEndSec = typeof shortTerm?.selectedUtteranceEndSec === 'number' && Number.isFinite(shortTerm.selectedUtteranceEndSec)
    ? shortTerm.selectedUtteranceEndSec
    : undefined;
  const currentAudioTimeSec = typeof shortTerm?.audioTimeSec === 'number' && Number.isFinite(shortTerm.audioTimeSec)
    ? shortTerm.audioTimeSec
    : undefined;
  const selectedLayerId = getFirstNonEmptyString(shortTerm?.selectedLayerId);
  const selectedLayerType = shortTerm?.selectedLayerType;
  const selectedTranslationLayerId = getFirstNonEmptyString(
    shortTerm?.selectedTranslationLayerId,
    selectedLayerType === 'translation' ? selectedLayerId : '',
  );
  const selectedTranscriptionLayerId = getFirstNonEmptyString(
    shortTerm?.selectedTranscriptionLayerId,
    selectedLayerType === 'transcription' ? selectedLayerId : '',
  );

  const nextCall: AiChatToolCall = {
    ...call,
    arguments: { ...call.arguments },
  };

  const ensureUtteranceId = (): string => {
    const existing = getFirstNonEmptyString(nextCall.arguments.utteranceId);
    if (existing) {
      if (currentUtteranceId && existing !== currentUtteranceId) {
        nextCall.arguments.utteranceId = currentUtteranceId;
        return currentUtteranceId;
      }
      if (!currentUtteranceId) {
        return existing;
      }
      return existing;
    }
    if (currentUtteranceId) {
      nextCall.arguments.utteranceId = currentUtteranceId;
      return currentUtteranceId;
    }
    return '';
  };

  const cf = TOOL_STRATEGY_TABLE[call.name]?.contextFill;

  if (requiresConcreteLanguageTarget(call.name)) {
    if (isAmbiguousLanguageTarget(nextCall.arguments.languageId) && isAmbiguousLanguageTarget(nextCall.arguments.languageQuery)) {
      return { decision: 'clarify', call: nextCall, reason: 'missing-language-target' };
    }
  }

  if (cf?.utteranceId) {
    const utteranceId = ensureUtteranceId();
    if (!utteranceId) {
      return { decision: 'clarify', call: nextCall, reason: 'missing-utterance-target' };
    }
  }

  if (call.name === 'split_transcription_segment') {
    const rawSplitTime = nextCall.arguments.splitTime;
    const splitTime = typeof rawSplitTime === 'number' && Number.isFinite(rawSplitTime)
      ? rawSplitTime
      : currentAudioTimeSec;

    if (!(typeof splitTime === 'number' && Number.isFinite(splitTime))) {
      return { decision: 'clarify', call: nextCall, reason: 'missing-split-position' };
    }

    nextCall.arguments.splitTime = splitTime;

    if (typeof currentUtteranceStartSec === 'number' && typeof currentUtteranceEndSec === 'number') {
      const minSpan = 0.05;
      if (splitTime <= currentUtteranceStartSec + minSpan || splitTime >= currentUtteranceEndSec - minSpan) {
        return { decision: 'clarify', call: nextCall, reason: 'missing-split-position' };
      }
    }
  }

  if (cf?.translationLayerId) {
    const layerId = getFirstNonEmptyString(nextCall.arguments.layerId);
    if (layerId) {
      if (selectedTranslationLayerId && layerId !== selectedTranslationLayerId) {
        nextCall.arguments.layerId = selectedTranslationLayerId;
      }
    } else if (selectedTranslationLayerId) {
      nextCall.arguments.layerId = selectedTranslationLayerId;
    }
    if (!getFirstNonEmptyString(nextCall.arguments.layerId)) {
      return { decision: 'clarify', call: nextCall, reason: 'missing-translation-layer-target' };
    }
  }

  if (cf?.linkBothLayers) {
    let transcriptionLayerId = getFirstNonEmptyString(nextCall.arguments.transcriptionLayerId);
    const transcriptionLayerKey = getFirstNonEmptyString(nextCall.arguments.transcriptionLayerKey);
    const refersCurrentLayerPair = /(当前|这层|该层|本层|当前层)/i.test(userText);

    if (transcriptionLayerId && selectedTranscriptionLayerId && transcriptionLayerId !== selectedTranscriptionLayerId) {
      nextCall.arguments.transcriptionLayerId = selectedTranscriptionLayerId;
      transcriptionLayerId = selectedTranscriptionLayerId;
    }
    if (!transcriptionLayerId && !transcriptionLayerKey && selectedTranscriptionLayerId && refersCurrentLayerPair) {
      nextCall.arguments.transcriptionLayerId = selectedTranscriptionLayerId;
    }

    let translationLayerId = getFirstNonEmptyString(nextCall.arguments.translationLayerId, nextCall.arguments.layerId);
    if (translationLayerId && selectedTranslationLayerId && translationLayerId !== selectedTranslationLayerId) {
      nextCall.arguments.translationLayerId = selectedTranslationLayerId;
      translationLayerId = selectedTranslationLayerId;
    }
    if (!translationLayerId && selectedTranslationLayerId && refersCurrentLayerPair) {
      nextCall.arguments.translationLayerId = selectedTranslationLayerId;
    }

    const hasTranscriptionTarget = getFirstNonEmptyString(nextCall.arguments.transcriptionLayerId, nextCall.arguments.transcriptionLayerKey).length > 0;
    const hasTranslationTarget = getFirstNonEmptyString(nextCall.arguments.translationLayerId, nextCall.arguments.layerId).length > 0;
    if (!hasTranscriptionTarget || !hasTranslationTarget) {
      return { decision: 'clarify', call: nextCall, reason: 'missing-layer-link-target' };
    }
  }

  if (cf?.layerTargetInference) {
    let layerId = getFirstNonEmptyString(nextCall.arguments.layerId);

    if (layerId) {
      const knownIds = [selectedLayerId, selectedTranscriptionLayerId, selectedTranslationLayerId].filter(Boolean);
      if (!knownIds.includes(layerId)) {
        nextCall.arguments = { ...nextCall.arguments };
        delete nextCall.arguments.layerId;
        layerId = '';
      }
    }

    if (!layerId) {
      const inferred = inferDeleteLayerArgumentsFromText(userText);
      nextCall.arguments = { ...nextCall.arguments, ...inferred };

      const refersCurrentLayer = /(当前|这层|该层|本层).*(层)|删除当前层|删除这层/i.test(userText);
      if (refersCurrentLayer && selectedLayerId) {
        nextCall.arguments.layerId = selectedLayerId;
      }

      if (!getFirstNonEmptyString(nextCall.arguments.layerId)) {
        const inferredType = getFirstNonEmptyString(nextCall.arguments.layerType);
        const hasLanguageHint = getFirstNonEmptyString(nextCall.arguments.languageQuery).length > 0;
        if (!hasLanguageHint) {
          if (inferredType === 'transcription' && selectedTranscriptionLayerId) {
            nextCall.arguments.layerId = selectedTranscriptionLayerId;
          } else if (inferredType === 'translation' && selectedTranslationLayerId) {
            nextCall.arguments.layerId = selectedTranslationLayerId;
          }
        }
      }
    }

    const hasLayerId = getFirstNonEmptyString(nextCall.arguments.layerId).length > 0;
    const hasLayerType = getFirstNonEmptyString(nextCall.arguments.layerType).length > 0;
    const hasLanguageQuery = getFirstNonEmptyString(nextCall.arguments.languageQuery).length > 0;
    if (!hasLayerId && !(hasLayerType && hasLanguageQuery)) {
      return { decision: 'clarify', call: nextCall, reason: 'missing-layer-target' };
    }
  }

  return { decision: 'resolved', call: nextCall };
}

function isDeicticConfirmationMessage(userText: string): boolean {
  const normalized = userText.trim();
  return /^(这个|这个吧|就这个|它|它吧|就它|这条|该条|这一条|这个句段|该句段|这个字段|该字段|这里|此处|在这里|在此处|就这里|就此处)$/i.test(normalized);
}

export function extractClarifyLanguagePatch(userText: string): Record<string, string> | null {
  const trimmed = userText.trim().replace(/[的那个吧]$/g, '').trim();
  if (!trimmed || trimmed.length > 20) return null;
  const resolved = resolveLanguageQuery(trimmed);
  if (!resolved) return null;
  return { languageId: resolved, languageQuery: trimmed };
}

export function extractClarifySplitPositionPatch(
  userText: string,
  context: AiPromptContext | null | undefined,
): Record<string, number | string> | null {
  if (!/^(这里|此处|在这里|在此处|就这里|就此处)$/i.test(userText.trim())) return null;
  const selectedUtteranceId = getFirstNonEmptyString(context?.shortTerm?.selectedUtteranceId);
  const audioTimeSec = context?.shortTerm?.audioTimeSec;
  if (!selectedUtteranceId) return null;
  if (typeof audioTimeSec !== 'number' || !Number.isFinite(audioTimeSec)) return null;
  return { utteranceId: selectedUtteranceId, splitTime: audioTimeSec };
}

function hasResolvableSelectionTargetForTool(callName: AiChatToolName, context: AiPromptContext | null | undefined): boolean {
  const short = context?.shortTerm;
  const selectedUtteranceId = getFirstNonEmptyString(short?.selectedUtteranceId);
  const selectedLayerId = getFirstNonEmptyString(short?.selectedLayerId);
  const selectedLayerType = short?.selectedLayerType;
  const selectedTranslationLayerId = getFirstNonEmptyString(
    short?.selectedTranslationLayerId,
    selectedLayerType === 'translation' ? selectedLayerId : '',
  );
  const selectedTranscriptionLayerId = getFirstNonEmptyString(
    short?.selectedTranscriptionLayerId,
    selectedLayerType === 'transcription' ? selectedLayerId : '',
  );

  if (['create_transcription_segment', 'split_transcription_segment', 'delete_transcription_segment', 'set_transcription_text', 'auto_gloss_utterance', 'set_token_pos', 'set_token_gloss'].includes(callName)) {
    return selectedUtteranceId.length > 0;
  }
  if (['set_translation_text', 'clear_translation_segment'].includes(callName)) {
    return selectedUtteranceId.length > 0 && selectedTranslationLayerId.length > 0;
  }
  if (callName === 'delete_layer') {
    return selectedLayerId.length > 0;
  }
  if (['link_translation_layer', 'unlink_translation_layer'].includes(callName)) {
    return selectedTranscriptionLayerId.length > 0 && selectedTranslationLayerId.length > 0;
  }
  return false;
}

function wasRecentAssistantClarification(messages: UiChatMessage[]): boolean {
  const latestAssistant = messages.find((item) => item.role === 'assistant' && item.content.trim().length > 0);
  if (!latestAssistant) return false;
  return /(还不够确定|还不能安全执行|缺少目标|请先选中目标)/.test(latestAssistant.content);
}

export function shouldAllowDeicticExecutionIntent(
  userText: string,
  callName: AiChatToolName,
  context: AiPromptContext | null | undefined,
  messages: UiChatMessage[],
): boolean {
  if (!isDeicticConfirmationMessage(userText)) return false;
  const hasResolvableTarget = hasResolvableSelectionTargetForTool(callName, context);
  if (!hasResolvableTarget) return false;
  return wasRecentAssistantClarification(messages) || hasResolvableTarget;
}

export function assessToolActionIntent(userText: string, options?: ToolIntentAssessmentOptions): ToolIntentAssessment {
  const trimmed = userText.trim();
  const normalized = trimmed.toLowerCase();
  const allowDeicticExecution = options?.allowDeicticExecution ?? false;
  if (!normalized || normalized.length <= 2 || /^[\p{P}\p{S}\s]+$/u.test(normalized)) {
    if (allowDeicticExecution && isDeicticConfirmationMessage(trimmed)) {
      return {
        decision: 'execute',
        score: 3,
        hasExecutionCue: false,
        hasActionVerb: false,
        hasActionTarget: true,
        hasExplicitId: true,
        hasMetaQuestion: false,
        hasTechnicalDiscussion: false,
      };
    }
    return {
      decision: 'ignore',
      score: -1,
      hasExecutionCue: false,
      hasActionVerb: false,
      hasActionTarget: false,
      hasExplicitId: false,
      hasMetaQuestion: false,
      hasTechnicalDiscussion: false,
    };
  }

  if (normalized.includes('__tool_')) {
    return {
      decision: import.meta.env.MODE === 'test' ? 'execute' : 'ignore',
      score: import.meta.env.MODE === 'test' ? 99 : -1,
      hasExecutionCue: true,
      hasActionVerb: true,
      hasActionTarget: true,
      hasExplicitId: true,
      hasMetaQuestion: false,
      hasTechnicalDiscussion: false,
    };
  }

  const cancelPattern = /^(算了|不做了|不用了|取消|取消吧|别[做删建]了|不要了|never\s*mind|cancel|forget\s*it|stop|nvm|没事了|不需要了|还是算了)$/i;
  if (cancelPattern.test(normalized)) {
    return {
      decision: 'cancel',
      score: -5,
      hasExecutionCue: false,
      hasActionVerb: false,
      hasActionTarget: false,
      hasExplicitId: false,
      hasMetaQuestion: false,
      hasTechnicalDiscussion: false,
    };
  }

  const executionCuePattern = /(请帮|请把|请将|帮我|把|将|给我|执行|run|do|please|麻烦|帮忙|可否|可以把|当前|此)/i;
  const actionVerbPattern = /(创建|新建|新增|切分|拆分|删除|清空|移除|写入|填写|填入|设置|设为|修改|改成|改为|更新|覆盖|替换|关联|链接|解除|断开|自动标注|转写|翻译|create|add|insert|split|delete|remove|clear|set|update|replace|link|unlink|gloss)/i;
  const actionTargetPattern = /(句段|段落|segment|层|layer|转写|翻译|文本|text|gloss|词义|utterance|当前|此|这个|那个)/i;
  const actionObjectPronounPattern = /(之|它|其|这条|该条|本条|此条|这个|那个)$/i;
  const explicitIdPattern = /(utteranceId|layerId|transcriptionLayerId|translationLayerId|\bu\d+\b|\blayer[-_a-z0-9]+\b|当前|此|这个|那个)/i;

  let score = 0;
  const hasExecutionCue = executionCuePattern.test(trimmed);
  const hasActionVerb = actionVerbPattern.test(trimmed);
  const hasActionTarget = actionTargetPattern.test(trimmed)
    || (actionVerbPattern.test(trimmed) && actionObjectPronounPattern.test(trimmed));
  const hasExplicitId = explicitIdPattern.test(trimmed);

  if (hasExecutionCue) score += 1;
  if (hasActionVerb) score += 2;
  if (hasActionTarget) score += 2;
  if (hasExplicitId) score += 1;

  const greetingPattern = /^(你好|您好|嗨|hello|hi|hey)([！!，,.。?？\s].*)?$/i;
  const metaQuestionPattern = /(什么是|是什么意思|什么意思|请解释|解释一下|解释|说明一下|说明|含义|用法|区别|原理|why|what is|what does|explain|meaning|how to use)/i;
  const technicalDiscussionPattern = /(tool_call|set_translation_text|set_transcription_text|delete_layer|create_translation_layer|create_transcription_layer|命令|指令|函数|接口|api)/i;
  const endsWithQuestionPattern = /[?？]\s*$/;
  const hasMetaQuestion = metaQuestionPattern.test(trimmed);
  const hasTechnicalDiscussion = technicalDiscussionPattern.test(trimmed);
  const hasActionCore = hasActionVerb && hasActionTarget;
  const hasAnyActionSignal = hasExecutionCue || hasActionVerb || hasActionTarget || hasExplicitId;
  if (greetingPattern.test(trimmed)) score -= 4;
  if (hasMetaQuestion) score -= 3;
  if (hasMetaQuestion && hasTechnicalDiscussion) score -= 2;
  if (endsWithQuestionPattern.test(trimmed) && !hasActionVerb) score -= 1;

  if (hasMetaQuestion && !hasExecutionCue) {
    return {
      decision: 'ignore',
      score,
      hasExecutionCue,
      hasActionVerb,
      hasActionTarget,
      hasExplicitId,
      hasMetaQuestion,
      hasTechnicalDiscussion,
    };
  }

  if (hasActionCore && score >= 3) {
    return {
      decision: 'execute',
      score,
      hasExecutionCue,
      hasActionVerb,
      hasActionTarget,
      hasExplicitId,
      hasMetaQuestion,
      hasTechnicalDiscussion,
    };
  }

  if (allowDeicticExecution && hasActionTarget && score >= 3) {
    return {
      decision: 'execute',
      score,
      hasExecutionCue,
      hasActionVerb,
      hasActionTarget,
      hasExplicitId,
      hasMetaQuestion,
      hasTechnicalDiscussion,
    };
  }

  if (hasAnyActionSignal && score >= 1) {
    return {
      decision: 'clarify',
      score,
      hasExecutionCue,
      hasActionVerb,
      hasActionTarget,
      hasExplicitId,
      hasMetaQuestion,
      hasTechnicalDiscussion,
    };
  }

  return {
    decision: 'ignore',
    score,
    hasExecutionCue,
    hasActionVerb,
    hasActionTarget,
    hasExplicitId,
    hasMetaQuestion,
    hasTechnicalDiscussion,
  };
}

export function isDestructiveToolCall(name: AiChatToolName): boolean {
  return TOOL_STRATEGY_TABLE[name]?.destructive ?? false;
}

function describeToolCallImpact(call: AiChatToolCall): { riskSummary: string; impactPreview: string[] } {
  const spec = TOOL_STRATEGY_TABLE[call.name];
  if (spec?.riskSpec) {
    return {
      riskSummary: spec.riskSpec.summary(call.arguments),
      impactPreview: spec.riskSpec.preview,
    };
  }
  return {
    riskSummary: `该操作会修改数据：${call.name}`,
    impactPreview: ['请确认目标与影响后再继续。'],
  };
}

export function buildPreviewContract(call: AiChatToolCall): PreviewContract {
  const args = call.arguments;
  if (call.name === 'delete_transcription_segment') {
    const uid = typeof args.utteranceId === 'string' ? args.utteranceId.trim() : '';
    return {
      affectedCount: 1,
      affectedIds: uid ? [uid] : [],
      reversible: true,
      cascadeTypes: ['translation'],
    };
  }
  if (call.name === 'delete_layer') {
    const lid = typeof args.layerId === 'string' ? args.layerId.trim() : '';
    return {
      affectedCount: 1,
      affectedIds: lid ? [lid] : [],
      reversible: true,
      cascadeTypes: ['link', 'alignment'],
    };
  }
  return {
    affectedCount: 1,
    affectedIds: [],
    reversible: false,
  };
}

export function validateToolCallArguments(call: AiChatToolCall): string | null {
  const spec = TOOL_STRATEGY_TABLE[call.name];
  if (!spec?.validateArgs) return null;
  return spec.validateArgs(call.arguments);
}

function toToolActionLabel(callName: AiChatToolName): string {
  return TOOL_STRATEGY_TABLE[callName]?.label ?? callName;
}

export function toNaturalToolSuccess(callName: AiChatToolName, message: string, style: AiToolFeedbackStyle): string {
  return formatToolSuccessMessage(toToolActionLabel(callName), message, style);
}

export function toNaturalToolFailure(callName: AiChatToolName, message: string, style: AiToolFeedbackStyle): string {
  return formatToolFailureMessage(callName, toToolActionLabel(callName), message, style);
}

export function toNaturalToolPending(callName: AiChatToolName, style: AiToolFeedbackStyle): string {
  return formatToolPendingMessage(toToolActionLabel(callName), style);
}

export function toNaturalToolGraySkipped(callName: AiChatToolName, style: AiToolFeedbackStyle): string {
  return formatToolGraySkippedMessage(toToolActionLabel(callName), style);
}

export function toNaturalToolRollbackSkipped(callName: AiChatToolName, style: AiToolFeedbackStyle): string {
  return formatToolRollbackSkippedMessage(toToolActionLabel(callName), style);
}

export function resolveAiToolDecisionMode(): AiToolDecisionMode {
  if (featureFlags.aiChatRollbackMode) return 'rollback';
  if (featureFlags.aiChatGrayMode) return 'gray';
  return 'enabled';
}

export function buildToolAuditContext(
  userText: string,
  providerId: string,
  model: string,
  toolDecisionMode: AiToolDecisionMode,
  toolFeedbackStyle: AiToolFeedbackStyle,
  planner?: ToolPlannerResult | null,
  intentAssessment?: ToolIntentAssessment,
): ToolAuditContext {
  return {
    userText,
    providerId,
    model,
    toolDecisionMode,
    toolFeedbackStyle,
    ...(planner?.decision ? { plannerDecision: planner.decision } : {}),
    ...(planner?.reason ? { plannerReason: planner.reason } : {}),
    ...(intentAssessment ? { intentAssessment } : {}),
  };
}

export function buildToolIntentAuditMetadata(
  assistantMessageId: string,
  toolCall: AiChatToolCall,
  context: ToolAuditContext,
): ToolIntentAuditMetadata {
  return {
    schemaVersion: 1,
    phase: 'intent',
    requestId: toolCall.requestId ?? buildAiToolRequestId(toolCall),
    assistantMessageId,
    toolCall,
    context,
  };
}

export function buildToolDecisionAuditMetadata(
  assistantMessageId: string,
  toolCall: AiChatToolCall,
  context: ToolAuditContext,
  source: 'human' | 'ai' | 'system',
  outcome: string,
  executed: boolean,
  message?: string,
  reason?: string,
  durationMs?: number,
): ToolDecisionAuditMetadata {
  return {
    schemaVersion: 1,
    phase: 'decision',
    requestId: toolCall.requestId ?? buildAiToolRequestId(toolCall),
    assistantMessageId,
    source,
    toolCall,
    context,
    executed,
    outcome,
    ...(message ? { message } : {}),
    ...(reason ? { reason } : {}),
    ...(durationMs !== undefined ? { durationMs } : {}),
  };
}

export function toNaturalToolCancelled(callName: AiChatToolName, style: AiToolFeedbackStyle): string {
  return formatToolCancelledMessage(toToolActionLabel(callName), style);
}

export function toNaturalNonActionFallback(userText: string): string {
  return formatNonActionFallback(userText);
}

export function toNaturalActionClarify(callName: AiChatToolName, style: AiToolFeedbackStyle): string {
  return formatActionClarify(toToolActionLabel(callName), style);
}

export function buildClarifyCandidates(
  callName: AiChatToolName,
  reason: ToolPlannerClarifyReason | undefined,
  context: AiPromptContext | null | undefined,
  sessionMemory?: AiSessionMemory,
): AiClarifyCandidate[] {
  const short = context?.shortTerm;
  const selectedUtteranceId = getFirstNonEmptyString(short?.selectedUtteranceId);
  const selectedLayerId = getFirstNonEmptyString(short?.selectedLayerId);
  const selectedLayerType = short?.selectedLayerType;
  const selectedTranslationLayerId = getFirstNonEmptyString(
    short?.selectedTranslationLayerId,
    selectedLayerType === 'translation' ? selectedLayerId : '',
  );
  const selectedTranscriptionLayerId = getFirstNonEmptyString(
    short?.selectedTranscriptionLayerId,
    selectedLayerType === 'transcription' ? selectedLayerId : '',
  );

  const candidates: AiClarifyCandidate[] = [];
  if (reason === 'missing-utterance-target' && selectedUtteranceId) {
    candidates.push({ key: '1', label: `当前选中句段（${selectedUtteranceId}）`, argsPatch: { utteranceId: selectedUtteranceId } });
  }
  if (reason === 'missing-layer-target' && selectedLayerId) {
    candidates.push({ key: '1', label: `当前选中层（${selectedLayerId}）`, argsPatch: { layerId: selectedLayerId } });
  }
  if (reason === 'missing-translation-layer-target' && selectedTranslationLayerId) {
    candidates.push({ key: '1', label: `当前选中翻译层（${selectedTranslationLayerId}）`, argsPatch: { layerId: selectedTranslationLayerId } });
  }
  if (reason === 'missing-layer-link-target' && selectedTranscriptionLayerId && selectedTranslationLayerId) {
    candidates.push({
      key: '1',
      label: `当前选中层对（${selectedTranscriptionLayerId} -> ${selectedTranslationLayerId}）`,
      argsPatch: { transcriptionLayerId: selectedTranscriptionLayerId, translationLayerId: selectedTranslationLayerId },
    });
  }
  if (reason === 'missing-language-target' && callName === 'create_transcription_layer') {
    const lastLang = sessionMemory?.lastLanguage;
    if (lastLang && lastLang !== 'zho' && lastLang !== 'eng') {
      candidates.push({ key: `${candidates.length}`, label: `上次使用（${lastLang}）`, argsPatch: { languageId: lastLang } });
    }
    candidates.push({ key: `${candidates.length}`, label: '创建中文转写层（zho）', argsPatch: { languageId: 'zho' } });
    candidates.push({ key: `${candidates.length}`, label: '创建英文转写层（eng）', argsPatch: { languageId: 'eng' } });
  }
  return candidates;
}

export function toNaturalTargetClarify(
  callName: AiChatToolName,
  reason: ToolPlannerClarifyReason | undefined,
  style: AiToolFeedbackStyle,
  candidates: AiClarifyCandidate[] = [],
): string {
  return formatTargetClarify(toToolActionLabel(callName), reason, style, candidates);
}

export function normalizeLegacyRiskNarration(content: string, style: AiToolFeedbackStyle): string {
  const legacyCall = parseLegacyNarratedToolCall(content);
  if (!legacyCall) return content;
  const normalizedName = legacyCall.name;
  if (!normalizedName) return content;
  return toNaturalActionClarify(normalizedName, style);
}

export function isAmbiguousTargetRiskSummary(summary: string): boolean {
  const normalized = summary.toLowerCase();
  return normalized.includes('匹配到多个')
    || normalized.includes('目标不唯一')
    || normalized.includes('multiple')
    || normalized.includes('ambiguous');
}

export function describeAndBuildPending(
  toolCall: AiChatToolCall,
): { riskSummary: string; impactPreview: string[]; previewContract: PreviewContract } {
  const impact = describeToolCallImpact(toolCall);
  return {
    riskSummary: impact.riskSummary,
    impactPreview: impact.impactPreview,
    previewContract: buildPreviewContract(toolCall),
  };
}
