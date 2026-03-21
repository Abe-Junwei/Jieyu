import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLatest } from './useLatest';
import { getDb, type AiMessageCitation } from '../../db';
import { extractPdfSnippet } from '../ai/embeddings/pdfTextUtils';
import { splitPdfCitationRef } from '../utils/citationJumpUtils';
import { ChatOrchestrator } from '../ai/ChatOrchestrator';
import type { EmbeddingSearchService } from '../ai/embeddings/EmbeddingSearchService';
import { featureFlags } from '../ai/config/featureFlags';
import { normalizeAiProviderError } from '../ai/providers/errorUtils';
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
}

export type AiConnectionTestStatus = 'idle' | 'testing' | 'success' | 'error';

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

export interface AiChatToolCall {
  name: AiChatToolName;
  arguments: Record<string, unknown>;
}

export interface AiChatToolResult {
  ok: boolean;
  message: string;
}

export interface PendingAiToolCall {
  call: AiChatToolCall;
  assistantMessageId: string;
  riskSummary?: string;
  impactPreview?: string[];
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
  embeddingSearchService?: EmbeddingSearchService;
}

function normalizeStreamPersistInterval(input: number | undefined): number {
  if (!Number.isFinite(input)) return 120;
  return Math.min(1000, Math.max(16, Math.floor(input ?? 120)));
}

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
  if (!Number.isFinite(input)) return 25000;
  return Math.min(120000, Math.max(1000, Math.floor(input ?? 25000)));
}

function normalizeAutoProbeIntervalMs(input: number | undefined): number {
  if (!Number.isFinite(input)) return 8000;
  return Math.min(60000, Math.max(3000, Math.floor(input ?? 8000)));
}

export type AiSystemPersonaKey = 'transcription' | 'glossing' | 'review';

export interface AiShortTermContext {
  page?: string;
  selectedUtteranceId?: string;
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

function enrichToolCallWithUserText(call: AiChatToolCall, userText: string): AiChatToolCall {
  if (call.name !== 'delete_layer') return call;
  const layerId = String(call.arguments.layerId ?? '').trim();
  if (layerId.length > 0) return call;

  const normalizedText = userText.trim();
  if (!normalizedText) return call;

  let layerType: 'translation' | 'transcription' | undefined;
  if (/(翻译层|译文层)/i.test(normalizedText)) layerType = 'translation';
  if (/(转写层|转录层|听写层)/i.test(normalizedText)) layerType = 'transcription';

  const languageQueryMatch = normalizedText.match(/删除\s*(.+?)\s*(?:翻译层|译文层|转写层|转录层|听写层|层)/i);
  const languageQuery = languageQueryMatch?.[1]?.trim();

  if (!layerType && !languageQuery) return call;
  return {
    ...call,
    arguments: {
      ...call.arguments,
      ...(layerType && { layerType }),
      ...(languageQuery ? { languageQuery } : {}),
    },
  };
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

function assessToolActionIntent(userText: string): ToolIntentAssessment {
  const trimmed = userText.trim();
  const normalized = trimmed.toLowerCase();
  if (!normalized || normalized.length <= 2 || /^[\p{P}\p{S}\s]+$/u.test(normalized)) {
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
  const executionCuePattern = /(请帮|请把|请将|帮我|把|将|给我|执行|run|do|please|麻烦|帮忙|可否|可以把)/i;
  const actionVerbPattern = /(创建|新建|新增|切分|拆分|删除|清空|移除|写入|填写|填入|设置|设为|修改|改成|改为|更新|覆盖|替换|关联|链接|解除|断开|自动标注|转写|翻译|create|add|insert|split|delete|remove|clear|set|update|replace|link|unlink|gloss)/i;
  const actionTargetPattern = /(句段|段落|segment|层|layer|转写|翻译|文本|text|gloss|词义|utterance)/i;
  const explicitIdPattern = /(utteranceId|layerId|transcriptionLayerId|translationLayerId|\bu\d+\b|\blayer[-_a-z0-9]+\b)/i;

  let score = 0;
  const hasExecutionCue = executionCuePattern.test(trimmed);
  const hasActionVerb = actionVerbPattern.test(trimmed);
  const hasActionTarget = actionTargetPattern.test(trimmed);
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

const DESTRUCTIVE_TOOL_NAMES: ReadonlySet<AiChatToolName> = new Set([
  'delete_layer',
  'delete_transcription_segment',
]);

function isDestructiveToolCall(name: AiChatToolName): boolean {
  return DESTRUCTIVE_TOOL_NAMES.has(name);
}

function describeToolCallImpact(call: AiChatToolCall): { riskSummary: string; impactPreview: string[] } {
  if (call.name === 'delete_layer') {
    const layerId = typeof call.arguments.layerId === 'string' ? call.arguments.layerId : '';
    const layerLabel = layerId.trim().length > 0 ? layerId : 'current-layer';
    return {
      riskSummary: `将删除整层数据（目标层：${layerLabel}）`,
      impactPreview: [
        '该层下的文本会被一并移除',
        '删除后在当前应用内不可恢复',
        '与该层相关的链接/对齐关系可能失效',
      ],
    };
  }

  if (call.name === 'delete_transcription_segment') {
    const utteranceId = typeof call.arguments.utteranceId === 'string' ? call.arguments.utteranceId : '';
    const target = utteranceId.trim().length > 0 ? utteranceId : 'current-segment';
    return {
      riskSummary: `将删除 1 条句段（目标：${target}）`,
      impactPreview: [
        '该句段的时间范围与转写文本会被清除',
        '删除后在当前应用内不可恢复',
        '关联翻译可能变为空引用',
      ],
    };
  }

  return {
    riskSummary: `该操作会修改数据：${call.name}`,
    impactPreview: ['请确认目标与影响后再继续。'],
  };
}

const TOOL_ARG_MAX_ID_LENGTH = 128;
const TOOL_ARG_MAX_TEXT_LENGTH = 5000;

function validateToolCallArguments(call: AiChatToolCall): string | null {
  const args = call.arguments ?? {};

  const validateOptionalId = (key: string): string | null => {
    if (!(key in args)) return null;
    const value = args[key];
    if (typeof value !== 'string') return `${key} 必须是字符串。`;
    const trimmed = value.trim();
    if (trimmed.length === 0) return `${key} 不能为空。`;
    if (trimmed.length > TOOL_ARG_MAX_ID_LENGTH) return `${key} 长度不能超过 ${TOOL_ARG_MAX_ID_LENGTH}。`;
    return null;
  };

  const validateRequiredId = (key: string): string | null => {
    if (!(key in args)) return `缺少 ${key}。`;
    return validateOptionalId(key);
  };

  const validateText = (): string | null => {
    const value = args.text;
    if (typeof value !== 'string') return 'text 必须是字符串。';
    const trimmed = value.trim();
    if (trimmed.length === 0) return 'text 不能为空。';
    if (trimmed.length > TOOL_ARG_MAX_TEXT_LENGTH) return `text 长度不能超过 ${TOOL_ARG_MAX_TEXT_LENGTH}。`;
    return null;
  };

  switch (call.name) {
    case 'set_transcription_text': {
      return validateText() ?? validateRequiredId('utteranceId');
    }
    case 'set_translation_text': {
      return validateText() ?? validateRequiredId('utteranceId') ?? validateRequiredId('layerId');
    }
    case 'clear_translation_segment': {
      return validateRequiredId('utteranceId') ?? validateRequiredId('layerId');
    }
    case 'delete_transcription_segment': {
      return validateRequiredId('utteranceId');
    }
    case 'delete_layer': {
      const layerIdValidation = validateOptionalId('layerId');
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
      if (languageQuery.trim().length > 32) {
        return 'languageQuery 长度不能超过 32。';
      }

      return null;
    }
    case 'create_transcription_layer':
    case 'create_translation_layer': {
      const languageId = args.languageId;
      if (typeof languageId !== 'string' || languageId.trim().length === 0) {
        return 'languageId 必须是非空字符串。';
      }
      if (languageId.trim().length > 16) {
        return 'languageId 长度不能超过 16。';
      }
      if ('alias' in args) {
        const alias = args.alias;
        if (typeof alias !== 'string') return 'alias 必须是字符串。';
        if (alias.trim().length > 64) return 'alias 长度不能超过 64。';
      }
      if (call.name === 'create_translation_layer' && 'modality' in args) {
        const modality = args.modality;
        if (typeof modality !== 'string') return 'modality 必须是字符串。';
        if (!['text', 'audio', 'mixed'].includes(modality.trim().toLowerCase())) {
          return 'modality 必须是 text/audio/mixed 之一。';
        }
      }
      return null;
    }
    case 'link_translation_layer':
    case 'unlink_translation_layer': {
      if (!('transcriptionLayerId' in args) && !('transcriptionLayerKey' in args)) {
        return '缺少 transcriptionLayerId/transcriptionLayerKey。';
      }
      if (!('translationLayerId' in args) && !('layerId' in args)) {
        return '缺少 translationLayerId/layerId。';
      }
      return validateOptionalId('transcriptionLayerId')
        ?? validateOptionalId('transcriptionLayerKey')
        ?? validateOptionalId('translationLayerId')
        ?? validateOptionalId('layerId');
    }
    case 'create_transcription_segment':
    case 'auto_gloss_utterance': {
      return validateRequiredId('utteranceId');
    }
    default:
      return null;
  }
}

function toNaturalToolSuccess(callName: AiChatToolName, message: string, style: AiToolFeedbackStyle): string {
  if (style === 'concise') return `已完成（${callName}）：${message}`;
  return `我已经按你的意思完成了这个操作（${callName}）。${message}`;
}

function toNaturalToolFailure(callName: AiChatToolName, message: string, style: AiToolFeedbackStyle): string {
  if (style === 'concise') return `未完成（${callName}）：${message}`;
  return `我尝试执行了这个操作（${callName}），但没有成功：${message}`;
}

function toNaturalToolPending(callName: AiChatToolName, style: AiToolFeedbackStyle): string {
  if (style === 'concise') return `待确认（${callName}）：该操作风险较高，请先确认。`;
  return `我识别到你想执行“${callName}”。这个操作风险较高，我先暂停，等你确认后再继续。`;
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
  if (style === 'concise') {
    return `我检测到可能的操作（${callName}），但意图不够明确。请确认：1）执行该操作；2）仅做解释说明。`;
  }
  return `我看到了一个可能的操作意图（${callName}），但目前还不够确定。你可以告诉我“执行这个操作”，或者说“先解释，不执行”。`;
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
  const autoProbeIntervalMs = normalizeAutoProbeIntervalMs(undefined);
  const onToolCallRef = useLatest(onToolCall);
  const onToolRiskCheckRef = useLatest(onToolRiskCheck);
  const onMessageCompleteRef = useLatest(options?.onMessageComplete);
  const settingsHydratedRef = useRef(false);
  // 用户是否在水合完成前手动改过设置 | Whether user patched settings before hydration finished
  const userDirtyRef = useRef(false);
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
  const abortRef = useRef<AbortController | null>(null);
  const testAbortRef = useRef<AbortController | null>(null);

  const provider = useMemo(() => createAiChatProvider(settings), [settings]);
  const orchestrator = useMemo(() => new ChatOrchestrator(provider), [provider]);

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
        if (chunk.delta.trim().length > 0) {
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
        const history = (await db.collections.ai_messages.findByIndex('conversationId', latest.id))
          .map((doc) => doc.toJSON())
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
          .map((row) => ({
            id: row.id,
            role: row.role === 'assistant' ? 'assistant' : 'user',
            content: row.content,
            status: row.status,
            ...(row.errorMessage ? { error: row.errorMessage } : {}),
            ...(row.citations ? { citations: row.citations } : {}),
          } as UiChatMessage));

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

  const writeToolDecisionAuditLog = useCallback(async (
    assistantMessageId: string,
    oldValue: string,
    newValue: string,
    source: 'human' | 'ai',
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
    });
  }, []);

  const writeToolIntentAuditLog = useCallback(async (
    assistantMessageId: string,
    callName: AiChatToolName,
    assessment: ToolIntentAssessment,
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
    });
  }, []);

  const confirmPendingToolCall = useCallback(async () => {
    const pending = pendingToolCall;
    if (!pending) return;

    const { call, assistantMessageId } = pending;
    setPendingToolCall(null);

    const argsValidationError = validateToolCallArguments(call);
    if (argsValidationError) {
      await applyAssistantMessageResult(
        assistantMessageId,
        toNaturalToolFailure(call.name, `参数校验失败：${argsValidationError}`, settings.toolFeedbackStyle),
        'error',
        `参数校验失败：${argsValidationError}`,
      );
      await writeToolDecisionAuditLog(
        assistantMessageId,
        `pending:${call.name}`,
        `confirm_failed:${call.name}:invalid_args`,
        'human',
      );
      return;
    }

    if (!onToolCallRef.current) {
      await applyAssistantMessageResult(
        assistantMessageId,
        toNaturalToolFailure(call.name, '当前还没有接入对应的动作执行器。', settings.toolFeedbackStyle),
        'error',
        '当前未接入动作执行器。',
      );
      await writeToolDecisionAuditLog(
        assistantMessageId,
        `pending:${call.name}`,
        `confirm_failed:${call.name}:no_executor`,
        'human',
      );
      return;
    }

    try {
      const result = await onToolCallRef.current(call);
      await applyAssistantMessageResult(
        assistantMessageId,
        result.ok
          ? toNaturalToolSuccess(call.name, result.message, settings.toolFeedbackStyle)
          : toNaturalToolFailure(call.name, result.message, settings.toolFeedbackStyle),
        result.ok ? 'done' : 'error',
        result.ok ? undefined : result.message,
      );
      await writeToolDecisionAuditLog(
        assistantMessageId,
        `pending:${call.name}`,
        `${result.ok ? 'confirmed' : 'confirm_failed'}:${call.name}`,
        'human',
      );
    } catch (error) {
      const toolErrorText = error instanceof Error ? error.message : '工具执行失败';
      await applyAssistantMessageResult(
        assistantMessageId,
        toNaturalToolFailure(call.name, toolErrorText, settings.toolFeedbackStyle),
        'error',
        toolErrorText,
      );
      await writeToolDecisionAuditLog(
        assistantMessageId,
        `pending:${call.name}`,
        `confirm_failed:${call.name}:exception`,
        'human',
      );
    }
  }, [applyAssistantMessageResult, onToolCallRef, pendingToolCall, settings.toolFeedbackStyle, writeToolDecisionAuditLog]);

  const cancelPendingToolCall = useCallback(async () => {
    const pending = pendingToolCall;
    if (!pending) return;

    setPendingToolCall(null);
    await applyAssistantMessageResult(
      pending.assistantMessageId,
      toNaturalToolCancelled(pending.call.name, settings.toolFeedbackStyle),
    );

    await writeToolDecisionAuditLog(
      pending.assistantMessageId,
      `pending:${pending.call.name}`,
      `cancelled:${pending.call.name}`,
      'human',
    );
  }, [applyAssistantMessageResult, pendingToolCall, settings.toolFeedbackStyle, writeToolDecisionAuditLog]);

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
    if (pendingToolCall) {
      setLastError('存在待确认的高风险工具调用，请先确认或取消后再继续。');
      return;
    }

    setLastError(null);
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
    const enforceFirstChunkTimeout = provider.id !== 'ollama';
    const timeoutHandle = (typeof window !== 'undefined' && enforceFirstChunkTimeout)
      ? window.setTimeout(() => {
        if (firstChunkArrived || controller.signal.aborted) return;
        timedOutBeforeFirstChunk = true;
        controller.abort();
      }, firstChunkTimeoutMs)
      : null;

    const flushAssistantDraft = async (content: string, force = false): Promise<void> => {
      if (!dbRef) return;
      if (content === lastPersistedAssistantContent) return;
      const now = Date.now();
      if (!force && now - lastPersistedAt < streamPersistIntervalMs) return;

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
          };
        }
        return { ...msg, content, status, ...(citations ? { citations } : {}) };
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
          updatedAt: nowIso(),
        });
      }
      await updateConversationTimestamp();
    };

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
          model: settings.model,
          updatedAt: nowIso(),
        });
      }

      // Convert UI order (newest-first) back to chronological order for model context.
      const historyRaw: ChatMessage[] = [...messagesRef.current]
        .reverse()
        .map((m) => ({ role: m.role, content: m.content }));
      const history = trimHistoryByChars(historyRaw, historyCharBudget);
      let contextBlock = buildPromptContextBlock(getContext?.() ?? null, maxContextChars);
      let ragCitations: AiMessageCitation[] = [];

      // ── Minimal RAG: inject top embedding matches as text snippets into context ──
      if (embeddingSearchService) {
        try {
          const ragResult = await embeddingSearchService.searchMultiSourceHybrid(
            trimmed,
            ['utterance', 'note', 'pdf'],
            { topK: 5, fusionScenario: 'qa' },
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
        } catch {
          // RAG is best-effort; do not block chat on embedding failures.
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
        options: { signal: controller.signal, model: settings.model },
      });

      let assistantContent = '';
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
          await finalizeAssistantMessage('error', assistantContent, errorText, ragCitations);
          setLastError(errorText);
          if (shouldTrackRemoteStatus) {
            setConnectionTestStatus('error');
            setConnectionTestMessage(errorText);
          }
          break;
        }

        if (chunk.delta.length > 0) {
          assistantContent += chunk.delta;
          setMessages((prev) => prev.map((msg) => (
            msg.id === assistantId
              ? { ...msg, content: msg.content + chunk.delta }
              : msg
          )));
          await flushAssistantDraft(assistantContent);
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
            await finalizeAssistantMessage(finalStatus, finalContent, finalErrorMessage, ragCitations);
            break;
          }

          const parsedToolCall = parseToolCallFromText(assistantContent);
          const toolCall = parsedToolCall ? enrichToolCallWithUserText(parsedToolCall, trimmed) : null;
          if (toolCall) {
            const intentAssessment = assessToolActionIntent(trimmed);
            await writeToolIntentAuditLog(assistantId, toolCall.name, intentAssessment);

            if (intentAssessment.decision === 'ignore') {
              finalContent = toNaturalNonActionFallback(trimmed);
            } else if (intentAssessment.decision === 'clarify') {
              finalContent = toNaturalActionClarify(toolCall.name, settings.toolFeedbackStyle);
            } else {
              const argsValidationError = validateToolCallArguments(toolCall);
              if (argsValidationError) {
                finalContent = toNaturalToolFailure(toolCall.name, `参数校验失败：${argsValidationError}`, settings.toolFeedbackStyle);
                finalStatus = 'error';
                finalErrorMessage = `参数校验失败：${argsValidationError}`;
                await writeToolDecisionAuditLog(assistantId, `auto:${toolCall.name}`, `auto_failed:${toolCall.name}:invalid_args`, 'ai');
              } else {
                const destructiveBlocked = !allowDestructiveToolCalls && isDestructiveToolCall(toolCall.name);
                let riskCheck: AiToolRiskCheckResult | null | undefined;
                if (destructiveBlocked && onToolRiskCheckRef.current) {
                  riskCheck = await onToolRiskCheckRef.current(toolCall);
                }

                const shouldRequireConfirmation = destructiveBlocked && (riskCheck?.requiresConfirmation ?? true);
                if (shouldRequireConfirmation) {
                  const impact = describeToolCallImpact(toolCall);
                  finalContent = toNaturalToolPending(toolCall.name, settings.toolFeedbackStyle);
                  setPendingToolCall({
                    call: toolCall,
                    assistantMessageId: assistantId,
                    riskSummary: riskCheck?.riskSummary ?? impact.riskSummary,
                    impactPreview: riskCheck?.impactPreview ?? impact.impactPreview,
                  });
                } else if (!onToolCallRef.current) {
                  finalContent = toNaturalToolFailure(toolCall.name, '当前还没有接入对应的动作执行器。', settings.toolFeedbackStyle);
                  finalStatus = 'error';
                  finalErrorMessage = '当前未接入动作执行器。';
                  await writeToolDecisionAuditLog(assistantId, `auto:${toolCall.name}`, `auto_failed:${toolCall.name}:no_executor`, 'ai');
                } else {
                  try {
                    const result = await onToolCallRef.current(toolCall);
                    finalContent = result.ok
                      ? toNaturalToolSuccess(toolCall.name, result.message, settings.toolFeedbackStyle)
                      : toNaturalToolFailure(toolCall.name, result.message, settings.toolFeedbackStyle);
                    if (!result.ok) {
                      finalStatus = 'error';
                      finalErrorMessage = result.message;
                    }
                    await writeToolDecisionAuditLog(assistantId, `auto:${toolCall.name}`, `${result.ok ? 'auto_confirmed' : 'auto_failed'}:${toolCall.name}`, 'ai');
                  } catch (toolError) {
                    const toolErrorText = toolError instanceof Error ? toolError.message : '工具执行失败';
                    finalContent = toNaturalToolFailure(toolCall.name, toolErrorText, settings.toolFeedbackStyle);
                    finalStatus = 'error';
                    finalErrorMessage = toolErrorText;
                    await writeToolDecisionAuditLog(assistantId, `auto:${toolCall.name}`, `auto_failed:${toolCall.name}:exception`, 'ai');
                  }
                }
              }
            }
          }
          if (finalErrorMessage) setLastError(finalErrorMessage);
          await finalizeAssistantMessage(finalStatus, finalContent, finalErrorMessage, ragCitations);
          break;
        }
      }

      if (!streamFinalized && !controller.signal.aborted) {
        await finalizeAssistantMessage('done', assistantContent, undefined, ragCitations);
      }
    } catch (error) {
      if (controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
        if (timedOutBeforeFirstChunk) {
          const timeoutMessage = '上游模型响应超时（首包超时），请稍后重试或切换模型。';
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
      // Fire onMessageComplete once per stream — capture the latest assistant content
      const latestAssistant = messagesRef.current.find((m) => m.id === assistantId);
      if (latestAssistant?.content) {
        onMessageCompleteRef.current?.(assistantId, latestAssistant.content);
      }
    }
  }, [allowDestructiveToolCalls, embeddingSearchService, ensureConversation, firstChunkTimeoutMs, getContext, historyCharBudget, isStreaming, maxContextChars, onMessageCompleteRef, onToolCallRef, onToolRiskCheckRef, orchestrator, pendingToolCall, provider.id, provider.label, settings.model, settings.toolFeedbackStyle, streamPersistIntervalMs, writeToolDecisionAuditLog, writeToolIntentAuditLog]);

  const clear = useCallback(() => {
    setMessages([]);
    setLastError(null);
    setPendingToolCall(null);
    void (async () => {
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
    isBootstrapping,
    providerLabel: provider.label,
    settings,
    updateSettings,
    connectionTestStatus,
    connectionTestMessage,
    contextDebugSnapshot,
    pendingToolCall,
    confirmPendingToolCall,
    cancelPendingToolCall,
  };
}
