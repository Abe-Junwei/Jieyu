import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLatest } from './useLatest';
import { getDb, type AiMessageCitation } from '../../db';
import { extractPdfSnippet } from '../ai/embeddings/pdfTextUtils';
import { splitPdfCitationRef } from '../utils/citationJumpUtils';
import { ChatOrchestrator } from '../ai/ChatOrchestrator';
import type { EmbeddingSearchService } from '../ai/embeddings/EmbeddingSearchService';
import { featureFlags } from '../ai/config/featureFlags';
import { normalizeAiProviderError } from '../ai/providers/errorUtils';
import { buildAiToolRequestId } from '../ai/toolRequestId';
import {
  applyAiChatSettingsPatch,
  createAiChatProvider,
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
}

export type AiChatToolName =
  | 'create_transcription_segment'
  | 'delete_transcription_segment'
  | 'clear_translation_segment'
  | 'set_transcription_text'
  | 'set_translation_text'
  | 'create_transcription_layer'
  | 'create_translation_layer'
  | 'delete_layer'
  | 'link_translation_layer'
  | 'unlink_translation_layer'
  | 'auto_gloss_utterance';

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
  '    delete_transcription_segment — ⚠️ 永久删除当前这一条句段（时间区间 + 文本全部移除，不可恢复）',
  '    clear_translation_segment    — 仅清空指定句段在某翻译层上的翻译文本（句段本身保留，仅内容变为空）',
  '  文本操作：',
  '    set_transcription_text — 写入/覆盖转写文本，需要 text，且必须提供 utteranceId',
  '    set_translation_text   — 写入/覆盖翻译文本，需要 text，且必须提供 utteranceId、layerId',
  '  层操作（layer = 整条转写层或翻译层，通常有语言归属，如"日语转写层"）：',
  '    create_transcription_layer — 新建转写层，需要 languageId，可选 alias',
  '    create_translation_layer   — 新建翻译层，需要 languageId，可选 alias、modality(text/audio/mixed)',
  '    delete_layer               — ⚠️ 删除整个转写层或翻译层（不可恢复），且必须提供 layerId',
  '    link_translation_layer     — 关联转写层与翻译层，必须提供 transcriptionLayerId/transcriptionLayerKey 与 translationLayerId/layerId',
  '    unlink_translation_layer   — 解除关联，必须提供 transcriptionLayerId/transcriptionLayerKey 与 translationLayerId/layerId',
  '  自动标注（gloss = 从词库精确匹配自动推导词义注释）：',
  '    auto_gloss_utterance       — 对目标句段的所有 token 执行词库精确匹配并自动填写 gloss，且必须提供 utteranceId',
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

function trimHistoryByChars(history: ChatMessage[], maxChars: number): ChatMessage[] {
  if (maxChars <= 0) return [];
  let usedChars = 0;
  const kept: ChatMessage[] = [];
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const msg = history[i]!;
    const messageChars = msg.content.length;
    if (messageChars > maxChars && kept.length === 0) {
      kept.push({ ...msg, content: trimTextToMax(msg.content, maxChars) });
      break;
    }
    if (usedChars + messageChars > maxChars) {
      break;
    }
    kept.push(msg);
    usedChars += messageChars;
  }
  return kept.reverse();
}

function buildPromptContextBlock(context: AiPromptContext | null | undefined, maxChars: number): string {
  if (!context) return '';

  const shortLines: string[] = [];
  const longLines: string[] = [];
  const short = context.shortTerm;
  const long = context.longTerm;

  if (short?.page) shortLines.push(`page=${short.page}`);
  if (short?.selectedUtteranceId) shortLines.push(`selectedUtteranceId=${short.selectedUtteranceId}`);
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
  if (name === 'delete_transcription_segment') return name;
  if (name === 'clear_translation_segment') return name;
  // 旧名/别名向后兼容 → 映射到新名
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
  const match = text.match(/我识别到你想执行[“\"]([^”\"]+)[”\"]/);
  if (!match) return null;
  const legacyName = match[1]?.trim() ?? '';
  const normalizedName = normalizeToolCallName(legacyName);
  if (!normalizedName) return null;
  return { name: normalizedName, arguments: {} };
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

function validateArgLayerCreate(args: Record<string, unknown>, allowModality: boolean): string | null {
  const languageId = args.languageId;
  if (typeof languageId !== 'string' || languageId.trim().length === 0) {
    return 'languageId 必须是非空字符串。';
  }
  if (isAmbiguousLanguageTarget(languageId)) {
    return 'languageId 不能是 und/unknown/auto/default，请提供明确语言。';
  }
  if (languageId.trim().length > 16) return 'languageId 长度不能超过 16。';
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
        '删除后在当前应用内不可恢复',
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
        const layerId = typeof args.layerId === 'string' ? args.layerId : '';
        const layerLabel = layerId.trim().length > 0 ? layerId : 'current-layer';
        return `将删除整层数据（目标层：${layerLabel}）`;
      },
      preview: [
        '该层下的文本会被一并移除',
        '删除后在当前应用内不可恢复',
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
};

function planToolCallTargets(
  call: AiChatToolCall,
  userText: string,
  context: AiPromptContext | null | undefined,
): ToolPlannerResult {
  const shortTerm = context?.shortTerm;
  const currentUtteranceId = getFirstNonEmptyString(shortTerm?.selectedUtteranceId);
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
    if (existing) return existing;
    if (currentUtteranceId) {
      nextCall.arguments.utteranceId = currentUtteranceId;
      return currentUtteranceId;
    }
    return '';
  };

  const cf = TOOL_STRATEGY_TABLE[call.name]?.contextFill;

  // 创建层时必须有明确 languageId，避免误创建 und 层
  // Creating layers requires a concrete languageId to avoid accidental "und" layers.
  if (requiresConcreteLanguageTarget(call.name)) {
    if (isAmbiguousLanguageTarget(nextCall.arguments.languageId)) {
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

  // translationLayerId 填充与澄清 | Fill translation layerId from context; clarify if still missing
  if (cf?.translationLayerId) {
    const layerId = getFirstNonEmptyString(nextCall.arguments.layerId);
    if (!layerId && selectedTranslationLayerId) {
      nextCall.arguments.layerId = selectedTranslationLayerId;
    }
    if (!getFirstNonEmptyString(nextCall.arguments.layerId)) {
      return { decision: 'clarify', call: nextCall, reason: 'missing-translation-layer-target' };
    }
  }

  // link/unlink 层对目标填充与澄清 | Fill both layer IDs for link ops; clarify if either is missing
  if (cf?.linkBothLayers) {
    const transcriptionLayerId = getFirstNonEmptyString(nextCall.arguments.transcriptionLayerId);
    const transcriptionLayerKey = getFirstNonEmptyString(nextCall.arguments.transcriptionLayerKey);
    if (!transcriptionLayerId && !transcriptionLayerKey && selectedTranscriptionLayerId) {
      nextCall.arguments.transcriptionLayerId = selectedTranscriptionLayerId;
    }

    const translationLayerId = getFirstNonEmptyString(nextCall.arguments.translationLayerId, nextCall.arguments.layerId);
    if (!translationLayerId && selectedTranslationLayerId) {
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
    const layerId = getFirstNonEmptyString(nextCall.arguments.layerId);
    if (!layerId) {
      const inferred = inferDeleteLayerArgumentsFromText(userText);
      nextCall.arguments = { ...nextCall.arguments, ...inferred };

      const refersCurrentLayer = /(当前|这层|该层|本层).*(层)|删除当前层|删除这层/i.test(userText);
      if (refersCurrentLayer && selectedLayerId) {
        nextCall.arguments.layerId = selectedLayerId;
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

type ToolIntentDecision = 'execute' | 'clarify' | 'ignore';

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
  return /^(这个|这个吧|就这个|它|它吧|就它|这条|该条|这一条|这个句段|该句段|这个字段|该字段)$/i.test(normalized);
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

  if (['create_transcription_segment', 'delete_transcription_segment', 'set_transcription_text', 'auto_gloss_utterance'].includes(callName)) {
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
      reversible: false,
      cascadeTypes: ['translation'],
    };
  }
  if (call.name === 'delete_layer') {
    const lid = typeof args.layerId === 'string' ? args.layerId.trim() : '';
    return {
      affectedCount: 1,
      affectedIds: lid ? [lid] : [],
      reversible: false,
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
  if (style === 'concise') return `已完成（${callName}）：${message}`;
  return `我已经按你的意思完成了这个操作（${callName}）。${message}`;
}

function toNaturalToolFailure(callName: AiChatToolName, message: string, style: AiToolFeedbackStyle): string {
  const recoveryHint = toFailureRecoveryHint(callName, message, style);
  if (style === 'concise') return `未完成（${callName}）：${message}${recoveryHint}`;
  return `我尝试执行了这个操作（${callName}），但没有成功：${message}${recoveryHint}`;
}

function toFailureRecoveryHint(callName: AiChatToolName, message: string, style: AiToolFeedbackStyle): string {
  const normalized = message.toLowerCase();
  const prefix = style === 'concise' ? '。下一步：' : '。建议下一步：';
  if (normalized.includes('缺少') || normalized.includes('missing')) {
    return `${prefix}请先选中目标，或回复“第1个/这个”确认候选对象。`;
  }
  if (normalized.includes('未找到') || normalized.includes('not found')) {
    return `${prefix}请改为提供更精确的对象名称，或直接给出明确 ID。`;
  }
  if (normalized.includes('多个') || normalized.includes('ambiguous')) {
    return `${prefix}当前目标不唯一，请回复“第1个/第2个”明确选择后继续。`;
  }
  if (callName === 'delete_layer' || callName === 'delete_transcription_segment') {
    return `${prefix}可先让我预演影响范围，再确认是否执行删除。`;
  }
  return `${prefix}你可以换一种更具体的表达重试，我会继续沿用当前上下文。`;
}

function toToolActionLabel(callName: AiChatToolName): string {
  return TOOL_STRATEGY_TABLE[callName]?.label ?? callName;
}

function toNaturalToolPending(callName: AiChatToolName, style: AiToolFeedbackStyle): string {
  const actionLabel = toToolActionLabel(callName);
  if (style === 'concise') return `待确认：${actionLabel}。该操作风险较高且不可恢复，请确认是否继续。`;
  return `你正在执行“${actionLabel}”。该操作风险较高且不可恢复，我已暂停执行，请确认是否继续。`;
}

function toNaturalToolGraySkipped(callName: AiChatToolName, style: AiToolFeedbackStyle): string {
  const actionLabel = toToolActionLabel(callName);
  if (style === 'concise') {
    return `灰度模式：已识别 ${actionLabel}，但当前只记录审计，不自动执行。`;
  }
  return `我已识别到你想执行“${actionLabel}”，但当前处于灰度模式：这次只做识别与审计记录，不会自动执行。`;
}

function toNaturalToolRollbackSkipped(callName: AiChatToolName, style: AiToolFeedbackStyle): string {
  const actionLabel = toToolActionLabel(callName);
  if (style === 'concise') {
    return `回滚模式：已关闭 ${actionLabel} 的自动执行，请改为手动操作。`;
  }
  return `我已识别到你想执行“${actionLabel}”，但工具决策链当前处于回滚模式，自动执行已关闭。请改为手动操作，或在恢复开关后重试。`;
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
  };
}

function toNaturalToolCancelled(callName: AiChatToolName, style: AiToolFeedbackStyle): string {
  if (style === 'concise') return `已取消（${callName}）。`;
  return `好的，已取消“${callName}”操作，不会对当前数据做修改。`;
}

function toNaturalNonActionFallback(userText: string): string {
  const trimmed = userText.trim();
  if (/^(你好|您好|嗨)([！!，,.。?？\s].*)?$/i.test(trimmed) || /^(hello|hi)\b/i.test(trimmed)) {
    return '你好，我在。你可以直接问我问题，也可以明确告诉我要执行的操作。';
  }
  if (/[?？]$/.test(trimmed) || /(什么意思|是什么|如何|怎么|解释|说明|why|what|how)/i.test(trimmed)) {
    return '这是一个说明或提问，我不会执行工具操作。你可以继续追问，我会直接回答你。';
  }
  return '收到，这条更像普通对话，我不会执行工具操作。你可以继续聊天，或明确描述要执行的动作。';
}

function toNaturalActionClarify(callName: AiChatToolName, style: AiToolFeedbackStyle): string {
  const actionLabel = toToolActionLabel(callName);
  if (style === 'concise') {
    return `我检测到可能的操作（${actionLabel}），但意图不够明确。请确认：1）执行该操作；2）仅做解释说明。`;
  }
  return `我看到了一个可能的操作意图（${actionLabel}），但目前还不够确定。你可以告诉我“执行这个操作”，或者说“先解释，不执行”。`;
}

const CLARIFY_TARGET_HINT_BY_REASON: Record<ToolPlannerClarifyReason, string> = {
  'missing-utterance-target': '缺少目标句段',
  'missing-translation-layer-target': '缺少目标翻译层',
  'missing-layer-link-target': '缺少目标层',
  'missing-layer-target': '缺少目标层',
  'missing-language-target': '缺少明确语言或目标层',
};

function buildClarifyCandidates(
  callName: AiChatToolName,
  reason: ToolPlannerClarifyReason | undefined,
  context: AiPromptContext | null | undefined,
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
    candidates.push({ key: '1', label: '创建中文转写层（zho）', argsPatch: { languageId: 'zho' } });
    candidates.push({ key: '2', label: '创建英文转写层（eng）', argsPatch: { languageId: 'eng' } });
  }
  return candidates;
}

function toNaturalTargetClarify(
  callName: AiChatToolName,
  reason: ToolPlannerClarifyReason | undefined,
  style: AiToolFeedbackStyle,
  candidates: AiClarifyCandidate[] = [],
): string {
  const actionLabel = toToolActionLabel(callName);
  const targetHint = reason != null ? CLARIFY_TARGET_HINT_BY_REASON[reason] ?? '缺少目标对象' : '缺少目标对象';
  const candidateText = candidates.length > 0
    ? ` 可选项：${candidates.map((item, index) => `${index + 1})${item.label}`).join('；')}。`
    : '';
  if (style === 'concise') {
    return `无法执行（${actionLabel}）：${targetHint}。请先选中目标，或直接提供对应 ID。${candidateText} 你也可以回复“第1个/这个”。`;
  }
  return `我已识别到你想执行“${actionLabel}”，但目前${targetHint}，还不能安全执行。请先选中目标，或在指令里补充对应 ID。${candidateText} 你也可以直接回复“第1个/这个”。`;
}

function normalizeLegacyRiskNarration(content: string, style: AiToolFeedbackStyle): string {
  const legacyCall = parseLegacyNarratedToolCall(content);
  if (!legacyCall) return content;
  const normalizedName = legacyCall.name;
  if (!normalizedName) return content;
  // 旧句式通常缺少可执行参数，改为澄清提示更准确 | Legacy narration often lacks executable args, so fallback to clarification.
  return toNaturalActionClarify(normalizedName, style);
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
  const sessionMemoryRef = useRef<AiSessionMemory>({});
  const bumpMetric = useCallback((key: keyof AiInteractionMetrics, delta = 1) => {
    setMetrics((prev) => ({ ...prev, [key]: prev[key] + delta }));
  }, []);
  const abortRef = useRef<AbortController | null>(null);
  const testAbortRef = useRef<AbortController | null>(null);

  const provider = useMemo(() => createAiChatProvider(settings), [settings]);
  const orchestrator = useMemo(() => new ChatOrchestrator(provider), [provider]);

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
        throw new Error('连接测试未收到有效响应内容');
      }

      setConnectionTestStatus('success');
      setConnectionTestMessage(showTesting ? `${provider.label} 连接成功` : `${provider.label} 连接正常`);
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
      model: settings.model,
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
              errorMessage: row.errorMessage ?? '会话恢复时检测到未完成响应，已标记为中断。',
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
          setLastError(error instanceof Error ? error.message : '加载历史会话失败');
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
    const existing = await db.collections.ai_messages.findOne({ selector: { id: messageId } }).exec();
    if (!existing) return;
    const row = existing.toJSON();
    await db.collections.ai_messages.insert({
      ...row,
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
        toNaturalToolFailure(call.name, '重复的工具调用已被忽略（幂等保护）', settingsRef.current.toolFeedbackStyle),
        'error',
        '重复的工具调用已被忽略',
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
          '重复的工具调用已被忽略',
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
      await applyAssistantMessageResult(
        assistantMessageId,
        toNaturalToolFailure(call.name, `参数校验失败：${argsValidationError}`, settingsRef.current.toolFeedbackStyle),
        'error',
        `参数校验失败：${argsValidationError}`,
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
          `参数校验失败：${argsValidationError}`,
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
        toNaturalToolFailure(call.name, '当前还没有接入对应的动作执行器。', settingsRef.current.toolFeedbackStyle),
        'error',
        '当前未接入动作执行器。',
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
          '当前未接入动作执行器。',
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

    try {
      executedRequestIds.current.add(call.requestId);
      const result = await onToolCallRef.current(call);
      if (result.ok) {
        bumpMetric('successCount');
        sessionMemoryRef.current = { ...sessionMemoryRef.current, lastToolName: call.name };
        const lang = typeof call.arguments.language === 'string' ? call.arguments.language : undefined;
        if (lang) sessionMemoryRef.current.lastLanguage = lang;
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
        ),
      );
      setTaskSession({
        id: taskSessionRef.current.id,
        status: 'idle',
        updatedAt: nowIso(),
      });
    } catch (error) {
      const toolErrorText = error instanceof Error ? error.message : '工具执行失败';
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
      setLastError('AI Chat 功能未启用');
      return;
    }

    if (isStreaming) {
      setLastError('上一条回复仍在生成中，请稍候或先停止后再发送。');
      return;
    }

    const trimmed = userText.trim();
    if (trimmed.length === 0) return;
    if (pendingToolCallRef.current) {
      setLastError('存在待确认的高风险工具调用，请先确认或取消后再继续。');
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
          model: settingsRef.current.model,
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
          if (ragResult.matches.length > 0) {
            // 批量反查各匹配项的原始文字 | Batch-resolve source text for each match
            const db = await getDb();
            const ragLines: string[] = [];
            for (const m of ragResult.matches) {
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
              if (!snippet) continue;
              const label = m.sourceType === 'note'
                ? '笔记参考'
                : (m.sourceType === 'utterance' ? '句段参考' : '文档参考');
              const contextTag = m.sourceType === 'note'
                ? 'NOTE_CONTEXT'
                : (m.sourceType === 'utterance' ? 'UTTERANCE_CONTEXT' : 'PDF_CONTEXT');
              ragLines.push(`[${contextTag}] ${snippet.slice(0, 300)}`);
              if (m.sourceType === 'note' || m.sourceType === 'utterance' || m.sourceType === 'pdf') {
                ragCitations.push({
                  type: m.sourceType,
                  refId: m.sourceId,
                  label,
                  snippet: snippet.slice(0, 300),
                });
              }
            }
            if (ragLines.length > 0) {
              contextBlock += `\n[RELEVANT_CONTEXT]\n${ragLines.join('\n')}`;
              // 引用去重，避免同源重复显示 | Deduplicate repeated source citations.
              const seen = new Set<string>();
              ragCitations = ragCitations.filter((item) => {
                const key = `${item.type}:${item.refId}`;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
              });
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
      const { stream } = orchestrator.sendMessage({
        history,
        userText: trimmed,
        systemPrompt: buildAiSystemPrompt(systemPersonaKeyRef.current, contextBlock),
        options: { signal: controller.signal, model: settingsRef.current.model },
      });

      let assistantReasoningContent = '';
      let assistantThinking = false;
      let streamFinalized = false;

      for await (const chunk of stream) {
        if (!firstChunkArrived) {
          firstChunkArrived = true;
          if (shouldTrackRemoteStatus && !connectionMarkedSuccess) {
            connectionMarkedSuccess = true;
            setConnectionTestStatus('success');
            setConnectionTestMessage(`${provider.label} 连接正常`);
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
            finalContent = '这次没有收到模型的有效回复，请重试一次；如果仍为空，请切换模型或检查上游服务状态。';
            finalStatus = 'error';
            finalErrorMessage = '模型返回空响应';
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

              if (intentAssessment.decision === 'ignore') {
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
                  finalContent = toNaturalToolFailure(toolCall.name, `参数校验失败：${argsValidationError}`, settingsRef.current.toolFeedbackStyle);
                  finalStatus = 'error';
                  finalErrorMessage = `参数校验失败：${argsValidationError}`;
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
                      `参数校验失败：${argsValidationError}`,
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
              finalContent = toNaturalToolFailure(toolCall.name, '重复的工具调用已被忽略（幂等保护）', settingsRef.current.toolFeedbackStyle);
              finalStatus = 'error';
              finalErrorMessage = '重复的工具调用已被忽略';
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
                  '重复的工具调用已被忽略',
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

              if (intentAssessment.decision === 'ignore') {
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
                  finalContent = toNaturalToolFailure(toolCall.name, `参数校验失败：${argsValidationError}`, settingsRef.current.toolFeedbackStyle);
                  finalStatus = 'error';
                  finalErrorMessage = `参数校验失败：${argsValidationError}`;
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
                      `参数校验失败：${argsValidationError}`,
                      'invalid_args',
                    ),
                  );
                } else {
                  const destructiveBlocked = !allowDestructiveToolCalls && isDestructiveToolCall(toolCall.name);
                  let riskCheck: AiToolRiskCheckResult | null | undefined;
                  if (destructiveBlocked && onToolRiskCheckRef.current) {
                    riskCheck = await onToolRiskCheckRef.current(toolCall);
                  }

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
                    finalContent = toNaturalToolFailure(toolCall.name, '当前还没有接入对应的动作执行器。', settingsRef.current.toolFeedbackStyle);
                    finalStatus = 'error';
                    finalErrorMessage = '当前未接入动作执行器。';
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
                        '当前未接入动作执行器。',
                        'no_executor',
                      ),
                    );
                  } else {
                    try {
                      setTaskSession({
                        id: taskSessionRef.current.id,
                        status: 'executing',
                        toolName: toolCall.name,
                        updatedAt: nowIso(),
                      });
                      executedRequestIds.current.add(toolCall.requestId);
                      const result = await onToolCallRef.current(toolCall);
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
                        ),
                      );
                      setTaskSession({
                        id: taskSessionRef.current.id,
                        status: 'idle',
                        updatedAt: nowIso(),
                      });
                    } catch (toolError) {
                      const toolErrorText = toolError instanceof Error ? toolError.message : '工具执行失败';
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
          const timeoutMessage = isLongThinkProvider
            ? `${provider.label} 思考时间较长（首包超时，已等待60秒），请稍后重试，或切换至其他模型。`
            : '上游模型响应超时（首包超时），请稍后重试或切换模型。';
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
        await finalizeAssistantMessage('aborted', abortedContent, '已中断');
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
    confirmPendingToolCall,
    cancelPendingToolCall,
  };
}
