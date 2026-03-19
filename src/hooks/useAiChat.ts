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
import type { AiChatSettings } from '../ai/providers/providerCatalog';
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

interface UseAiChatOptions {
  onToolCall?: (call: AiChatToolCall) => Promise<AiChatToolResult> | AiChatToolResult;
  systemPersonaKey?: AiSystemPersonaKey;
  getContext?: () => AiPromptContext | null;
  maxContextChars?: number;
  historyCharBudget?: number;
  allowDestructiveToolCalls?: boolean;
  streamPersistIntervalMs?: number;
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
  'JSON 格式：{"tool_call":{"name":"<tool_name>","arguments":{...}}}',
  '可用 tool_name 及语义（严格区分，勿混用）：',
  '  句段操作（segment = 一条带时间区间的转写单元，无语言归属）：',
  '    create_transcription_segment — 在当前句段后插入新的时间区间（新建句段）',
  '    delete_transcription_segment — ⚠️ 永久删除当前这一条句段（时间区间 + 文本全部移除，不可恢复）',
  '    clear_translation_segment    — 仅清空指定句段在某翻译层上的翻译文本（句段本身保留，仅内容变为空）',
  '  文本操作：',
  '    set_transcription_text — 写入/覆盖转写文本，需要 text，可选 utteranceId',
  '    set_translation_text   — 写入/覆盖翻译文本，需要 text，可选 utteranceId、layerId',
  '  层操作（layer = 整条转写层或翻译层，通常有语言归属，如"日语转写层"）：',
  '    create_transcription_layer — 新建转写层，需要 languageId，可选 alias',
  '    create_translation_layer   — 新建翻译层，需要 languageId，可选 alias、modality(text/audio/mixed)',
  '    delete_layer               — ⚠️ 删除整个转写层或翻译层（不可恢复），可选 layerId',
  '    link_translation_layer     — 关联转写层与翻译层，可选 transcriptionLayerId/transcriptionLayerKey、translationLayerId/layerId',
  '    unlink_translation_layer   — 解除关联',
  '  自动标注（gloss = 从词库精确匹配自动推导词义注释）：',
  '    auto_gloss_utterance       — 对当前句段的所有 token 执行词库精确匹配并自动填写 gloss',
  '【命名规则】clear = 清空内容；delete = 删除实体；segment = 句段（单条）；layer = 整层（含所有句段）。',
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

function parseToolCallFromText(rawText: string): AiChatToolCall | null {
  const text = rawText.trim();
  if (text.length === 0) return null;

  const candidates: string[] = [text];
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
      riskSummary: 'Delete an entire layer and all its rows',
      impactPreview: [
        `Target layer: ${layerLabel}`,
        'All utterance texts in this layer may be removed',
        'Layer links depending on this layer may break',
      ],
    };
  }

  if (call.name === 'delete_transcription_segment') {
    const utteranceId = typeof call.arguments.utteranceId === 'string' ? call.arguments.utteranceId : '';
    const target = utteranceId.trim().length > 0 ? utteranceId : 'current-segment';
    return {
      riskSummary: 'Delete one transcription segment permanently',
      impactPreview: [
        `Target segment: ${target}`,
        'Timing range and transcription text will be removed',
        'Any linked translation row may become orphaned',
      ],
    };
  }

  return {
    riskSummary: `Execute high-risk action: ${call.name}`,
    impactPreview: ['Review arguments carefully before confirming.'],
  };
}

export function useAiChat(options?: UseAiChatOptions) {
  const onToolCall = options?.onToolCall;
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
  const onToolCallRef = useLatest(onToolCall);
  const settingsHydratedRef = useRef(false);
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
      setSettings(loaded);
      settingsHydratedRef.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !settingsHydratedRef.current) return;
    void persistAiChatSettingsSecure(settings);
  }, [settings]);

  const updateSettings = useCallback((patch: Partial<AiChatSettings>) => {
    testAbortRef.current?.abort();
    setSettings((current) => applyAiChatSettingsPatch(current, patch));
    setConnectionTestStatus('idle');
    setConnectionTestMessage(null);
  }, []);

  const testConnection = useCallback(async () => {
    testAbortRef.current?.abort();
    const controller = new AbortController();
    testAbortRef.current = controller;
    setConnectionTestStatus('testing');
    setConnectionTestMessage(null);

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
      for await (const chunk of stream) {
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

      setConnectionTestStatus('success');
      setConnectionTestMessage(`${provider.label} 连接成功`);
    } catch (error) {
      if (controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
        setConnectionTestStatus('idle');
        setConnectionTestMessage(null);
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
    abortRef.current?.abort();
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
      source: 'human',
      timestamp: nowIso(),
    });
  }, []);

  const confirmPendingToolCall = useCallback(async () => {
    const pending = pendingToolCall;
    if (!pending) return;

    const { call, assistantMessageId } = pending;
    setPendingToolCall(null);

    if (!onToolCallRef.current) {
      await applyAssistantMessageResult(
        assistantMessageId,
        `已解析工具调用：${call.name}\n执行失败：当前未接入动作执行器。`,
        'error',
        '当前未接入动作执行器。',
      );
      await writeToolDecisionAuditLog(
        assistantMessageId,
        `pending:${call.name}`,
        `confirm_failed:${call.name}:no_executor`,
      );
      return;
    }

    try {
      const result = await onToolCallRef.current(call);
      await applyAssistantMessageResult(
        assistantMessageId,
        `已解析工具调用：${call.name}\n${result.ok ? '执行成功' : '执行失败'}：${result.message}`,
        result.ok ? 'done' : 'error',
        result.ok ? undefined : result.message,
      );
      await writeToolDecisionAuditLog(
        assistantMessageId,
        `pending:${call.name}`,
        `${result.ok ? 'confirmed' : 'confirm_failed'}:${call.name}`,
      );
    } catch (error) {
      const toolErrorText = error instanceof Error ? error.message : '工具执行失败';
      await applyAssistantMessageResult(
        assistantMessageId,
        `已解析工具调用：${call.name}\n执行失败：${toolErrorText}`,
        'error',
        toolErrorText,
      );
      await writeToolDecisionAuditLog(
        assistantMessageId,
        `pending:${call.name}`,
        `confirm_failed:${call.name}:exception`,
      );
    }
  }, [applyAssistantMessageResult, onToolCallRef, pendingToolCall, writeToolDecisionAuditLog]);

  const cancelPendingToolCall = useCallback(async () => {
    const pending = pendingToolCall;
    if (!pending) return;

    setPendingToolCall(null);
    await applyAssistantMessageResult(
      pending.assistantMessageId,
      `已解析工具调用：${pending.call.name}\n执行已取消：你已手动取消该高风险操作。`,
    );

    await writeToolDecisionAuditLog(
      pending.assistantMessageId,
      `pending:${pending.call.name}`,
      `cancelled:${pending.call.name}`,
    );
  }, [applyAssistantMessageResult, pendingToolCall, writeToolDecisionAuditLog]);

  const send = useCallback(async (userText: string) => {
    if (!featureFlags.aiChatEnabled) {
      setLastError('AI Chat 功能未启用');
      return;
    }

    const trimmed = userText.trim();
    if (trimmed.length === 0) return;

    setLastError(null);
    setPendingToolCall(null);
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
                ? `note:${m.sourceId}`
                : (m.sourceType === 'utterance' ? `utt:${m.sourceId}` : `pdf:${m.sourceId}`);
              ragLines.push(`[${label}] ${snippet.slice(0, 300)}`);
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
        if (chunk.error) {
          const errorText = chunk.error;
          streamFinalized = true;
          await finalizeAssistantMessage('error', assistantContent, errorText, ragCitations);
          setLastError(errorText);
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
          const toolCall = parseToolCallFromText(assistantContent);
          if (toolCall) {
            if (!allowDestructiveToolCalls && isDestructiveToolCall(toolCall.name)) {
              const impact = describeToolCallImpact(toolCall);
              finalContent = `已解析工具调用：${toolCall.name}\n执行待确认：该操作属于高风险删除动作，请手动确认或取消。`;
              setPendingToolCall({
                call: toolCall,
                assistantMessageId: assistantId,
                riskSummary: impact.riskSummary,
                impactPreview: impact.impactPreview,
              });
            } else if (!onToolCallRef.current) {
              finalContent = `已解析工具调用：${toolCall.name}\n执行失败：当前未接入动作执行器。`;
              finalStatus = 'error';
              finalErrorMessage = '当前未接入动作执行器。';
              await writeToolDecisionAuditLog(assistantId, `auto:${toolCall.name}`, `auto_failed:${toolCall.name}:no_executor`);
            } else {
              try {
                const result = await onToolCallRef.current(toolCall);
                finalContent = `已解析工具调用：${toolCall.name}\n${result.ok ? '执行成功' : '执行失败'}：${result.message}`;
                if (!result.ok) {
                  finalStatus = 'error';
                  finalErrorMessage = result.message;
                }
                await writeToolDecisionAuditLog(assistantId, `auto:${toolCall.name}`, `${result.ok ? 'auto_confirmed' : 'auto_failed'}:${toolCall.name}`);
              } catch (toolError) {
                const toolErrorText = toolError instanceof Error ? toolError.message : '工具执行失败';
                finalContent = `已解析工具调用：${toolCall.name}\n执行失败：${toolErrorText}`;
                finalStatus = 'error';
                finalErrorMessage = toolErrorText;
                await writeToolDecisionAuditLog(assistantId, `auto:${toolCall.name}`, `auto_failed:${toolCall.name}:exception`);
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
        await finalizeAssistantMessage('aborted', messagesRef.current.find((msg) => msg.id === assistantId)?.content ?? '', '已中断');
        return;
      }

      const message = normalizeAiProviderError(error, provider.label);
      await finalizeAssistantMessage('error', messagesRef.current.find((msg) => msg.id === assistantId)?.content ?? '', message);
      setLastError(message);
    } finally {
      abortRef.current = null;
      setIsStreaming(false);
    }
  }, [allowDestructiveToolCalls, embeddingSearchService, ensureConversation, getContext, historyCharBudget, maxContextChars, orchestrator, provider.id, settings.model, streamPersistIntervalMs]);

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
