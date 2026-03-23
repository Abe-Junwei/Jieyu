import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLatest } from './useLatest';
import { getDb, type AiMessageCitation } from '../../db';
import { extractPdfSnippet } from '../ai/embeddings/pdfTextUtils';
import { splitPdfCitationRef } from '../utils/citationJumpUtils';
import { RAG_CITATION_INSTRUCTION } from '../utils/citationFootnoteUtils';
import { ChatOrchestrator } from '../ai/ChatOrchestrator';
import type { EmbeddingSearchService } from '../ai/embeddings/EmbeddingSearchService';
import { featureFlags } from '../ai/config/featureFlags';
import { resolveCommand } from '../services/CommandResolver';
import type { VoiceActionToolName } from '../ai/voice/VoiceActionTools';
import { resolveLanguageQuery } from '../utils/langMapping';
import { normalizeAiProviderError } from '../ai/providers/errorUtils';
import { buildAiToolRequestId } from '../ai/toolRequestId';
import {
  formatAbortedMessage,
  formatActionClarify,
  formatAiChatDisabledError,
  formatConnectionHealthyMessage,
  formatConnectionProbeNoContentError,
  formatConnectionProbeSuccessMessage,
  formatDuplicateRequestIgnoredDetail,
  formatDuplicateRequestIgnoredError,
  formatEmptyModelReply,
  formatEmptyModelResponseError,
  formatFirstChunkTimeoutError,
  formatHistoryLoadFailedFallbackError,
  formatInlineCancelReply,
  formatInvalidArgsError,
  formatNoExecutorInternalError,
  formatNoExecutorToolFailureDetail,
  formatNonActionFallback,
  formatPendingConfirmationBlockedError,
  formatRecoveredInterruptedMessage,
  formatStreamingBusyError,
  formatTargetClarify,
  formatToolCancelledMessage,
  formatToolExecutionFallbackError,
  formatToolFailureMessage,
  formatToolGraySkippedMessage,
  formatToolPendingMessage,
  formatToolRollbackSkippedMessage,
  formatToolSuccessMessage,
} from '../ai/messages';
import {
  applyAiChatSettingsPatch,
  createAiChatProvider,
  getDefaultAiChatSettings,
  normalizeAiChatSettings,
} from '../ai/providers/providerCatalog';
import type { AiChatSettings, AiToolFeedbackStyle } from '../ai/providers/providerCatalog';
import type { ChatMessage } from '../ai/providers/LLMProvider';
export type {
  AiChatProviderKind,
  AiChatSettings,
} from '../ai/providers/providerCatalog';

export interface UiChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  status?: 'streaming' | 'done' | 'error' | 'aborted';
  error?: string;
  citations?: AiMessageCitation[];
  generationSource?: 'llm' | 'local';
  generationModel?: string;
  /** 推理内容（reasoning_content），如 DeepSeek 的思考过程 */
  reasoningContent?: string;
  /** 思考中状态：provider正在处理但尚未发出任何内容delta。
   * 用于非reasoning_content型provider（Anthropic/Gemini/Ollama）的UX反馈。
   * 有reasoningContent时不显示thinking状态。 */
  thinking?: boolean;
}

export type AiConnectionTestStatus = 'idle' | 'testing' | 'success' | 'error';
export type AiToolDecisionMode = 'enabled' | 'gray' | 'rollback';

export interface AiClarifyCandidate {
  key: string;
  label: string;
  argsPatch: Record<string, unknown>;
}

export interface AiTaskSession {
  id: string;
  status: 'idle' | 'waiting_clarify' | 'waiting_confirm' | 'executing' | 'explaining';
  toolName?: AiChatToolName;
  clarifyReason?: ToolPlannerClarifyReason;
  candidates?: AiClarifyCandidate[];
  updatedAt: string;
}

/**
 * 交互指标统计 | Interaction metrics counters
 * 供 UI 仪表盘和 CI 护栏消费。
 */
export interface AiInteractionMetrics {
  /** 用户发送总轮次 | Total user turns */
  turnCount: number;
  /** 执行成功次数 | Successful tool executions */
  successCount: number;
  /** 执行失败次数 | Failed tool executions */
  failureCount: number;
  /** 目标澄清次数 | Target clarification rounds */
  clarifyCount: number;
  /** 意图不明确而回退为解释的次数 | Intent ambiguous fallbacks */
  explainFallbackCount: number;
  /** 用户取消确认次数 | User-cancelled confirmations */
  cancelCount: number;
  /** 失败后恢复（重试成功）次数 | Recovery-after-failure count */
  recoveryCount: number;
}

const INITIAL_METRICS: AiInteractionMetrics = {
  turnCount: 0,
  successCount: 0,
  failureCount: 0,
  clarifyCount: 0,
  explainFallbackCount: 0,
  cancelCount: 0,
  recoveryCount: 0,
};

/**
 * 会话级短期偏好记忆 | Session-scoped short-term preference memory
 * 在一次对话中累积用户偏好，用于候选排序 & 默认值预填。
 */
export interface AiSessionMemory {
  /** 最近一次成功使用的语言代码 | Last language code used successfully */
  lastLanguage?: string;
  /** 最近一次执行的工具名 | Last tool name executed */
  lastToolName?: AiChatToolName;
  /** 最近一次选中的层 ID | Last layer ID selected */
  lastLayerId?: string;
}

type ToolPlannerClarifyReason =
  | 'missing-utterance-target'
  | 'missing-split-position'
  | 'missing-translation-layer-target'
  | 'missing-layer-link-target'
  | 'missing-layer-target'
  | 'missing-language-target';

interface ToolAuditContext {
  userText: string;
  providerId: string;
  model: string;
  toolDecisionMode: AiToolDecisionMode;
  toolFeedbackStyle: AiToolFeedbackStyle;
  plannerDecision?: ToolPlannerDecision;
  plannerReason?: ToolPlannerClarifyReason;
  intentAssessment?: ToolIntentAssessment;
}

interface ToolIntentAuditMetadata {
  schemaVersion: 1;
  phase: 'intent';
  requestId: string;
  assistantMessageId: string;
  toolCall: AiChatToolCall;
  context: ToolAuditContext;
}

interface ToolDecisionAuditMetadata {
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
  /** 工具执行耗时（ms），仅在 executed=true 时有值 | Tool execution duration, only when executed=true */
  durationMs?: number;
}

export type AiChatToolName =
  | 'create_transcription_segment'
  | 'split_transcription_segment'
  | 'delete_transcription_segment'
  | 'clear_translation_segment'
  | 'set_transcription_text'
  | 'set_translation_text'
  | 'create_transcription_layer'
  | 'create_translation_layer'
  | 'delete_layer'
  | 'link_translation_layer'
  | 'unlink_translation_layer'
  | 'auto_gloss_utterance'
  | 'set_token_pos'
  | 'set_token_gloss'
  | VoiceActionToolName;

/**
 * 工具调用结构，支持幂等性指纹 | Tool call structure with idempotency fingerprint
 */
export interface AiChatToolCall {
  name: AiChatToolName;
  arguments: Record<string, unknown>;
  /** 幂等性指纹，自动生成 | Idempotency fingerprint, auto-generated */
  requestId?: string;
}

export interface AiChatToolResult {
  ok: boolean;
  message: string;
}

/**
 * 待确认高风险工具调用，带幂等指纹 | Pending high-risk tool call with idempotency fingerprint
 */
export interface PendingAiToolCall {
  call: AiChatToolCall;
  assistantMessageId: string;
  riskSummary?: string;
  impactPreview?: string[];
  /** 结构化预演合同 | Structured preview of affected entities */
  previewContract?: PreviewContract;
  /** 幂等性指纹，便于回放/去重 | Idempotency fingerprint for replay/dedup */
  requestId?: string;
  auditContext?: ToolAuditContext;
}

/**
 * 执行预演合同 | Execution preview contract
 * 为高风险操作提供受影响实体的结构化描述，供 UI 展示预览。
 */
export interface PreviewContract {
  /** 受影响实体数量 | Number of entities that will be affected */
  affectedCount: number;
  /** 受影响实体 ID 列表（截取前 5 条）| Affected entity IDs (first 5) */
  affectedIds: string[];
  /** 操作是否可撤销 | Whether the operation is reversible */
  reversible: boolean;
  /** 级联影响的其他实体类型 | Other entity types affected by cascading */
  cascadeTypes?: string[];
}

export interface AiToolRiskCheckResult {
  requiresConfirmation: boolean;
  riskSummary?: string;
  impactPreview?: string[];
}

interface UseAiChatOptions {
  onToolCall?: (call: AiChatToolCall) => Promise<AiChatToolResult> | AiChatToolResult;
  onToolRiskCheck?: (call: AiChatToolCall) => Promise<AiToolRiskCheckResult | null | undefined> | AiToolRiskCheckResult | null | undefined;
  /** Called when an assistant message completes streaming (after all content is received). */
  onMessageComplete?: (assistantMessageId: string, content: string) => void;
  systemPersonaKey?: AiSystemPersonaKey;
  getContext?: () => AiPromptContext | null;
  maxContextChars?: number;
  historyCharBudget?: number;
  allowDestructiveToolCalls?: boolean;
  streamPersistIntervalMs?: number;
  firstChunkTimeoutMs?: number;
  autoProbeIntervalMs?: number;
  embeddingSearchService?: EmbeddingSearchService;
}

function normalizeStreamPersistInterval(input: number | undefined): number {
  if (!Number.isFinite(input)) return 120;
  return Math.min(1000, Math.max(16, Math.floor(input ?? 120)));
}

const DEFAULT_FIRST_CHUNK_TIMEOUT_MS = 25000;

function readDevStreamPersistIntervalMs(): number | undefined {
  if (typeof window === 'undefined') return undefined;
  if (!import.meta.env.DEV) return undefined;

  const globalValue = (window as unknown as { __JIEYU_AI_STREAM_PERSIST_MS__?: unknown }).__JIEYU_AI_STREAM_PERSIST_MS__;
  if (typeof globalValue === 'number' && Number.isFinite(globalValue)) {
    return globalValue;
  }

  const fromStorage = window.localStorage.getItem(AI_CHAT_STREAM_PERSIST_INTERVAL_STORAGE_KEY);
  if (!fromStorage) return undefined;
  const parsed = Number(fromStorage);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeFirstChunkTimeoutMs(input: number | undefined): number {
  if (!Number.isFinite(input)) return DEFAULT_FIRST_CHUNK_TIMEOUT_MS;
  return Math.min(120000, Math.max(1000, Math.floor(input ?? DEFAULT_FIRST_CHUNK_TIMEOUT_MS)));
}

function normalizeAutoProbeIntervalMs(input: number | undefined): number {
  if (!Number.isFinite(input)) return 8000;
  return Math.min(60000, Math.max(3000, Math.floor(input ?? 8000)));
}

function normalizeRagContextTimeoutMs(input: number | undefined): number {
  if (!Number.isFinite(input)) return 1800;
  return Math.min(10000, Math.max(300, Math.floor(input ?? 1800)));
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function readDevAutoProbeIntervalMs(): number | undefined {
  if (typeof window === 'undefined') return undefined;
  if (!import.meta.env.DEV) return undefined;

  const globalValue = (window as unknown as { __JIEYU_AI_AUTO_PROBE_MS__?: unknown }).__JIEYU_AI_AUTO_PROBE_MS__;
  if (typeof globalValue === 'number' && Number.isFinite(globalValue)) {
    return globalValue;
  }

  const fromStorage = window.localStorage.getItem(AI_CHAT_AUTO_PROBE_INTERVAL_STORAGE_KEY);
  if (!fromStorage) return undefined;
  const parsed = Number(fromStorage);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function readDevRagContextTimeoutMs(): number | undefined {
  if (typeof window === 'undefined') return undefined;
  if (!import.meta.env.DEV) return undefined;

  const globalValue = (window as unknown as { __JIEYU_AI_RAG_TIMEOUT_MS__?: unknown }).__JIEYU_AI_RAG_TIMEOUT_MS__;
  if (typeof globalValue === 'number' && Number.isFinite(globalValue)) {
    return globalValue;
  }

  const fromStorage = window.localStorage.getItem(AI_CHAT_RAG_CONTEXT_TIMEOUT_STORAGE_KEY);
  if (!fromStorage) return undefined;
  const parsed = Number(fromStorage);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export type AiSystemPersonaKey = 'transcription' | 'glossing' | 'review';

export interface AiShortTermContext {
  page?: string;
  selectedUtteranceId?: string;
  selectedUtteranceStartSec?: number;
  selectedUtteranceEndSec?: number;
  selectedLayerId?: string;
  selectedLayerType?: 'transcription' | 'translation';
  selectedTranslationLayerId?: string;
  selectedTranscriptionLayerId?: string;
  selectedText?: string;
  selectionTimeRange?: string;
  audioTimeSec?: number;
  recentEdits?: string[];
}

export interface AiLongTermContext {
  projectStats?: {
    utteranceCount?: number;
    translationLayerCount?: number;
    aiConfidenceAvg?: number | null;
  };
  observerStage?: string;
  topLexemes?: string[];
  recommendations?: string[];
}

export interface AiPromptContext {
  shortTerm?: AiShortTermContext;
  longTerm?: AiLongTermContext;
}

export interface AiContextDebugSnapshot {
  enabled: boolean;
  persona: AiSystemPersonaKey;
  historyChars: number;
  historyCount: number;
  contextChars: number;
  historyCharBudget: number;
  maxContextChars: number;
  contextPreview: string;
}

const AI_CHAT_SETTINGS_STORAGE_KEY = 'jieyu.aiChat.settings';
const AI_CHAT_SETTINGS_SECURE_STORAGE_KEY = 'jieyu.aiChat.settings.secure';
const AI_CHAT_SETTINGS_SECURE_VERSION = 'v1';
const AI_CHAT_STREAM_PERSIST_INTERVAL_STORAGE_KEY = 'jieyu.aiChat.streamPersistIntervalMs';
const AI_CHAT_AUTO_PROBE_INTERVAL_STORAGE_KEY = 'jieyu.aiChat.autoProbeIntervalMs';
const AI_CHAT_RAG_CONTEXT_TIMEOUT_STORAGE_KEY = 'jieyu.aiChat.ragContextTimeoutMs';
const AI_SESSION_MEMORY_STORAGE_KEY = 'jieyu.aiChat.sessionMemory';

function loadSessionMemory(): AiSessionMemory {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(AI_SESSION_MEMORY_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as AiSessionMemory;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed;
  } catch { return {}; }
}

function persistSessionMemory(mem: AiSessionMemory): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(AI_SESSION_MEMORY_STORAGE_KEY, JSON.stringify(mem)); } catch { /* ignore */ }
}

interface AiChatSecureEnvelopeV1 {
  v: 'v1';
  salt: string;
  iv: string;
  cipher: string;
}

const AI_FUNCTION_CALLING_SYSTEM_PROMPT = [
  '你是语音标注工作流助手。',
  '当用户要求执行操作（如创建句段、写入转写、写入翻译）时，必须只返回 JSON。',
  '当用户只是问候、闲聊、提问、解释或总结时，严禁返回 tool_call JSON，必须返回自然语言。',
  'JSON 格式：{"tool_call":{"name":"<tool_name>","arguments":{...}}}',
  '可用 tool_name 及语义（严格区分，勿混用）：',
  '  句段操作（segment = 一条带时间区间的转写单元，无语言归属）：',
  '    create_transcription_segment — 在目标句段后插入新的时间区间（新建句段），且必须提供 utteranceId',
  '    split_transcription_segment  — 切分目标句段；必须提供 utteranceId，可选 splitTime（秒，位于句段内部）',
  '    delete_transcription_segment — ⚠️ 删除当前这一条句段（时间区间 + 文本全部移除，可通过撤销恢复）',
  '    clear_translation_segment    — 仅清空指定句段在某翻译层上的翻译文本（句段本身保留，仅内容变为空）',
  '  文本操作：',
  '    set_transcription_text — 写入/覆盖转写文本，需要 text，且必须提供 utteranceId',
  '    set_translation_text   — 写入/覆盖翻译文本，需要 text，且必须提供 utteranceId、layerId',
  '  层操作（layer = 整条转写层或翻译层，通常有语言归属，如"日语转写层"）：',
  '    create_transcription_layer — 新建转写层，需要 languageId（ISO 639-3 三字母代码如 eng/jpn/cmn，也接受中英文名如英语/English），可选 alias',
  '    create_translation_layer   — 新建翻译层，需要 languageId（同上格式），可选 alias、modality(text/audio/mixed)',
  '    delete_layer               — ⚠️ 删除整个转写层或翻译层（可通过撤销恢复），且必须提供 layerId',
  '    link_translation_layer     — 关联转写层与翻译层，必须提供 transcriptionLayerId/transcriptionLayerKey 与 translationLayerId/layerId',
  '    unlink_translation_layer   — 解除关联，必须提供 transcriptionLayerId/transcriptionLayerKey 与 translationLayerId/layerId',
  '  自动标注（gloss = 从词库精确匹配自动推导词义注释）：',
  '    auto_gloss_utterance       — 对目标句段的所有 token 执行词库精确匹配并自动填写 gloss，且必须提供 utteranceId',
  '  词（token）操作：',
  '    set_token_pos              — 设置词性标签；精确模式需要 tokenId + pos，批量模式需要 utteranceId + form + pos（将同一句段内所有匹配 form 的 token 统一标注）',
  '    set_token_gloss            — 设置/覆盖单个 token 的 gloss；需要 tokenId + gloss（字符串），可选 lang（ISO 639-3，默认 eng）。若需批量标注请用 auto_gloss_utterance',
  '【命名规则】clear = 清空内容；delete = 删除实体；segment = 句段（单条）；layer = 整层（含所有句段）。',
  '【参数约束】执行写入/清空/删除/切分/自动标注/层链接动作时，必须显式提供目标 id（utteranceId/layerId/transcriptionLayerId 等），不要省略。',
  '【关键判断】用户说"删除××语转写行/转写层/翻译层" → 有语言限定词 → 指向整层 → delete_layer。',
  '【关键判断】用户说"删除这条/这个句段/这一行" → 无语言限定词 → 指向单条句段 → delete_transcription_segment。',
  '如果用户不是在请求执行动作，则正常自然语言回复。',
].join('\n');

const AI_SYSTEM_PERSONAS: Record<AiSystemPersonaKey, string> = {
  transcription: [
    '你当前扮演语音学与转写助手。',
    '优先关注时间对齐、分段边界、转写准确性与可听辨性。',
  ].join('\n'),
  glossing: [
    '你当前扮演形态学与语义标注助手。',
    '优先关注 gloss 一致性、词素切分、术语规范与跨句一致性。',
  ].join('\n'),
  review: [
    '你当前扮演质量审校助手。',
    '优先识别风险项、低置信度片段、层关联冲突和可追溯性问题。',
  ].join('\n'),
};

function trimTextToMax(input: string, maxChars: number): string {
  if (input.length <= maxChars) return input;
  if (maxChars <= 3) return input.slice(0, maxChars);
  return `${input.slice(0, maxChars - 3)}...`;
}

/**
 * 压缩单条消息内容（截取首尾，保留关键信息）
 * Compress a single message content: keep head+tail, preserve tool call names.
 */
function compressMessageContent(content: string, maxLen: number): string {
  if (content.length <= maxLen) return content;
  // 保留工具调用 JSON 的名称 | Preserve tool call name if present
  const toolMatch = content.match(/"name"\s*:\s*"([^"]+)"/);
  if (toolMatch) {
    return `[tool: ${toolMatch[1]}] ${content.slice(0, Math.max(40, maxLen - 30))}...`;
  }
  const half = Math.floor(maxLen / 2);
  return `${content.slice(0, half)}…${content.slice(-Math.max(20, maxLen - half - 1))}`;
}

/**
 * 结构化历史截断 | Structured history trimming
 *
 * 策略：最近 recentRounds 轮完整保留，更早的消息压缩为摘要行。
 * 效果：保持最近上下文完整性，同时在预算内尽可能多保留早期轮次要点。
 *
 * Strategy: keep the most recent `recentRounds` turns intact, compress older
 * messages into summary lines. This preserves recent context fidelity while
 * fitting more early-round key facts within budget.
 */
function trimHistoryByChars(
  history: ChatMessage[],
  maxChars: number,
  recentRounds = 3,
): ChatMessage[] {
  if (maxChars <= 0) return [];
  if (history.length === 0) return [];

  // 1. 分离最近 N 轮与早期消息 | Separate recent N rounds from older messages
  // 一轮 = user + assistant 一对 | One round = user + assistant pair
  let recentStartIndex = history.length;
  let roundsSeen = 0;
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i]!.role === 'user') {
      roundsSeen += 1;
      if (roundsSeen > recentRounds) break;
      recentStartIndex = i;
    }
  }

  const recentMessages = history.slice(recentStartIndex);
  const olderMessages = history.slice(0, recentStartIndex);

  // 2. 计算最近消息字符数 | Calculate recent messages char count
  let recentChars = 0;
  for (const msg of recentMessages) {
    recentChars += msg.content.length;
  }

  // 若最近消息已超预算，回退到简单截断 | Fallback to simple truncation if recent alone exceeds budget
  if (recentChars >= maxChars) {
    const kept: ChatMessage[] = [];
    let usedChars = 0;
    for (let i = history.length - 1; i >= 0; i -= 1) {
      const msg = history[i]!;
      const messageChars = msg.content.length;
      if (messageChars > maxChars && kept.length === 0) {
        kept.push({ ...msg, content: trimTextToMax(msg.content, maxChars) });
        break;
      }
      if (usedChars + messageChars > maxChars) break;
      kept.push(msg);
      usedChars += messageChars;
    }
    return kept.reverse();
  }

  // 3. 用剩余预算压缩早期消息 | Compress older messages within remaining budget
  const remainingBudget = maxChars - recentChars;
  const compressed: ChatMessage[] = [];
  // 每条早期消息的压缩上限 | Per-message compression limit
  const perMsgLimit = olderMessages.length > 0 ? Math.max(60, Math.floor(remainingBudget / olderMessages.length)) : 0;
  let usedOlder = 0;

  for (const msg of olderMessages) {
    const content = compressMessageContent(msg.content, perMsgLimit);
    if (usedOlder + content.length > remainingBudget) break;
    compressed.push({ ...msg, content });
    usedOlder += content.length;
  }

  return [...compressed, ...recentMessages];
}

function buildPromptContextBlock(context: AiPromptContext | null | undefined, maxChars: number): string {
  if (!context) return '';

  const shortLines: string[] = [];
  const longLines: string[] = [];
  const short = context.shortTerm;
  const long = context.longTerm;

  if (short?.page) shortLines.push(`page=${short.page}`);
  if (short?.selectedUtteranceId) shortLines.push(`selectedUtteranceId=${short.selectedUtteranceId}`);
  if (typeof short?.selectedUtteranceStartSec === 'number') shortLines.push(`selectedUtteranceStartSec=${short.selectedUtteranceStartSec.toFixed(2)}`);
  if (typeof short?.selectedUtteranceEndSec === 'number') shortLines.push(`selectedUtteranceEndSec=${short.selectedUtteranceEndSec.toFixed(2)}`);
  if (short?.selectedLayerId) shortLines.push(`selectedLayerId=${short.selectedLayerId}`);
  if (short?.selectedLayerType) shortLines.push(`selectedLayerType=${short.selectedLayerType}`);
  if (short?.selectedTranslationLayerId) shortLines.push(`selectedTranslationLayerId=${short.selectedTranslationLayerId}`);
  if (short?.selectedTranscriptionLayerId) shortLines.push(`selectedTranscriptionLayerId=${short.selectedTranscriptionLayerId}`);
  if (short?.selectionTimeRange) shortLines.push(`selectionTimeRange=${short.selectionTimeRange}`);
  if (typeof short?.audioTimeSec === 'number') shortLines.push(`audioTimeSec=${short.audioTimeSec.toFixed(2)}`);
  if (short?.selectedText) shortLines.push(`selectedText=${short.selectedText}`);
  if (short?.recentEdits?.length) shortLines.push(`recentEdits=${short.recentEdits.join(' | ')}`);

  if (long?.projectStats) {
    const stats = long.projectStats;
    longLines.push(
      `projectStats(utterances=${stats.utteranceCount ?? 0}, translationLayers=${stats.translationLayerCount ?? 0}, aiConfidenceAvg=${typeof stats.aiConfidenceAvg === 'number' ? stats.aiConfidenceAvg.toFixed(3) : 'n/a'})`,
    );
  }
  if (long?.observerStage) longLines.push(`observerStage=${long.observerStage}`);
  if (long?.topLexemes?.length) longLines.push(`topLexemes=${long.topLexemes.join(', ')}`);
  if (long?.recommendations?.length) longLines.push(`recommendations=${long.recommendations.join(' | ')}`);

  if (shortLines.length === 0 && longLines.length === 0) return '';

  const render = (shortPart: string[], longPart: string[]): string => {
    const blocks: string[] = ['[CONTEXT]'];
    if (shortPart.length > 0) {
      blocks.push('ShortTerm:');
      blocks.push(...shortPart.map((line) => `- ${line}`));
    }
    if (longPart.length > 0) {
      blocks.push('LongTerm:');
      blocks.push(...longPart.map((line) => `- ${line}`));
    }
    return blocks.join('\n');
  };

  let shortPart = [...shortLines];
  let longPart = [...longLines];
  let rendered = render(shortPart, longPart);
  if (rendered.length <= maxChars) return rendered;

  while (rendered.length > maxChars && longPart.length > 0) {
    longPart = longPart.slice(0, -1);
    rendered = render(shortPart, longPart);
  }
  while (rendered.length > maxChars && shortPart.length > 0) {
    shortPart = shortPart.slice(0, -1);
    rendered = render(shortPart, longPart);
  }

  return trimTextToMax(rendered, maxChars);
}

function buildAiSystemPrompt(personaKey: AiSystemPersonaKey, contextBlock: string): string {
  const base = `${AI_FUNCTION_CALLING_SYSTEM_PROMPT}\n${AI_SYSTEM_PERSONAS[personaKey]}`;
  return contextBlock.trim().length > 0 ? `${base}\n${contextBlock}` : base;
}

function isAiContextDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  if (!import.meta.env.DEV) return false;
  const byStorage = window.localStorage.getItem('jieyu.aiChat.debugContext') === '1';
  const byGlobal = (window as unknown as { __JIEYU_AI_DEBUG_CONTEXT__?: boolean }).__JIEYU_AI_DEBUG_CONTEXT__ === true;
  return byStorage || byGlobal;
}

function normalizeToolCallName(rawName: string): AiChatToolName | null {
  const name = rawName.trim().toLowerCase();
  if (!name) return null;

  // 句段操作（新名）
  if (name === 'create_transcription_segment') return name;
  if (name === 'split_transcription_segment') return name;
  if (name === 'delete_transcription_segment') return name;
  if (name === 'clear_translation_segment') return name;
  // 旧名/别名向后兼容 → 映射到新名
  if (['split_segment', 'split_transcription_row', 'split_row', 'split_utterance', 'cut_segment', 'split_current_segment'].includes(name)) return 'split_transcription_segment';
  if (['create_transcription_row', 'create_segment', 'new_segment', 'add_segment', 'new_transcription_row', 'add_transcription_row'].includes(name)) return 'create_transcription_segment';
  if (['delete_transcription_row', 'remove_transcription_row', 'remove_utterance', 'delete_utterance', 'remove_row', 'delete_row', 'delete_segment', 'remove_segment'].includes(name)) return 'delete_transcription_segment';
  // 清空类别名 → clear_translation_segment
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

function byteArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64ToByteArray(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function byteArrayToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const { buffer, byteOffset, byteLength } = bytes;
  return buffer.slice(byteOffset, byteOffset + byteLength) as ArrayBuffer;
}

async function deriveAiSettingsCryptoKey(salt: Uint8Array): Promise<CryptoKey> {
  const passphrase = `${window.location.origin}|jieyu.aiChat.settings`;
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: byteArrayToArrayBuffer(salt),
      // v1: 120k iterations (OWASP 2023 minimum for SHA-256).
      // Bump iteration count → increment AI_CHAT_SETTINGS_SECURE_VERSION to trigger re-encryption.
      iterations: 120_000,
      hash: 'SHA-256',
    },
    keyMaterial,
    {
      name: 'AES-GCM',
      length: 256,
    },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function encryptAiChatSettings(rawSettings: AiChatSettings): Promise<string> {
  const payload = JSON.stringify(rawSettings);
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAiSettingsCryptoKey(salt);
  const encrypted = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(payload),
  );

  const envelope: AiChatSecureEnvelopeV1 = {
    v: AI_CHAT_SETTINGS_SECURE_VERSION,
    salt: byteArrayToBase64(salt),
    iv: byteArrayToBase64(iv),
    cipher: byteArrayToBase64(new Uint8Array(encrypted)),
  };

  return JSON.stringify(envelope);
}

async function decryptAiChatSettings(rawSecurePayload: string): Promise<AiChatSettings | null> {
  try {
    const parsed = JSON.parse(rawSecurePayload) as Partial<AiChatSecureEnvelopeV1>;
    if (parsed.v !== AI_CHAT_SETTINGS_SECURE_VERSION || !parsed.salt || !parsed.iv || !parsed.cipher) {
      return null;
    }

    const salt = base64ToByteArray(parsed.salt);
    const iv = base64ToByteArray(parsed.iv);
    const cipher = base64ToByteArray(parsed.cipher);
    const key = await deriveAiSettingsCryptoKey(salt);
    const decrypted = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: byteArrayToArrayBuffer(iv) },
      key,
      byteArrayToArrayBuffer(cipher),
    );
    const text = new TextDecoder().decode(decrypted);
    return normalizeAiChatSettings(JSON.parse(text) as Partial<AiChatSettings>);
  } catch {
    return null;
  }
}

async function persistAiChatSettingsSecure(settings: AiChatSettings): Promise<void> {
  if (typeof window === 'undefined') return;
  const canUseCrypto = !!window.crypto?.subtle;
  if (!canUseCrypto) {
    window.localStorage.setItem(AI_CHAT_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    return;
  }

  const encryptedPayload = await encryptAiChatSettings(settings);
  window.localStorage.setItem(AI_CHAT_SETTINGS_SECURE_STORAGE_KEY, encryptedPayload);
  window.localStorage.removeItem(AI_CHAT_SETTINGS_STORAGE_KEY);
}

async function loadAiChatSettings(): Promise<AiChatSettings> {
  if (typeof window === 'undefined') return normalizeAiChatSettings();

  try {
    const secureRaw = window.localStorage.getItem(AI_CHAT_SETTINGS_SECURE_STORAGE_KEY);
    if (secureRaw && window.crypto?.subtle) {
      const decrypted = await decryptAiChatSettings(secureRaw);
      if (decrypted) {
        return decrypted;
      }
    }

    const legacyRaw = window.localStorage.getItem(AI_CHAT_SETTINGS_STORAGE_KEY);
    if (legacyRaw) {
      const normalized = normalizeAiChatSettings(JSON.parse(legacyRaw) as Partial<AiChatSettings>);
      try {
        await persistAiChatSettingsSecure(normalized);
      } catch {
        // Keep legacy fallback when secure write is unavailable.
      }
      return normalized;
    }
  } catch (error) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn('[AI Settings] Failed to load saved settings, falling back to defaults:', error);
    }
  }

  return normalizeAiChatSettings();
}

function newMessageId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function newAuditLogId(): string {
  return `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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

function parseToolCallFromText(rawText: string): AiChatToolCall | null {
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
      // Ignore non-JSON assistant content.
    }
  }

  return null;
}

function parseLegacyNarratedToolCall(text: string): AiChatToolCall | null {
  // B-20 fix: support multiple language patterns for legacy narration detection
  const patterns = [
    // Chinese: 我识别到你想执行”toolName”
    /我识别到你想执行[“\”]([^”\”]+)[“\”]/,
    // English: I think you want to run “toolName”
    /I think you want to (?:run|use|execute) [“\']([^”\']+)[“\']/i,
    // Generic fallback: you want to “toolName”
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

type ToolPlannerDecision = 'resolved' | 'clarify';

interface ToolPlannerResult {
  decision: ToolPlannerDecision;
  call: AiChatToolCall;
  reason?: ToolPlannerClarifyReason;
}

// 语言目标歧义值（应先澄清）| Ambiguous language targets that must trigger clarification.
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

// ── 参数校验辅助函数（供策略矩阵各条目引用）| Arg validation helpers used by the strategy table ──
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
  // languageId 或 languageQuery 至少有一个非空即可（执行层会统一规范化）
  // Either languageId or languageQuery must be non-empty (execution layer normalizes)
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

// ── 工具策略矩阵 | Tool strategy matrix ─────────────────────────────────────
// 每条记录集中描述一个工具的：上下文填充规则、参数校验、破坏性标志与风险描述。
// 新增工具时只需在此处追加一条记录，无需修改 planToolCallTargets / validate / isDestructive 等主流程函数。
// Each entry centralizes a tool's context-fill rules, arg validation, destructiveness, and risk spec.
// Adding a new tool only requires appending one record — no changes to main-flow functions needed.
interface ToolContextFillSpec {
  /** 从 selectedUtteranceId 填入 utteranceId；仍缺则澄清 | Fill utteranceId from context; clarify if still missing */
  utteranceId?: boolean;
  /** 从 selectedTranslationLayerId 填入 layerId；仍缺则澄清 | Fill layerId from context; clarify if still missing */
  translationLayerId?: boolean;
  /** 同时填入 transcriptionLayerId 与 translationLayerId；任意缺失则澄清 | Fill both layer IDs; clarify if either is missing */
  linkBothLayers?: boolean;
  /** delete_layer 专用文本推断 | Special text-inference pass for delete_layer */
  layerTargetInference?: boolean;
}

interface ToolStrategy {
  /** 供 UI 显示的中文操作标签 | Human-readable Chinese action label for UI */
  label: string;
  /** 上下文填充规则 | Context auto-fill rules for the planner */
  contextFill?: ToolContextFillSpec;
  /** 该工具是否需要用户确认（破坏性操作）| Whether this tool requires user confirmation */
  destructive?: boolean;
  /** 参数校验函数；返回错误消息字符串或 null | Argument validator; returns error string or null */
  validateArgs?: (args: Record<string, unknown>) => string | null;
  /** 破坏性工具的风险描述 | Risk summary and impact preview for destructive tools */
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
        // 优先用人类可读描述（如"中文转写层"），其次用 layerId
        // Prefer human-readable description (e.g. "中文转写层"), fallback to layerId
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
  // ── VoiceActionTools ──────────────────────────────────────────────────────
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

function planToolCallTargets(
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
      // 幻觉检测：LLM 提供的 utteranceId 必须与当前选中句段一致
      // Hallucination guard: LLM-provided utteranceId must match context selection
      if (currentUtteranceId && existing !== currentUtteranceId) {
        // LLM 给的 ID 与上下文不匹配 → 用上下文的真实 ID
        // Mismatch → prefer the real context ID
        nextCall.arguments.utteranceId = currentUtteranceId;
        return currentUtteranceId;
      }
      // 上下文无选中句段时，无法验证 LLM 给的 ID 是否真实存在
      // → 接受但记录警告；如为幻觉 ID 将在执行层失败（安全）
      // No selection: accept LLM's ID; if fabricated it will fail at execution time (safe)
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

  // 创建层时必须有明确语言信息，避免误创建 und 层
  // Creating layers requires a concrete language (languageId or languageQuery) to avoid accidental "und" layers.
  if (requiresConcreteLanguageTarget(call.name)) {
    if (isAmbiguousLanguageTarget(nextCall.arguments.languageId) && isAmbiguousLanguageTarget(nextCall.arguments.languageQuery)) {
      return { decision: 'clarify', call: nextCall, reason: 'missing-language-target' };
    }
  }

  // utteranceId 填充与澄清 | Fill utteranceId from context; clarify if still missing
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

  // translationLayerId 填充与澄清 | Fill translation layerId from context; clarify if still missing
  if (cf?.translationLayerId) {
    const layerId = getFirstNonEmptyString(nextCall.arguments.layerId);
    if (layerId) {
      // 幻觉检测：LLM 的 layerId 必须匹配当前选中翻译层
      // Hallucination guard: LLM layerId must match context translation layer
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

  // link/unlink 层对目标填充与澄清 | Fill both layer IDs for link ops; clarify if either is missing
  if (cf?.linkBothLayers) {
    let transcriptionLayerId = getFirstNonEmptyString(nextCall.arguments.transcriptionLayerId);
    const transcriptionLayerKey = getFirstNonEmptyString(nextCall.arguments.transcriptionLayerKey);
    const refersCurrentLayerPair = /(当前|这层|该层|本层|当前层)/i.test(userText);

    // 幻觉检测：LLM 的 transcriptionLayerId 必须匹配上下文
    // Hallucination guard: verify transcriptionLayerId against context
    if (transcriptionLayerId && selectedTranscriptionLayerId && transcriptionLayerId !== selectedTranscriptionLayerId) {
      nextCall.arguments.transcriptionLayerId = selectedTranscriptionLayerId;
      transcriptionLayerId = selectedTranscriptionLayerId;
    }
    if (!transcriptionLayerId && !transcriptionLayerKey && selectedTranscriptionLayerId && refersCurrentLayerPair) {
      nextCall.arguments.transcriptionLayerId = selectedTranscriptionLayerId;
    }

    let translationLayerId = getFirstNonEmptyString(nextCall.arguments.translationLayerId, nextCall.arguments.layerId);
    // 幻觉检测：LLM 的 translationLayerId 必须匹配上下文
    // Hallucination guard: verify translationLayerId against context
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

  // delete_layer 专用文本推断 | Special text-inference pass for delete_layer
  if (cf?.layerTargetInference) {
    let layerId = getFirstNonEmptyString(nextCall.arguments.layerId);

    // 幻觉检测：LLM 可能捏造看似合理但不存在的 layerId（如 transcription_layer_1）。
    // 只信任来自上下文的已知 ID，否则丢弃并走文本推断。
    // Hallucination guard: LLM may fabricate plausible-looking layerIds.
    // Only trust IDs that match a known context layer; otherwise discard and fall through to text inference.
    if (layerId) {
      const knownIds = [selectedLayerId, selectedTranscriptionLayerId, selectedTranslationLayerId].filter(Boolean);
      if (!knownIds.includes(layerId)) {
        // layerId 不在当前上下文中 → 视为幻觉，清除 | Not in context → treat as hallucinated, clear
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

      // 用户说"删除转写层/翻译层"且上下文有对应类型的选中层 → 直接使用
      // 但如果用户指定了具体语言（languageQuery），则不自动填充 layerId，
      // 交由执行层按 layerType + languageQuery 精确匹配，避免误删不相关的层。
      // User says "delete transcription/translation layer" and context has matching selected layer → use it
      // But if user specified a concrete language (languageQuery), skip auto-fill layerId —
      // let the execution layer match by layerType + languageQuery to avoid deleting the wrong layer.
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

type ToolIntentDecision = 'execute' | 'clarify' | 'ignore' | 'cancel';

interface ToolIntentAssessment {
  decision: ToolIntentDecision;
  score: number;
  hasExecutionCue: boolean;
  hasActionVerb: boolean;
  hasActionTarget: boolean;
  hasExplicitId: boolean;
  hasMetaQuestion: boolean;
  hasTechnicalDiscussion: boolean;
}

interface ToolIntentAssessmentOptions {
  allowDeicticExecution?: boolean;
}

function isDeicticConfirmationMessage(userText: string): boolean {
  const normalized = userText.trim();
  return /^(这个|这个吧|就这个|它|它吧|就它|这条|该条|这一条|这个句段|该句段|这个字段|该字段|这里|此处|在这里|在此处|就这里|就此处)$/i.test(normalized);
}

/**
 * 从澄清回复中提取语言属性 → argsPatch | Extract language attribute from clarify reply
 * 例："日语的" → { languageId: 'jpn', languageQuery: '日语' }
 */
function extractClarifyLanguagePatch(userText: string): Record<string, string> | null {
  const trimmed = userText.trim().replace(/[的那个吧]$/g, '').trim();
  if (!trimmed || trimmed.length > 20) return null;
  const resolved = resolveLanguageQuery(trimmed);
  if (!resolved) return null;
  return { languageId: resolved, languageQuery: trimmed };
}

function extractClarifySplitPositionPatch(
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

function shouldAllowDeicticExecutionIntent(
  userText: string,
  callName: AiChatToolName,
  context: AiPromptContext | null | undefined,
  messages: UiChatMessage[],
): boolean {
  if (!isDeicticConfirmationMessage(userText)) return false;
  const hasResolvableTarget = hasResolvableSelectionTargetForTool(callName, context);
  if (!hasResolvableTarget) return false;
  // 兼容“澄清后确认”与“已选中直接确认”两种流 | Support both post-clarify confirmation and direct confirmation with active selection.
  return wasRecentAssistantClarification(messages) || hasResolvableTarget;
}

function assessToolActionIntent(userText: string, options?: ToolIntentAssessmentOptions): ToolIntentAssessment {
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

  // 测试指令仅在测试环境可用，生产环境禁用 | Test escape hatch is test-only and disabled in production.
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

  // ── Cancel intent: 用户放弃操作 | User wants to abort the pending action ──
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

  // ── Positive signals (action intent) ───────────────────────────────────
  // "当前" / "此" 明确指向当前选中对象，是强执行信号 | "current" / "this" are strong execution cues pointing to the selected item.
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

  // ── Negative signals (chat/meta intent) ────────────────────────────────
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

  // 元问题优先判定为非执行意图，避免“解释请求”误触发执行 | Meta questions should not trigger execution.
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

  // 需要至少有动作动词 + 目标对象，且总分达到阈值，才执行工具 | Require both verb+target and threshold.
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

  // 澄清后“这个/它”可作为确认执行信号（需可解析目标）| After clarification, deictic reply can confirm execution when target is resolvable.
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

  // 有动作信号但不足以执行时进入澄清，减少误触发 | Ask clarification when signals are mixed/weak.
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

function isDestructiveToolCall(name: AiChatToolName): boolean {
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

/**
 * 构建执行预演合同 | Build structured preview contract for a destructive tool call
 */
function buildPreviewContract(call: AiChatToolCall): PreviewContract {
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
  // 默认合同 | Default contract for other destructive ops
  return {
    affectedCount: 1,
    affectedIds: [],
    reversible: false,
  };
}

function validateToolCallArguments(call: AiChatToolCall): string | null {
  const spec = TOOL_STRATEGY_TABLE[call.name];
  if (!spec?.validateArgs) return null;
  return spec.validateArgs(call.arguments);
}

function toNaturalToolSuccess(callName: AiChatToolName, message: string, style: AiToolFeedbackStyle): string {
  return formatToolSuccessMessage(toToolActionLabel(callName), message, style);
}

function toNaturalToolFailure(callName: AiChatToolName, message: string, style: AiToolFeedbackStyle): string {
  return formatToolFailureMessage(callName, toToolActionLabel(callName), message, style);
}

function toToolActionLabel(callName: AiChatToolName): string {
  return TOOL_STRATEGY_TABLE[callName]?.label ?? callName;
}

function toNaturalToolPending(callName: AiChatToolName, style: AiToolFeedbackStyle): string {
  return formatToolPendingMessage(toToolActionLabel(callName), style);
}

function toNaturalToolGraySkipped(callName: AiChatToolName, style: AiToolFeedbackStyle): string {
  return formatToolGraySkippedMessage(toToolActionLabel(callName), style);
}

function toNaturalToolRollbackSkipped(callName: AiChatToolName, style: AiToolFeedbackStyle): string {
  return formatToolRollbackSkippedMessage(toToolActionLabel(callName), style);
}

function resolveAiToolDecisionMode(): AiToolDecisionMode {
  if (featureFlags.aiChatRollbackMode) return 'rollback';
  if (featureFlags.aiChatGrayMode) return 'gray';
  return 'enabled';
}

function buildToolAuditContext(
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

function buildToolIntentAuditMetadata(
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

function buildToolDecisionAuditMetadata(
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

function toNaturalToolCancelled(callName: AiChatToolName, style: AiToolFeedbackStyle): string {
  return formatToolCancelledMessage(toToolActionLabel(callName), style);
}

function toNaturalNonActionFallback(userText: string): string {
  return formatNonActionFallback(userText);
}

function toNaturalActionClarify(callName: AiChatToolName, style: AiToolFeedbackStyle): string {
  return formatActionClarify(toToolActionLabel(callName), style);
}

function buildClarifyCandidates(
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
    // 优先排列上次使用过的语言 | Prioritize previously used language
    const lastLang = sessionMemory?.lastLanguage;
    if (lastLang && lastLang !== 'zho' && lastLang !== 'eng') {
      candidates.push({ key: `${candidates.length}`, label: `上次使用（${lastLang}）`, argsPatch: { languageId: lastLang } });
    }
    candidates.push({ key: `${candidates.length}`, label: '创建中文转写层（zho）', argsPatch: { languageId: 'zho' } });
    candidates.push({ key: `${candidates.length}`, label: '创建英文转写层（eng）', argsPatch: { languageId: 'eng' } });
  }
  return candidates;
}

function toNaturalTargetClarify(
  callName: AiChatToolName,
  reason: ToolPlannerClarifyReason | undefined,
  style: AiToolFeedbackStyle,
  candidates: AiClarifyCandidate[] = [],
): string {
  return formatTargetClarify(toToolActionLabel(callName), reason, style, candidates);
}

function normalizeLegacyRiskNarration(content: string, style: AiToolFeedbackStyle): string {
  const legacyCall = parseLegacyNarratedToolCall(content);
  if (!legacyCall) return content;
  const normalizedName = legacyCall.name;
  if (!normalizedName) return content;
  // 旧句式通常缺少可执行参数，改为澄清提示更准确 | Legacy narration often lacks executable args, so fallback to clarification.
  return toNaturalActionClarify(normalizedName, style);
}

function isAmbiguousTargetRiskSummary(summary: string): boolean {
  const normalized = summary.toLowerCase();
  return normalized.includes('匹配到多个')
    || normalized.includes('目标不唯一')
    || normalized.includes('multiple')
    || normalized.includes('ambiguous');
}

export function useAiChat(options?: UseAiChatOptions) {
  const onToolCall = options?.onToolCall;
  const onToolRiskCheck = options?.onToolRiskCheck;
  const systemPersonaKey = options?.systemPersonaKey ?? 'transcription';
  const systemPersonaKeyRef = useLatest(systemPersonaKey);
  const getContext = options?.getContext;
  const maxContextChars = options?.maxContextChars ?? 2400;
  const historyCharBudget = options?.historyCharBudget ?? 6000;
  const allowDestructiveToolCalls = options?.allowDestructiveToolCalls ?? false;
  const embeddingSearchService = options?.embeddingSearchService;
  const streamPersistIntervalMs = normalizeStreamPersistInterval(
    options?.streamPersistIntervalMs ?? readDevStreamPersistIntervalMs(),
  );
  const firstChunkTimeoutMs = normalizeFirstChunkTimeoutMs(options?.firstChunkTimeoutMs);
  const autoProbeIntervalMs = normalizeAutoProbeIntervalMs(
    options?.autoProbeIntervalMs ?? readDevAutoProbeIntervalMs(),
  );
  const ragContextTimeoutMs = normalizeRagContextTimeoutMs(readDevRagContextTimeoutMs());
  const onToolCallRef = useLatest(onToolCall);
  const onToolRiskCheckRef = useLatest(onToolRiskCheck);
  const onMessageCompleteRef = useLatest(options?.onMessageComplete);
  const toolDecisionMode = resolveAiToolDecisionMode();
  const settingsHydratedRef = useRef(false);
  // 用户是否在水合完成前手动改过设置 | Whether user patched settings before hydration finished
  const userDirtyRef = useRef(false);
  const clearInFlightRef = useRef(false);
  const [messages, setMessages] = useState<UiChatMessage[]>([]);
  const messagesRef = useLatest(messages);
  const [isStreaming, setIsStreaming] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [settings, setSettings] = useState<AiChatSettings>(() => normalizeAiChatSettings());
  const [connectionTestStatus, setConnectionTestStatus] = useState<AiConnectionTestStatus>('idle');
  const [connectionTestMessage, setConnectionTestMessage] = useState<string | null>(null);
  const [contextDebugSnapshot, setContextDebugSnapshot] = useState<AiContextDebugSnapshot | null>(null);
  const [pendingToolCall, setPendingToolCall] = useState<PendingAiToolCall | null>(null);
  const [taskSession, setTaskSession] = useState<AiTaskSession>({
    id: newMessageId('task'),
    status: 'idle',
    updatedAt: nowIso(),
  });
  const [metrics, setMetrics] = useState<AiInteractionMetrics>({ ...INITIAL_METRICS });
  const metricsRef = useLatest(metrics);
  const sessionMemoryRef = useRef<AiSessionMemory>(loadSessionMemory());
  const bumpMetric = useCallback((key: keyof AiInteractionMetrics, delta = 1) => {
    setMetrics((prev) => ({ ...prev, [key]: prev[key] + delta }));
  }, []);
  const abortRef = useRef<AbortController | null>(null);
  const testAbortRef = useRef<AbortController | null>(null);

  const provider = useMemo(() => createAiChatProvider(settings), [settings]);
  // 备用 provider：主模型限速/不可用时自动降级 | Fallback provider for auto-degradation
  const fallbackProvider = useMemo(() => {
    if (!settings.fallbackProviderKind || settings.fallbackProviderKind === settings.providerKind) return null;
    const fallbackApiKey = settings.apiKeysByProvider[settings.fallbackProviderKind] ?? '';
    const fallbackSettings = getDefaultAiChatSettings(settings.fallbackProviderKind);
    return createAiChatProvider({ ...fallbackSettings, apiKey: fallbackApiKey });
  }, [settings]);
  const orchestrator = useMemo(() => new ChatOrchestrator(provider, fallbackProvider), [provider, fallbackProvider]);

  // 用 useLatest 包装 send 内部读取的频繁变更值，减少 send 的依赖数组长度，
  // 避免长依赖数组导致的闭包重建风险（如 settings.model 变更时全量重建）。
  const settingsRef = useLatest(settings);
  const getContextRef = useLatest(getContext);
  const embeddingSearchServiceRef = useLatest(embeddingSearchService);
  const toolDecisionModeRef = useLatest(toolDecisionMode);
  const pendingToolCallRef = useLatest(pendingToolCall);
  const taskSessionRef = useLatest(taskSession);
  const streamPersistIntervalMsRef = useLatest(streamPersistIntervalMs);
  const ragContextTimeoutMsRef = useLatest(ragContextTimeoutMs);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const loaded = await loadAiChatSettings();
      if (cancelled) return;
      // 用户已手动改过 → 不覆盖 | User already patched → skip overwrite
      if (!userDirtyRef.current) {
        setSettings(loaded);
      }
      settingsHydratedRef.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // 水合完成或用户手动改过 → 允许持久化 | Persist after hydration or user-dirty
    if (!settingsHydratedRef.current && !userDirtyRef.current) return;
    void persistAiChatSettingsSecure(settings);
  }, [settings]);

  const updateSettings = useCallback((patch: Partial<AiChatSettings>) => {
    abortRef.current?.abort();
    testAbortRef.current?.abort();
    userDirtyRef.current = true;
    setSettings((current) => applyAiChatSettingsPatch(current, patch));
    setConnectionTestStatus('idle');
    setConnectionTestMessage(null);
  }, []);

  const runConnectionProbe = useCallback(async (showTesting: boolean) => {
    testAbortRef.current?.abort();
    const controller = new AbortController();
    testAbortRef.current = controller;
    if (showTesting) {
      setConnectionTestStatus('testing');
      setConnectionTestMessage(null);
    }

    try {
      const stream = provider.chat(
        [{ role: 'user', content: 'Reply with OK only.' }],
        {
          model: settings.model,
          maxTokens: 8,
          temperature: 0,
          signal: controller.signal,
        },
      );

      let receivedAnyResponse = false;
      let receivedAnyChunk = false;
      for await (const chunk of stream) {
        receivedAnyChunk = true;
        if (chunk.error) {
          throw new Error(chunk.error);
        }
        if ((chunk.delta ?? '').trim().length > 0) {
          receivedAnyResponse = true;
        }
        if (chunk.done || receivedAnyResponse) {
          break;
        }
      }

      const acceptChunkOnly = provider.id === 'ollama';
      if (!receivedAnyResponse && !(acceptChunkOnly && receivedAnyChunk)) {
        throw new Error(formatConnectionProbeNoContentError());
      }

      setConnectionTestStatus('success');
      setConnectionTestMessage(formatConnectionProbeSuccessMessage(provider.label, showTesting));
    } catch (error) {
      if (controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
        if (showTesting) {
          setConnectionTestStatus('idle');
          setConnectionTestMessage(null);
        }
        return;
      }

      setConnectionTestStatus('error');
      setConnectionTestMessage(normalizeAiProviderError(error, provider.label));
    } finally {
      if (testAbortRef.current === controller) {
        testAbortRef.current = null;
      }
    }
  }, [provider, settings.model]);

  const testConnection = useCallback(async () => {
    await runConnectionProbe(true);
  }, [runConnectionProbe]);

  useEffect(() => {
    // 测试环境禁用自动探测，避免用例被真实网络波动干扰 | Disable auto probe in tests for deterministic runs.
    if (import.meta.env.MODE === 'test') return;
    if (isBootstrapping) return;
    if (isStreaming) return;
    if (testAbortRef.current) return;

    const kind = settings.providerKind;
    if (kind === 'mock' || kind === 'ollama') return;
    if (settings.apiKey.trim().length === 0) return;

    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      if (isStreaming || testAbortRef.current) return;
      void runConnectionProbe(false);
    };

    tick();
    const timerId = window.setInterval(tick, autoProbeIntervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(timerId);
    };
  }, [autoProbeIntervalMs, isBootstrapping, isStreaming, runConnectionProbe, settings.apiKey, settings.providerKind]);

  const ensureConversation = useCallback(async (): Promise<string> => {
    if (conversationId) return conversationId;

    const db = await getDb();
    const existingRows = (await db.collections.ai_conversations.find().exec())
      .map((doc) => doc.toJSON())
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    if (existingRows.length > 0) {
      const recentId = existingRows[0]!.id;
      setConversationId(recentId);
      return recentId;
    }

    const id = newMessageId('conv');
    const timestamp = nowIso();
    await db.collections.ai_conversations.insert({
      id,
      title: '默认会话',
      mode: 'assistant',
      providerId: provider.id,
      model: settings.model || provider.id,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    setConversationId(id);
    return id;
  }, [conversationId, provider.id, settings.model]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const db = await getDb();
        // Recover crashed/interrupted sessions by marking stale streaming rows as aborted.
        const zombieStreamingRows = await db.collections.ai_messages.findByIndex('status', 'streaming');
        if (zombieStreamingRows.length > 0) {
          const now = nowIso();
          await Promise.all(zombieStreamingRows.map(async (doc) => {
            const row = doc.toJSON();
            await db.collections.ai_messages.insert({
              ...row,
              status: 'aborted',
              errorMessage: row.errorMessage ?? formatRecoveredInterruptedMessage(),
              updatedAt: now,
            });
          }));
        }

        const conversations = (await db.collections.ai_conversations.find().exec())
          .map((doc) => doc.toJSON())
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

        if (cancelled) return;
        if (conversations.length === 0) {
          setIsBootstrapping(false);
          return;
        }

        const latest = conversations[0]!;
        setConversationId(latest.id);
        const rows = (await db.collections.ai_messages.findByIndex('conversationId', latest.id))
          .map((doc) => doc.toJSON())
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        const historyRowsMap: Record<string, typeof rows[number]> = {};
        for (const row of rows) { historyRowsMap[row.id] = row; }
        const history: UiChatMessage[] = rows.map((row) => ({
          id: row.id,
          role: row.role === 'assistant' ? 'assistant' : 'user',
          content: row.content,
          status: row.status,
          ...(row.errorMessage ? { error: row.errorMessage } : {}),
          ...(row.citations ? { citations: row.citations } : {}),
          ...('reasoningContent' in row && row.reasoningContent
            ? { reasoningContent: String(row.reasoningContent) }
            : {}),
        }));

        if (!cancelled) {
          // UI renders newest-first to keep latest dialog always visible at top.
          setMessages(
            history
              .filter((row) => row.role === 'user' || row.role === 'assistant')
              .reverse(),
          );
        }
      } catch (error) {
        if (!cancelled) {
          setLastError(error instanceof Error ? error.message : formatHistoryLoadFailedFallbackError());
        }
      } finally {
        if (!cancelled) {
          setIsBootstrapping(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const stop = useCallback(() => {
    const controller = abortRef.current;
    if (!controller) return;
    controller.abort();
    // 用户点停止后应立即解除发送拦截 | Immediately unblock sending after user requests stop.
    setIsStreaming(false);
  }, []);

  const applyAssistantMessageResult = useCallback(async (
    messageId: string,
    content: string,
    status: 'done' | 'error' = 'done',
    errorMessage?: string,
  ) => {
    setMessages((prev) => prev.map((msg) => {
      if (msg.id !== messageId) return msg;
      if (status === 'error') {
        return { ...msg, content, status, ...(errorMessage ? { error: errorMessage } : {}) };
      }
      const { error: _ignoredError, ...rest } = msg;
      return { ...rest, content, status: 'done' };
    }));

    const db = await getDb();
    await db.collections.ai_messages.update(messageId, {
      content,
      status,
      ...(errorMessage ? { errorMessage } : {}),
      updatedAt: nowIso(),
    });
  }, []);

  /**
   * 写入工具决策审计日志，自动补充 requestId | Write tool decision audit log with requestId
   */
  const writeToolDecisionAuditLog = useCallback(async (
    assistantMessageId: string,
    oldValue: string,
    newValue: string,
    source: 'human' | 'ai' | 'system',
    requestId?: string,
    metadata?: ToolDecisionAuditMetadata,
  ) => {
    const db = await getDb();
    await db.collections.audit_logs.insert({
      id: newAuditLogId(),
      collection: 'ai_messages',
      documentId: assistantMessageId,
      action: 'update',
      field: 'ai_tool_call_decision',
      oldValue,
      newValue,
      source,
      timestamp: nowIso(),
      ...(requestId ? { requestId } : {}),
      ...(metadata ? { metadataJson: JSON.stringify(metadata) } : {}),
    });
  }, []);

  const writeToolIntentAuditLog = useCallback(async (
    assistantMessageId: string,
    callName: AiChatToolName,
    assessment: ToolIntentAssessment,
    requestId?: string,
    metadata?: ToolIntentAuditMetadata,
  ) => {
    const db = await getDb();
    await db.collections.audit_logs.insert({
      id: newAuditLogId(),
      collection: 'ai_messages',
      documentId: assistantMessageId,
      action: 'update',
      field: 'ai_tool_call_intent',
      oldValue: callName,
      newValue: JSON.stringify(assessment),
      source: 'ai',
      timestamp: nowIso(),
      ...(requestId ? { requestId } : {}),
      ...(metadata ? { metadataJson: JSON.stringify(metadata) } : {}),
    });
  }, []);

  // 幂等性工具调用去重集 | Idempotency deduplication set
  const executedRequestIds = useRef<Set<string>>(new Set());

  // 生成幂等性指纹（按 assistant 消息作用域）| Generate idempotency fingerprint scoped to assistant message
  function genRequestId(call: AiChatToolCall, scopeMessageId?: string): string {
    const base = buildAiToolRequestId(call);
    if (!scopeMessageId) return base;
    return `${base}_${scopeMessageId}`;
  }

  const hasPersistedExecutionForRequest = useCallback(async (requestId: string): Promise<boolean> => {
    if (executedRequestIds.current.has(requestId)) return true;

    const db = await getDb();
    const rows = await db.dexie.audit_logs
      .where('[collection+field+requestId]')
      .equals(['ai_messages', 'ai_tool_call_decision', requestId])
      .toArray();

    const hasExecuted = rows.some((row) => {
      if (typeof row.metadataJson === 'string' && row.metadataJson.trim().length > 0) {
        try {
          const parsed = JSON.parse(row.metadataJson) as { phase?: unknown; executed?: unknown };
          if (parsed.phase === 'decision' && parsed.executed === true) {
            return true;
          }
        } catch {
          // Ignore malformed metadata and fall back to compact decision parsing.
        }
      }

      const parts = String(row.newValue ?? '').split(':');
      const decision = parts[0] ?? '';
      const reason = parts[2] ?? '';
      if (decision === 'confirmed' || decision === 'auto_confirmed') return true;
      if ((decision === 'confirm_failed' || decision === 'auto_failed')
        && reason !== 'invalid_args'
        && reason !== 'no_executor'
        && reason !== 'duplicate_requestId') {
        return true;
      }
      return false;
    });

    if (hasExecuted) {
      executedRequestIds.current.add(requestId);
    }
    return hasExecuted;
  }, []);

  const confirmPendingToolCall = useCallback(async () => {
    const pending = pendingToolCallRef.current;
    if (!pending) return;

    const { call, assistantMessageId } = pending;
    setPendingToolCall(null);
    setTaskSession({
      id: taskSessionRef.current.id,
      status: 'executing',
      toolName: call.name,
      updatedAt: nowIso(),
    });
    const auditContext = pending.auditContext ?? buildToolAuditContext(
      '',
      provider.id,
      settingsRef.current.model,
      toolDecisionModeRef.current,
      settingsRef.current.toolFeedbackStyle,
    );

    // 注入 requestId | Inject requestId
    if (!call.requestId) call.requestId = genRequestId(call, assistantMessageId);
    if (await hasPersistedExecutionForRequest(call.requestId)) {
      await applyAssistantMessageResult(
        assistantMessageId,
        toNaturalToolFailure(call.name, formatDuplicateRequestIgnoredDetail(), settingsRef.current.toolFeedbackStyle),
        'error',
        formatDuplicateRequestIgnoredError(),
      );
      await writeToolDecisionAuditLog(
        assistantMessageId,
        `pending:${call.name}`,
        `confirm_failed:${call.name}:duplicate_requestId`,
        'human',
        call.requestId,
        buildToolDecisionAuditMetadata(
          assistantMessageId,
          call,
          auditContext,
          'human',
          'confirm_failed',
          false,
          formatDuplicateRequestIgnoredError(),
          'duplicate_requestId',
        ),
      );
      setTaskSession({
        id: taskSessionRef.current.id,
        status: 'idle',
        updatedAt: nowIso(),
      });
      return;
    }

    const argsValidationError = validateToolCallArguments(call);
    if (argsValidationError) {
      const invalidArgsText = formatInvalidArgsError(argsValidationError);
      await applyAssistantMessageResult(
        assistantMessageId,
        toNaturalToolFailure(call.name, invalidArgsText, settingsRef.current.toolFeedbackStyle),
        'error',
        invalidArgsText,
      );
      await writeToolDecisionAuditLog(
        assistantMessageId,
        `pending:${call.name}`,
        `confirm_failed:${call.name}:invalid_args`,
        'human',
        call.requestId,
        buildToolDecisionAuditMetadata(
          assistantMessageId,
          call,
          auditContext,
          'human',
          'confirm_failed',
          false,
          invalidArgsText,
          'invalid_args',
        ),
      );
      setTaskSession({
        id: taskSessionRef.current.id,
        status: 'idle',
        updatedAt: nowIso(),
      });
      return;
    }

    if (!onToolCallRef.current) {
      await applyAssistantMessageResult(
        assistantMessageId,
        toNaturalToolFailure(call.name, formatNoExecutorToolFailureDetail(), settingsRef.current.toolFeedbackStyle),
        'error',
        formatNoExecutorInternalError(),
      );
      await writeToolDecisionAuditLog(
        assistantMessageId,
        `pending:${call.name}`,
        `confirm_failed:${call.name}:no_executor`,
        'human',
        call.requestId,
        buildToolDecisionAuditMetadata(
          assistantMessageId,
          call,
          auditContext,
          'human',
          'confirm_failed',
          false,
          formatNoExecutorInternalError(),
          'no_executor',
        ),
      );
      setTaskSession({
        id: taskSessionRef.current.id,
        status: 'idle',
        updatedAt: nowIso(),
      });
      return;
    }

    const execStart = performance.now();
    try {
      executedRequestIds.current.add(call.requestId);
      const result = await onToolCallRef.current(call);
      const execDurationMs = Math.round(performance.now() - execStart);
      if (result.ok) {
        bumpMetric('successCount');
        sessionMemoryRef.current = { ...sessionMemoryRef.current, lastToolName: call.name };
        const lang = typeof call.arguments.language === 'string' ? call.arguments.language : undefined;
        if (lang) sessionMemoryRef.current.lastLanguage = lang;
        persistSessionMemory(sessionMemoryRef.current);
      } else {
        bumpMetric('failureCount');
      }
      await applyAssistantMessageResult(
        assistantMessageId,
        result.ok
          ? toNaturalToolSuccess(call.name, result.message, settingsRef.current.toolFeedbackStyle)
          : toNaturalToolFailure(call.name, result.message, settingsRef.current.toolFeedbackStyle),
        result.ok ? 'done' : 'error',
        result.ok ? undefined : result.message,
      );
      await writeToolDecisionAuditLog(
        assistantMessageId,
        `pending:${call.name}`,
        `${result.ok ? 'confirmed' : 'confirm_failed'}:${call.name}`,
        'human',
        call.requestId,
        buildToolDecisionAuditMetadata(
          assistantMessageId,
          call,
          auditContext,
          'human',
          result.ok ? 'confirmed' : 'confirm_failed',
          true,
          result.message,
          undefined,
          execDurationMs,
        ),
      );
      setTaskSession({
        id: taskSessionRef.current.id,
        status: 'idle',
        updatedAt: nowIso(),
      });
    } catch (error) {
      const execDurationMsErr = Math.round(performance.now() - execStart);
      const toolErrorText = error instanceof Error ? error.message : formatToolExecutionFallbackError();
      await applyAssistantMessageResult(
        assistantMessageId,
        toNaturalToolFailure(call.name, toolErrorText, settingsRef.current.toolFeedbackStyle),
        'error',
        toolErrorText,
      );
      await writeToolDecisionAuditLog(
        assistantMessageId,
        `pending:${call.name}`,
        `confirm_failed:${call.name}:exception`,
        'human',
        call.requestId,
        buildToolDecisionAuditMetadata(
          assistantMessageId,
          call,
          auditContext,
          'human',
          'confirm_failed',
          true,
          toolErrorText,
          'exception',
          execDurationMsErr,
        ),
      );
      setTaskSession({
        id: taskSessionRef.current.id,
        status: 'idle',
        updatedAt: nowIso(),
      });
    }
  }, [applyAssistantMessageResult, hasPersistedExecutionForRequest, onToolCallRef, provider.id, taskSessionRef, writeToolDecisionAuditLog]);

  const cancelPendingToolCall = useCallback(async () => {
    const pending = pendingToolCallRef.current;
    if (!pending) return;
    const auditContext = pending.auditContext ?? buildToolAuditContext(
      '',
      provider.id,
      settingsRef.current.model,
      toolDecisionModeRef.current,
      settingsRef.current.toolFeedbackStyle,
    );

    setPendingToolCall(null);
    bumpMetric('cancelCount');
    setTaskSession({
      id: taskSessionRef.current.id,
      status: 'idle',
      updatedAt: nowIso(),
    });
    await applyAssistantMessageResult(
      pending.assistantMessageId,
      toNaturalToolCancelled(pending.call.name, settingsRef.current.toolFeedbackStyle),
    );

    await writeToolDecisionAuditLog(
      pending.assistantMessageId,
      `pending:${pending.call.name}`,
      `cancelled:${pending.call.name}`,
      'human',
      pending.call.requestId,
      buildToolDecisionAuditMetadata(
        pending.assistantMessageId,
        pending.call,
        auditContext,
        'human',
        'cancelled',
        false,
      ),
    );
  }, [applyAssistantMessageResult, provider.id, taskSessionRef, writeToolDecisionAuditLog]);

  const send = useCallback(async (userText: string) => {
    if (!featureFlags.aiChatEnabled) {
      setLastError(formatAiChatDisabledError());
      return;
    }

    if (isStreaming) {
      setLastError(formatStreamingBusyError());
      return;
    }

    const trimmed = userText.trim();
    if (trimmed.length === 0) return;
    if (pendingToolCallRef.current) {
      setLastError(formatPendingConfirmationBlockedError());
      return;
    }

    setLastError(null);
    bumpMetric('turnCount');
    const shouldTrackRemoteStatus = provider.id !== 'mock' && provider.id !== 'ollama';
    if (shouldTrackRemoteStatus) {
      setConnectionTestStatus('testing');
      setConnectionTestMessage(null);
    }
    const userMsg: UiChatMessage = {
      id: newMessageId('usr'),
      role: 'user',
      content: trimmed,
      status: 'done',
    };

    const assistantId = newMessageId('ast');
    const assistantSeed: UiChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      status: 'streaming',
      citations: [],
      generationSource: 'local',
      generationModel: '',
      reasoningContent: '',
    };

    // Keep newest messages at top in UI.
    setMessages((prev) => [userMsg, assistantSeed, ...prev]);
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;
    let dbRef: Awaited<ReturnType<typeof getDb>> | null = null;
    let activeConversationId: string | null = null;
    let lastPersistedAssistantContent = '';
    let lastPersistedAt = 0;
    let firstChunkArrived = false;
    let connectionMarkedSuccess = false;
    let timedOutBeforeFirstChunk = false;
    // DeepSeek 和 MiniMax 思考链较长，默认首包超时延长至 60s；若调用方显式覆盖则尊重调用方配置。
    // DeepSeek often needs longer thinking time; default timeout is extended to 60s,
    // but explicit overrides should be honored (tests/dev tuning).
    const effectiveTimeoutMs = provider.id === 'deepseek' || provider.id === 'minimax'
      ? (firstChunkTimeoutMs === DEFAULT_FIRST_CHUNK_TIMEOUT_MS ? 60000 : firstChunkTimeoutMs)
      : (provider.id === 'ollama' ? 0 : firstChunkTimeoutMs);
    const timeoutHandle = (typeof window !== 'undefined' && effectiveTimeoutMs > 0)
      ? window.setTimeout(() => {
        if (firstChunkArrived || controller.signal.aborted) return;
        timedOutBeforeFirstChunk = true;
        controller.abort();
      }, effectiveTimeoutMs)
      : null;

    const flushAssistantDraft = async (content: string, force = false): Promise<void> => {
      if (!dbRef) return;
      if (content === lastPersistedAssistantContent) return;
      const now = Date.now();
      if (!force && now - lastPersistedAt < streamPersistIntervalMsRef.current) return;

      const existing = await dbRef.collections.ai_messages.findOne({ selector: { id: assistantId } }).exec();
      if (!existing) return;
      const row = existing.toJSON();
      await dbRef.collections.ai_messages.insert({
        ...row,
        content,
        updatedAt: nowIso(),
      });
      lastPersistedAssistantContent = content;
      lastPersistedAt = now;
    };

    const updateConversationTimestamp = async () => {
      if (!dbRef || !activeConversationId) return;
      const conv = await dbRef.collections.ai_conversations.findOne({ selector: { id: activeConversationId } }).exec();
      if (!conv) return;
      const convo = conv.toJSON();
      await dbRef.collections.ai_conversations.insert({
        ...convo,
        updatedAt: nowIso(),
      });
    };

    const finalizeAssistantMessage = async (
      status: 'done' | 'error' | 'aborted',
      content: string,
      errorMessage?: string,
      citations?: AiMessageCitation[],
      reasoningContent?: string,
    ) => {
      setMessages((prev) => prev.map((msg) => {
        if (msg.id !== assistantId) return msg;
        if (status === 'error') {
          return {
            ...msg,
            content,
            status,
            ...(errorMessage ? { error: errorMessage } : {}),
            ...(citations ? { citations } : {}),
            ...(reasoningContent ? { reasoningContent } : {}),
          };
        }
        return { ...msg, content, status, ...(citations ? { citations } : {}), ...(reasoningContent ? { reasoningContent } : {}) };
      }));

      if (!dbRef) return;
      const existing = await dbRef.collections.ai_messages.findOne({ selector: { id: assistantId } }).exec();
      if (existing) {
        const row = existing.toJSON();
        await dbRef.collections.ai_messages.insert({
          ...row,
          content,
          status,
          ...(errorMessage ? { errorMessage } : {}),
          ...(citations ? { citations } : {}),
          ...(reasoningContent ? { reasoningContent } : {}),
          updatedAt: nowIso(),
        });
      }
      await updateConversationTimestamp();
    };

    let assistantContent = '';

    try {
      activeConversationId = await ensureConversation();
      const db = await getDb();
      dbRef = db;
      const userTimestamp = nowIso();
      await db.collections.ai_messages.insert({
        id: userMsg.id,
        conversationId: activeConversationId,
        role: 'user',
        content: userMsg.content,
        status: 'done',
        createdAt: userTimestamp,
        updatedAt: userTimestamp,
      });
      const assistantTimestamp = nowIso();
      await db.collections.ai_messages.insert({
        id: assistantId,
        conversationId: activeConversationId,
        role: 'assistant',
        content: '',
        status: 'streaming',
        createdAt: assistantTimestamp,
        updatedAt: assistantTimestamp,
      });

      const conversation = await db.collections.ai_conversations.findOne({ selector: { id: activeConversationId } }).exec();
      if (conversation) {
        const row = conversation.toJSON();
        await db.collections.ai_conversations.insert({
          ...row,
          providerId: provider.id,
          model: settingsRef.current.model || provider.id,
          updatedAt: nowIso(),
        });
      }

      // Convert UI order (newest-first) back to chronological order for model context.
      const historyRaw: ChatMessage[] = [...messagesRef.current]
        .reverse()
        .map((m) => ({ role: m.role, content: m.content }));
      const history = trimHistoryByChars(historyRaw, historyCharBudget);
      const aiContext = getContextRef.current?.() ?? null;
      let contextBlock = buildPromptContextBlock(aiContext, maxContextChars);
      let ragCitations: AiMessageCitation[] = [];

      // ── Minimal RAG: inject top embedding matches as text snippets into context ──
      if (embeddingSearchServiceRef.current) {
        try {
          const ragResult = await withTimeout(
            embeddingSearchServiceRef.current.searchMultiSourceHybrid(
              trimmed,
              ['utterance', 'note', 'pdf'],
              { topK: 5, fusionScenario: 'qa' },
            ),
            ragContextTimeoutMsRef.current,
            `RAG context timed out after ${ragContextTimeoutMsRef.current}ms`,
          );
          let activeMatches = ragResult.matches;
          // 降级策略：严格阈值无结果时，放宽阈值重试（降级阈值 0.3 → 0.1）
          // Degradation: if strict threshold returns empty, retry with relaxed threshold
          if (activeMatches.length === 0) {
            const fallbackResult = await withTimeout(
              embeddingSearchServiceRef.current.searchMultiSourceHybrid(
                trimmed,
                ['utterance', 'note', 'pdf'],
                { topK: 5, fusionScenario: 'qa', minScore: 0.1 },
              ),
              ragContextTimeoutMsRef.current,
              `RAG fallback timed out after ${ragContextTimeoutMsRef.current}ms`,
            );
            activeMatches = fallbackResult.matches;
          }
          // F-04 degradation: log when RAG returns empty after strict + relaxed attempts
          if (activeMatches.length === 0) {
            // eslint-disable-next-line no-console
            console.debug(`[useAiChat] RAG no matches for query "${trimmed.slice(0, 80)}" — proceeding without context augmentation`);
          }
          if (activeMatches.length > 0) {
            // 批量反查各匹配项的原始文字 | Batch-resolve source text for each match
            const db = await getDb();
            // 收集原始 RAG 来源，之后统一去重编号 | Collect raw RAG sources for dedup & numbering
            // E-01: 并行查询替代串行 N+1 | Parallelize DB lookups to eliminate N+1 round-trips
            const rawRagResults = await Promise.all(
              activeMatches.map(async (m): Promise<{
                contextTag: string;
                safeSnippet: string;
                citation: AiMessageCitation;
              } | null> => {
                let snippet = '';
                if (m.sourceType === 'note') {
                  // 从笔记表取内容 | Retrieve content from user_notes
                  const noteRows = await db.collections.user_notes.findByIndex('id', m.sourceId);
                  const noteDoc = noteRows[0]?.toJSON();
                  if (noteDoc?.content) {
                    const c = noteDoc.content as Record<string, string>;
                    snippet = (c['und'] ?? c['en'] ?? Object.values(c).find((v) => v.trim()) ?? '').trim();
                  }
                } else if (m.sourceType === 'utterance') {
                  // 从 utterance_texts 取首个有文本的层 | Get first available text from utterance_texts
                  const textRows = await db.collections.utterance_texts.findByIndex('utteranceId', m.sourceId);
                  const textWithContent = textRows.find((r) => r.toJSON().text?.trim());
                  snippet = textWithContent?.toJSON().text?.trim() ?? '';
                } else if (m.sourceType === 'pdf') {
                  const { baseRef } = splitPdfCitationRef(m.sourceId);
                  const mediaRows = await db.collections.media_items.findByIndex('id', baseRef);
                  const mediaDoc = mediaRows[0]?.toJSON();
                  const details = mediaDoc?.details as Record<string, unknown> | undefined;
                  snippet = extractPdfSnippet(details, 300);
                }
                if (!snippet) return null;
                const label = m.sourceType === 'note'
                  ? '笔记参考'
                  : (m.sourceType === 'utterance' ? '句段参考' : '文档参考');
                const contextTag = m.sourceType === 'note'
                  ? 'NOTE_CONTEXT'
                  : (m.sourceType === 'utterance' ? 'UTTERANCE_CONTEXT' : 'PDF_CONTEXT');
                // 转义 RAG 片段中的括号，防止 prompt injection 攻击
                // Escape bracket characters in snippets to prevent prompt injection
                const safeSnippet = snippet.slice(0, 300).replace(/[[\]]/g, (c) => (c === '[' ? '【' : '】'));
                // 只对有有效引用类型的来源构建 citation | Only build citations for valid source types
                const validCitationTypes: Array<'note' | 'utterance' | 'pdf' | 'schema'> = ['note', 'utterance', 'pdf', 'schema'];
                if (!validCitationTypes.includes(m.sourceType as typeof validCitationTypes[number])) return null;
                return {
                  contextTag,
                  safeSnippet,
                  citation: {
                    type: m.sourceType as 'note' | 'utterance' | 'pdf' | 'schema',
                    refId: m.sourceId,
                    label,
                    snippet: snippet.slice(0, 300),
                  },
                };
              }),
            );
            const rawRagSources = rawRagResults.filter((r): r is NonNullable<typeof r> =>
              r !== null && ['note', 'utterance', 'pdf'].includes(r.citation.type),
            );
            // 去重并编号注入上下文 | Deduplicate then inject numbered sources into context
            const seen = new Set<string>();
            const dedupedSources = rawRagSources.filter((s) => {
              const key = `${s.citation.type}:${s.citation.refId}`;
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            });
            if (dedupedSources.length > 0) {
              const ragLines = dedupedSources.map(
                (s, i) => `[${i + 1}] (${s.contextTag}) ${s.safeSnippet}`,
              );
              ragCitations = dedupedSources.map((s) => s.citation);
              contextBlock += `\n[RELEVANT_CONTEXT]\n${ragLines.join('\n')}\n${RAG_CITATION_INSTRUCTION}`;
            }
          }
        } catch (error) {
          // RAG is best-effort; do not block chat on embedding failures.
          // eslint-disable-next-line no-console
          console.warn('[useAiChat] RAG context enrichment failed:', error);
        }
      }
      const contextDebugEnabled = isAiContextDebugEnabled();
      const nextDebugSnapshot: AiContextDebugSnapshot = {
        enabled: contextDebugEnabled,
        persona: systemPersonaKeyRef.current,
        historyChars: history.map((item) => item.content).join('').length,
        historyCount: history.length,
        contextChars: contextBlock.length,
        historyCharBudget,
        maxContextChars,
        contextPreview: contextBlock.slice(0, 1200),
      };
      setContextDebugSnapshot(nextDebugSnapshot);
      if (contextDebugEnabled) {
        // Dev-only context diagnostics for tuning truncation and token budgets.
        // eslint-disable-next-line no-console
        console.debug('[AI Context Debug]', {
          ...nextDebugSnapshot,
          contextPreview: nextDebugSnapshot.contextPreview.slice(0, 240),
        });
      }
      // ── 澄清回复属性提取快速路径 | Clarify reply attribute extraction fast-path ──
      // 用户在 waiting_clarify 状态回复语言名称（如"日语"）时，直接提取并补丁参数，跳过 LLM。
      const clarifySession = taskSessionRef.current;
      let clarifyFastPathCall: { name: AiChatToolName; arguments: Record<string, unknown> } | null = null;
      if (clarifySession.status === 'waiting_clarify' && clarifySession.toolName && clarifySession.clarifyReason === 'missing-language-target') {
        const langPatch = extractClarifyLanguagePatch(trimmed);
        if (langPatch) {
          clarifyFastPathCall = { name: clarifySession.toolName, arguments: langPatch };
        }
      } else if (clarifySession.status === 'waiting_clarify'
        && clarifySession.toolName === 'split_transcription_segment'
        && clarifySession.clarifyReason === 'missing-split-position') {
        const splitPatch = extractClarifySplitPositionPatch(trimmed, aiContext);
        if (splitPatch) {
          clarifyFastPathCall = { name: 'split_transcription_segment', arguments: splitPatch };
        }
      }

      // ── 本地指令快速路径：明确指令跳过 LLM | Local command fast-path: skip LLM for unambiguous commands ──
      const localResolve = clarifyFastPathCall ? null : resolveCommand(trimmed);
      let stream: AsyncGenerator<{ delta?: string; done?: boolean; error?: string; reasoningContent?: string; thinking?: boolean }>;
      let generationSource: UiChatMessage['generationSource'] = 'local';
      let generationModel = '';
      if (clarifyFastPathCall) {
        // 澄清回复直接合成工具调用 | Synthesize tool call from clarify reply attribute
        const syntheticJson = JSON.stringify({ tool_call: { name: clarifyFastPathCall.name, arguments: clarifyFastPathCall.arguments } });
        stream = (async function* () {
          yield { delta: syntheticJson };
          yield { delta: '', done: true };
        })();
      } else if (localResolve) {
        // 构造与 LLM 相同格式的合成响应 | Synthesize response in same format as LLM
        const syntheticJson = JSON.stringify({ tool_call: { name: localResolve.call.name, arguments: localResolve.call.arguments } });
        stream = (async function* () {
          yield { delta: syntheticJson };
          yield { delta: '', done: true };
        })();
      } else {
        // 模型路由：解释模式使用轻量模型（若已配置）| Model routing: use lightweight model for explain mode
        const effectiveModel = taskSessionRef.current.status === 'explaining' && settingsRef.current.explainModel
          ? settingsRef.current.explainModel
          : settingsRef.current.model;
        generationSource = 'llm';
        generationModel = (effectiveModel ?? '').trim();
        ({ stream } = orchestrator.sendMessage({
          history,
          userText: trimmed,
          systemPrompt: buildAiSystemPrompt(systemPersonaKeyRef.current, contextBlock),
          options: { signal: controller.signal, model: effectiveModel },
        }));
      }

      setMessages((prev) => prev.map((msg) => (
        msg.id === assistantId
          ? { ...msg, generationSource, generationModel }
          : msg
      )));

      let assistantReasoningContent = '';
      let assistantThinking = false;
      let streamFinalized = false;

      for await (const chunk of stream) {
        if (!firstChunkArrived) {
          firstChunkArrived = true;
          if (shouldTrackRemoteStatus && !connectionMarkedSuccess) {
            connectionMarkedSuccess = true;
            setConnectionTestStatus('success');
            setConnectionTestMessage(formatConnectionHealthyMessage(provider.label));
          }
          if (timeoutHandle !== null && typeof window !== 'undefined') {
            window.clearTimeout(timeoutHandle);
          }
        }

        if (chunk.error) {
          const errorText = chunk.error;
          streamFinalized = true;
          await finalizeAssistantMessage('error', assistantContent, errorText, ragCitations, assistantReasoningContent);
          setLastError(errorText);
          if (shouldTrackRemoteStatus) {
            setConnectionTestStatus('error');
            setConnectionTestMessage(errorText);
          }
          break;
        }

        if ((chunk.delta ?? '').length > 0) {
          const delta = chunk.delta ?? '';
          assistantContent += delta;
          setMessages((prev) => prev.map((msg) => (
            msg.id === assistantId
              ? { ...msg, content: msg.content + delta, ...(assistantThinking ? { thinking: false } : {}) }
              : msg
          )));
          await flushAssistantDraft(assistantContent);
        }

        // 思考中状态：非reasoning_content型provider的首包到达前显示"正在思考"
        // Anthropic/Gemini/Ollama等provider在首个delta到达前会yield { thinking: true }
        if (chunk.thinking && !chunk.delta) {
          assistantThinking = true;
          setMessages((prev) => prev.map((msg) => (
            msg.id === assistantId
              ? { ...msg, thinking: true }
              : msg
          )));
        }

        // 累加推理内容（reasoning_content），如 DeepSeek 思考过程
        if (chunk.reasoningContent && chunk.reasoningContent.length > 0) {
          assistantReasoningContent += chunk.reasoningContent;
          setMessages((prev) => prev.map((msg) => (
            msg.id === assistantId
              ? { ...msg, reasoningContent: (msg.reasoningContent ?? '') + chunk.reasoningContent }
              : msg
          )));
        }

        if (chunk.done) {
          streamFinalized = true;
          await flushAssistantDraft(assistantContent, true);
          let finalContent = assistantContent;
          let finalStatus: 'done' | 'error' = 'done';
          let finalErrorMessage: string | undefined;

          // 防止空响应导致“看起来无反应” | Guard against empty model replies that look like no-op in UI.
          if (assistantContent.trim().length === 0) {
            finalContent = formatEmptyModelReply();
            finalStatus = 'error';
            finalErrorMessage = formatEmptyModelResponseError();
            setLastError(finalErrorMessage);
            if (shouldTrackRemoteStatus) {
              setConnectionTestStatus('error');
              setConnectionTestMessage(finalErrorMessage);
            }
            await finalizeAssistantMessage(finalStatus, finalContent, finalErrorMessage, ragCitations, assistantReasoningContent);
            break;
          }

          const parsedToolCall = parseToolCallFromText(assistantContent) ?? parseLegacyNarratedToolCall(assistantContent);
          const planner = parsedToolCall ? planToolCallTargets(parsedToolCall, trimmed, aiContext) : null;
          const toolCall = planner?.call ?? null;
          if (toolCall) {
            // 幂等性指纹注入 | Inject idempotency fingerprint
            if (!toolCall.requestId) toolCall.requestId = genRequestId(toolCall, assistantId);
            const baseAuditContext = buildToolAuditContext(
              trimmed,
              provider.id,
              settingsRef.current.model,
              toolDecisionModeRef.current,
              settingsRef.current.toolFeedbackStyle,
              planner,
            );
            if (toolDecisionModeRef.current === 'rollback') {
              finalContent = toNaturalToolRollbackSkipped(toolCall.name, settingsRef.current.toolFeedbackStyle);
              await writeToolDecisionAuditLog(
                assistantId,
                `auto:${toolCall.name}`,
                `rollback_skipped:${toolCall.name}`,
                'system',
                toolCall.requestId,
                buildToolDecisionAuditMetadata(
                  assistantId,
                  toolCall,
                  baseAuditContext,
                  'system',
                  'rollback_skipped',
                  false,
                ),
              );
            } else if (toolDecisionModeRef.current === 'gray') {
              const allowDeicticExecution = shouldAllowDeicticExecutionIntent(trimmed, toolCall.name, aiContext, messagesRef.current);
              const intentAssessment = assessToolActionIntent(trimmed, { allowDeicticExecution });
              const auditContext = buildToolAuditContext(
                trimmed,
                provider.id,
                settingsRef.current.model,
                toolDecisionModeRef.current,
                settingsRef.current.toolFeedbackStyle,
                planner,
                intentAssessment,
              );
              await writeToolIntentAuditLog(
                assistantId,
                toolCall.name,
                intentAssessment,
                toolCall.requestId,
                buildToolIntentAuditMetadata(assistantId, toolCall, auditContext),
              );

              if (intentAssessment.decision === 'cancel') {
                finalContent = formatInlineCancelReply();
                bumpMetric('cancelCount');
                setPendingToolCall(null);
                setTaskSession({ id: taskSessionRef.current.id, status: 'idle', updatedAt: nowIso() });
              } else if (intentAssessment.decision === 'ignore') {
                finalContent = toNaturalNonActionFallback(trimmed);
                bumpMetric('explainFallbackCount');
                setTaskSession({ id: taskSessionRef.current.id, status: 'explaining', updatedAt: nowIso() });
              } else if (planner?.decision === 'clarify') {
                const clarifyCandidates = buildClarifyCandidates(toolCall.name, planner.reason, aiContext, sessionMemoryRef.current);
                setTaskSession({
                  id: taskSessionRef.current.id,
                  status: 'waiting_clarify',
                  toolName: toolCall.name,
                  clarifyReason: planner.reason!,
                  candidates: clarifyCandidates,
                  updatedAt: nowIso(),
                });
                bumpMetric('clarifyCount');
                finalContent = toNaturalTargetClarify(toolCall.name, planner.reason!, settingsRef.current.toolFeedbackStyle, clarifyCandidates);
              } else if (intentAssessment.decision === 'clarify') {
                finalContent = toNaturalActionClarify(toolCall.name, settingsRef.current.toolFeedbackStyle);
                bumpMetric('clarifyCount');
              } else {
                const argsValidationError = validateToolCallArguments(toolCall);
                if (argsValidationError) {
                  const invalidArgsText = formatInvalidArgsError(argsValidationError);
                  finalContent = toNaturalToolFailure(toolCall.name, invalidArgsText, settingsRef.current.toolFeedbackStyle);
                  finalStatus = 'error';
                  finalErrorMessage = invalidArgsText;
                  bumpMetric('failureCount');
                  await writeToolDecisionAuditLog(
                    assistantId,
                    `auto:${toolCall.name}`,
                    `gray_failed:${toolCall.name}:invalid_args`,
                    'system',
                    toolCall.requestId,
                    buildToolDecisionAuditMetadata(
                      assistantId,
                      toolCall,
                      auditContext,
                      'system',
                      'gray_failed',
                      false,
                      invalidArgsText,
                      'invalid_args',
                    ),
                  );
                } else {
                  finalContent = toNaturalToolGraySkipped(toolCall.name, settingsRef.current.toolFeedbackStyle);
                  await writeToolDecisionAuditLog(
                    assistantId,
                    `auto:${toolCall.name}`,
                    `gray_skipped:${toolCall.name}`,
                    'system',
                    toolCall.requestId,
                    buildToolDecisionAuditMetadata(
                      assistantId,
                      toolCall,
                      auditContext,
                      'system',
                      'gray_skipped',
                      false,
                    ),
                  );
                }
              }
            } else if (await hasPersistedExecutionForRequest(toolCall.requestId)) {
              finalContent = toNaturalToolFailure(toolCall.name, formatDuplicateRequestIgnoredDetail(), settingsRef.current.toolFeedbackStyle);
              finalStatus = 'error';
              finalErrorMessage = formatDuplicateRequestIgnoredError();
              await writeToolDecisionAuditLog(
                assistantId,
                `auto:${toolCall.name}`,
                `auto_failed:${toolCall.name}:duplicate_requestId`,
                'ai',
                toolCall.requestId,
                buildToolDecisionAuditMetadata(
                  assistantId,
                  toolCall,
                  baseAuditContext,
                  'ai',
                  'auto_failed',
                  false,
                  formatDuplicateRequestIgnoredError(),
                  'duplicate_requestId',
                ),
              );
            } else {
              const allowDeicticExecution = shouldAllowDeicticExecutionIntent(trimmed, toolCall.name, aiContext, messagesRef.current);
              const intentAssessment = assessToolActionIntent(trimmed, { allowDeicticExecution });
              const auditContext = buildToolAuditContext(
                trimmed,
                provider.id,
                settingsRef.current.model,
                toolDecisionModeRef.current,
                settingsRef.current.toolFeedbackStyle,
                planner,
                intentAssessment,
              );
              await writeToolIntentAuditLog(
                assistantId,
                toolCall.name,
                intentAssessment,
                toolCall.requestId,
                buildToolIntentAuditMetadata(assistantId, toolCall, auditContext),
              );

              if (intentAssessment.decision === 'cancel') {
                finalContent = formatInlineCancelReply();
                bumpMetric('cancelCount');
                setPendingToolCall(null);
                setTaskSession({ id: taskSessionRef.current.id, status: 'idle', updatedAt: nowIso() });
              } else if (intentAssessment.decision === 'ignore') {
                finalContent = toNaturalNonActionFallback(trimmed);
                bumpMetric('explainFallbackCount');
                setTaskSession({ id: taskSessionRef.current.id, status: 'explaining', updatedAt: nowIso() });
              } else if (planner?.decision === 'clarify') {
                const clarifyCandidates = buildClarifyCandidates(toolCall.name, planner.reason, aiContext, sessionMemoryRef.current);
                setTaskSession({
                  id: taskSessionRef.current.id,
                  status: 'waiting_clarify',
                  toolName: toolCall.name,
                  clarifyReason: planner.reason!,
                  candidates: clarifyCandidates,
                  updatedAt: nowIso(),
                });
                bumpMetric('clarifyCount');
                finalContent = toNaturalTargetClarify(toolCall.name, planner.reason!, settingsRef.current.toolFeedbackStyle, clarifyCandidates);
              } else if (intentAssessment.decision === 'clarify') {
                finalContent = toNaturalActionClarify(toolCall.name, settingsRef.current.toolFeedbackStyle);
                bumpMetric('clarifyCount');
              } else {
                const argsValidationError = validateToolCallArguments(toolCall);
                if (argsValidationError) {
                  const invalidArgsText = formatInvalidArgsError(argsValidationError);
                  finalContent = toNaturalToolFailure(toolCall.name, invalidArgsText, settingsRef.current.toolFeedbackStyle);
                  finalStatus = 'error';
                  finalErrorMessage = invalidArgsText;
                  bumpMetric('failureCount');
                  await writeToolDecisionAuditLog(
                    assistantId,
                    `auto:${toolCall.name}`,
                    `auto_failed:${toolCall.name}:invalid_args`,
                    'ai',
                    toolCall.requestId,
                    buildToolDecisionAuditMetadata(
                      assistantId,
                      toolCall,
                      auditContext,
                      'ai',
                      'auto_failed',
                      false,
                      invalidArgsText,
                      'invalid_args',
                    ),
                  );
                } else {
                  const destructiveBlocked = !allowDestructiveToolCalls && isDestructiveToolCall(toolCall.name);
                  let riskCheck: AiToolRiskCheckResult | null | undefined;
                  if (destructiveBlocked && onToolRiskCheckRef.current) {
                    riskCheck = await onToolRiskCheckRef.current(toolCall);
                  }

                  if (destructiveBlocked && riskCheck?.riskSummary && isAmbiguousTargetRiskSummary(riskCheck.riskSummary)) {
                    finalContent = toNaturalToolFailure(toolCall.name, riskCheck.riskSummary, settingsRef.current.toolFeedbackStyle);
                    finalStatus = 'error';
                    finalErrorMessage = riskCheck.riskSummary;
                    bumpMetric('failureCount');
                    setTaskSession({
                      id: taskSessionRef.current.id,
                      status: 'waiting_clarify',
                      toolName: toolCall.name,
                      clarifyReason: 'missing-layer-target',
                      candidates: [],
                      updatedAt: nowIso(),
                    });
                    await writeToolDecisionAuditLog(
                      assistantId,
                      `auto:${toolCall.name}`,
                      `auto_failed:${toolCall.name}:ambiguous_target`,
                      'ai',
                      toolCall.requestId,
                      buildToolDecisionAuditMetadata(
                        assistantId,
                        toolCall,
                        auditContext,
                        'ai',
                        'auto_failed',
                        false,
                        riskCheck.riskSummary,
                        'ambiguous_target',
                      ),
                    );
                  } else {

                  const shouldRequireConfirmation = destructiveBlocked && (riskCheck?.requiresConfirmation ?? true);
                  if (shouldRequireConfirmation) {
                    const impact = describeToolCallImpact(toolCall);
                    finalContent = toNaturalToolPending(toolCall.name, settingsRef.current.toolFeedbackStyle);
                    setTaskSession({
                      id: taskSessionRef.current.id,
                      status: 'waiting_confirm',
                      toolName: toolCall.name,
                      updatedAt: nowIso(),
                    });
                    setPendingToolCall({
                      call: toolCall,
                      assistantMessageId: assistantId,
                      riskSummary: riskCheck?.riskSummary ?? impact.riskSummary,
                      impactPreview: riskCheck?.impactPreview ?? impact.impactPreview,
                      previewContract: buildPreviewContract(toolCall),
                      requestId: toolCall.requestId,
                      auditContext,
                    });
                  } else if (!onToolCallRef.current) {
                    finalContent = toNaturalToolFailure(toolCall.name, formatNoExecutorToolFailureDetail(), settingsRef.current.toolFeedbackStyle);
                    finalStatus = 'error';
                    finalErrorMessage = formatNoExecutorInternalError();
                    await writeToolDecisionAuditLog(
                      assistantId,
                      `auto:${toolCall.name}`,
                      `auto_failed:${toolCall.name}:no_executor`,
                      'ai',
                      toolCall.requestId,
                      buildToolDecisionAuditMetadata(
                        assistantId,
                        toolCall,
                        auditContext,
                        'ai',
                        'auto_failed',
                        false,
                        formatNoExecutorInternalError(),
                        'no_executor',
                      ),
                    );
                  } else {
                    const autoExecStart = performance.now();
                    try {
                      setTaskSession({
                        id: taskSessionRef.current.id,
                        status: 'executing',
                        toolName: toolCall.name,
                        updatedAt: nowIso(),
                      });
                      executedRequestIds.current.add(toolCall.requestId);
                      const result = await onToolCallRef.current(toolCall);
                      const autoExecDurationMs = Math.round(performance.now() - autoExecStart);
                      finalContent = result.ok
                        ? toNaturalToolSuccess(toolCall.name, result.message, settingsRef.current.toolFeedbackStyle)
                        : toNaturalToolFailure(toolCall.name, result.message, settingsRef.current.toolFeedbackStyle);
                      if (result.ok) {
                        bumpMetric('successCount');
                        // 写入会话记忆 | Update session memory on success
                        sessionMemoryRef.current = { ...sessionMemoryRef.current, lastToolName: toolCall.name };
                        const lang = typeof toolCall.arguments.language === 'string' ? toolCall.arguments.language : undefined;
                        if (lang) sessionMemoryRef.current.lastLanguage = lang;
                        const lid = typeof toolCall.arguments.layerId === 'string' ? toolCall.arguments.layerId : undefined;
                        if (lid) sessionMemoryRef.current.lastLayerId = lid;
                        persistSessionMemory(sessionMemoryRef.current);
                        // 上一轮是失败，本次成功 → 恢复 | Previous was failure, this is recovery
                        if (metricsRef.current.failureCount > 0 && taskSessionRef.current.status === 'executing') {
                          bumpMetric('recoveryCount');
                        }
                      } else {
                        finalStatus = 'error';
                        finalErrorMessage = result.message;
                        bumpMetric('failureCount');
                      }
                      await writeToolDecisionAuditLog(
                        assistantId,
                        `auto:${toolCall.name}`,
                        `${result.ok ? 'auto_confirmed' : 'auto_failed'}:${toolCall.name}`,
                        'ai',
                        toolCall.requestId,
                        buildToolDecisionAuditMetadata(
                          assistantId,
                          toolCall,
                          auditContext,
                          'ai',
                          result.ok ? 'auto_confirmed' : 'auto_failed',
                          true,
                          result.message,
                          undefined,
                          autoExecDurationMs,
                        ),
                      );
                      setTaskSession({
                        id: taskSessionRef.current.id,
                        status: 'idle',
                        updatedAt: nowIso(),
                      });
                    } catch (toolError) {
                      const autoExecDurationMsErr = Math.round(performance.now() - autoExecStart);
                      const toolErrorText = toolError instanceof Error ? toolError.message : formatToolExecutionFallbackError();
                      finalContent = toNaturalToolFailure(toolCall.name, toolErrorText, settingsRef.current.toolFeedbackStyle);
                      finalStatus = 'error';
                      finalErrorMessage = toolErrorText;
                      await writeToolDecisionAuditLog(
                        assistantId,
                        `auto:${toolCall.name}`,
                        `auto_failed:${toolCall.name}:exception`,
                        'ai',
                        toolCall.requestId,
                        buildToolDecisionAuditMetadata(
                          assistantId,
                          toolCall,
                          auditContext,
                          'ai',
                          'auto_failed',
                          true,
                          toolErrorText,
                          'exception',
                          autoExecDurationMsErr,
                        ),
                      );
                      setTaskSession({
                        id: taskSessionRef.current.id,
                        status: 'idle',
                        updatedAt: nowIso(),
                      });
                    }
                  }
                  }
                }
              }
            }
          } else {
            finalContent = normalizeLegacyRiskNarration(finalContent, settingsRef.current.toolFeedbackStyle);
          }
          if (finalErrorMessage) setLastError(finalErrorMessage);
          await finalizeAssistantMessage(finalStatus, finalContent, finalErrorMessage, ragCitations, assistantReasoningContent);
          break;
        }
      }

      if (!streamFinalized && !controller.signal.aborted) {
        await finalizeAssistantMessage('done', assistantContent, undefined, ragCitations, assistantReasoningContent);
      }
    } catch (error) {
      if (controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
        if (timedOutBeforeFirstChunk) {
          const isLongThinkProvider = provider.id === 'deepseek' || provider.id === 'minimax';
          const timeoutMessage = formatFirstChunkTimeoutError(isLongThinkProvider, provider.label);
          const timeoutContent = messagesRef.current.find((msg) => msg.id === assistantId)?.content ?? '';
          await finalizeAssistantMessage('error', timeoutContent, timeoutMessage);
          setLastError(timeoutMessage);
          if (shouldTrackRemoteStatus) {
            setConnectionTestStatus('error');
            setConnectionTestMessage(timeoutMessage);
          }
          return;
        }
        if (shouldTrackRemoteStatus && !firstChunkArrived) {
          setConnectionTestStatus('idle');
          setConnectionTestMessage(null);
        }
        const abortedContent = messagesRef.current.find((msg) => msg.id === assistantId)?.content ?? '';
        await finalizeAssistantMessage('aborted', abortedContent, formatAbortedMessage());
        return;
      }

      const message = normalizeAiProviderError(error, provider.label);
      const errorContent = messagesRef.current.find((msg) => msg.id === assistantId)?.content ?? '';
      await finalizeAssistantMessage('error', errorContent, message);
      setLastError(message);
      if (shouldTrackRemoteStatus) {
        setConnectionTestStatus('error');
        setConnectionTestMessage(message);
      }
    } finally {
      if (timeoutHandle !== null && typeof window !== 'undefined') {
        window.clearTimeout(timeoutHandle);
      }
      // 仅清理当前活跃流，避免旧流覆盖新流状态 | Clean only if this stream is still the active one.
      if (abortRef.current === controller) {
        abortRef.current = null;
        setIsStreaming(false);
      }
      // Fire onMessageComplete once per stream — prefer latest stream buffer to avoid stale ref reads.
      const completionContent = assistantContent.trim().length > 0
        ? assistantContent
        : (messagesRef.current.find((m) => m.id === assistantId)?.content ?? '');
      if (completionContent) {
        onMessageCompleteRef.current?.(assistantId, completionContent);
      }
    }
  }, [allowDestructiveToolCalls, ensureConversation, firstChunkTimeoutMs, historyCharBudget, isStreaming, maxContextChars, onMessageCompleteRef, onToolCallRef, onToolRiskCheckRef, orchestrator, provider.id, provider.label, taskSessionRef, writeToolDecisionAuditLog, writeToolIntentAuditLog]);

  const clear = useCallback(() => {
    if (clearInFlightRef.current) return;
    clearInFlightRef.current = true;
    setMessages([]);
    setLastError(null);
    setPendingToolCall(null);
    setTaskSession({
      id: newMessageId('task'),
      status: 'idle',
      updatedAt: nowIso(),
    });
    void (async () => {
      try {
        const db = await getDb();
        const activeConversationId = await ensureConversation();
        await db.collections.ai_messages.removeBySelector({ conversationId: activeConversationId });
        const conversation = await db.collections.ai_conversations.findOne({ selector: { id: activeConversationId } }).exec();
        if (conversation) {
          const row = conversation.toJSON();
          await db.collections.ai_conversations.insert({
            ...row,
            updatedAt: nowIso(),
          });
        }
      } finally {
        clearInFlightRef.current = false;
      }
    })();
  }, [ensureConversation]);

  return {
    messages,
    isStreaming,
    lastError,
    send,
    stop,
    clear,
    testConnection,
    enabled: featureFlags.aiChatEnabled,
    toolDecisionMode,
    isBootstrapping,
    providerLabel: provider.label,
    settings,
    updateSettings,
    connectionTestStatus,
    connectionTestMessage,
    contextDebugSnapshot,
    pendingToolCall,
    taskSession,
    metrics,
    sessionMemory: sessionMemoryRef.current,
    confirmPendingToolCall,
    cancelPendingToolCall,
  };
}
