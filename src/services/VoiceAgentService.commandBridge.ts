/**
 * VoiceAgentService 命令桥接模块
 * Command bridge: STT final result → intent routing → action dispatch.
 *
 * 从 VoiceAgentService._handleSttResult 提取的核心逻辑。
 * Extracted from VoiceAgentService._handleSttResult to reduce file size.
 */

import type { SttResult } from './VoiceInputService';
import type { VoiceAgentMode, VoiceAgentServiceState } from './VoiceAgentService';
import { t, tf, type Locale } from '../i18n';
import {
  routeIntent,
  isDestructiveAction,
  shouldConfirmFuzzyAction,
  getActionLabel,
  learnVoiceIntentAlias,
  bumpAliasUsage,
  type ActionId,
  type VoiceIntent,
  type VoiceSession,
  type VoiceSessionEntry,
} from './IntentRouter';
import { refineLlmFallbackIntent } from './voiceIntentRefine';
import * as Earcon from './EarconService';
import { globalContext } from './GlobalContextService';
import { userBehaviorStore } from './UserBehaviorStore';
import { projectMemoryStore } from './ProjectMemoryStore';
import { createLogger } from '../observability/logger';
import { decodeEscapedUnicode } from '../utils/decodeEscapedUnicode';

const log = createLogger('VoiceAgentService.commandBridge');
const MEMORY_TERM_PATTERNS = [
  decodeEscapedUnicode('\\u8bb0\\u4f4f\\u8fd9\\u4e2a\\u8bcd'),
  decodeEscapedUnicode('\\u8bb0\\u4f4f\\u8fd9\\u4e2a\\u672f\\u8bed'),
  decodeEscapedUnicode('\\u6dfb\\u52a0\\u672f\\u8bed'),
] as const;
const MEMORY_PHRASE_PATTERNS = [
  decodeEscapedUnicode('\\u8bb0\\u4f4f\\u8fd9\\u4e2a\\u8868\\u8fbe'),
  decodeEscapedUnicode('\\u5e38\\u89c1\\u8bf4\\u6cd5\\u662f'),
  decodeEscapedUnicode('\\u56fa\\u5b9a\\u8bf4\\u6cd5'),
] as const;
const STRIP_REMEMBER_PATTERN = new RegExp(`${decodeEscapedUnicode('\\u8bb0\\u5f97')}.*?[${decodeEscapedUnicode('\\uff0c')},]?`);
const STRIP_REMEMBER_ALT_PATTERN = new RegExp(`${decodeEscapedUnicode('\\u8bb0\\u4f4f')}.*?[${decodeEscapedUnicode('\\uff0c')},]?`);
const STRIP_COMMON_PATTERN = new RegExp(`${decodeEscapedUnicode('\\u5e38\\u89c1')}.*?[${decodeEscapedUnicode('\\uff0c')},]?`);
const STRIP_FIXED_PATTERN = new RegExp(`${decodeEscapedUnicode('\\u56fa\\u5b9a')}.*?[${decodeEscapedUnicode('\\uff0c')},]?`);
const QUOTED_PHRASE_PATTERN = /['"»''"](.+?)['"»''"]/;

function normalizeExplanationPrefix(text: string): string {
  return text.replace(/^[，,:：\s]+/, '').trim();
}

function extractMemoryExplanation(
  text: string,
  quotedMatch: RegExpMatchArray,
  stripPatterns: readonly RegExp[],
): string {
  const quoteStart = quotedMatch.index ?? text.indexOf(quotedMatch[0]);
  const afterQuote = quoteStart >= 0
    ? normalizeExplanationPrefix(text.slice(quoteStart + quotedMatch[0].length))
    : '';
  if (afterQuote) {
    return afterQuote;
  }

  let normalized = text;
  for (const pattern of stripPatterns) {
    normalized = normalized.replace(pattern, '');
  }
  return normalizeExplanationPrefix(
    normalized
    .replace(QUOTED_PHRASE_PATTERN, '')
  );
}

// ── Types ──────────────────────────────────────────────────────────────────

/** 命令桥接上下文 | Context passed from VoiceAgentService to the bridge */
export interface CommandBridgeContext {
  mode: VoiceAgentMode;
  safeMode: boolean;
  session: VoiceSession;
  locale: Locale;
  corpusLang: string;
  intentAliasMap: Record<string, ActionId>;
  setState: (partial: Partial<VoiceAgentServiceState>) => void;
  emitStateChange: () => void;
  resolveIntentWithLlm?: (input: {
    text: string;
    mode: VoiceAgentMode;
    session: VoiceSession;
  }) => Promise<VoiceIntent | null>;
  onExecuteAction?: (actionId: ActionId, params?: { segmentIndex?: number }) => void;
  onInsertDictation?: (text: string) => void;
  onSendToAiChat?: (text: string) => void;
  onToolCall?: (call: { name: string; arguments: Record<string, unknown> }) => Promise<{ ok: boolean; message: string }>;
}

/** 桥接执行后的可变状态更新 | Mutable state mutations returned to the service */
export interface CommandBridgeMutations {
  session: VoiceSession;
  intentAliasMap: Record<string, ActionId>;
}

// ── Core dispatch ──────────────────────────────────────────────────────────

/**
 * 处理最终 STT 结果：意图路由 + LLM 回退 + 别名学习 + 动作分发
 * Handle a final STT result: intent routing → LLM fallback → alias learning → action dispatch.
 */
export async function handleFinalSttResult(
  ctx: CommandBridgeContext,
  result: SttResult,
): Promise<CommandBridgeMutations> {
  // 检测并记录记忆模式 | Detect memory patterns
  detectAndRecordMemoryPattern(result.text, ctx.corpusLang);

  ctx.setState({ interimText: '', finalText: result.text, confidence: result.confidence, agentState: 'routing' });

  let intent = routeIntent(result.text, ctx.mode, {
    sttConfidence: result.confidence,
    detectedLang: result.lang,
    aliasMap: ctx.intentAliasMap,
  });
  log.debug('routeIntent', { text: result.text, mode: ctx.mode, intentType: intent.type });

  // ── LLM 回退 | LLM fallback for chat intents ──
  let llmFallbackFailed = false;
  let llmResolvedAction = false;
  if (intent.type === 'chat' && ctx.mode === 'command' && ctx.resolveIntentWithLlm) {
    try {
      const fallbackIntent = await ctx.resolveIntentWithLlm({
        text: result.text,
        mode: ctx.mode,
        session: ctx.session,
      });
      if (fallbackIntent) {
        intent = refineLlmFallbackIntent(fallbackIntent, result);
        llmResolvedAction = intent.type === 'action';
      } else {
        llmFallbackFailed = true;
        ctx.setState({ error: t(ctx.locale, 'transcription.voice.error.commandUnrecognized') });
      }
    } catch (err) {
      llmFallbackFailed = true;
      ctx.setState({ error: err instanceof Error ? err.message : t(ctx.locale, 'transcription.voice.error.intentResolveFailed') });
    }
  }

  // ── 别名学习 | Alias learning ──
  let intentAliasMap = ctx.intentAliasMap;
  if (llmResolvedAction && intent.type === 'action') {
    const learned = learnVoiceIntentAlias(result.text, intent.actionId);
    if (learned.applied) {
      intentAliasMap = learned.aliasMap;
    }
  }
  if (!llmResolvedAction && intent.type === 'action' && intent.fromAlias) {
    bumpAliasUsage(result.text);
  }

  ctx.setState({ lastIntent: intent, agentState: llmFallbackFailed ? 'idle' : 'executing' });

  // ── 记录会话 | Record session entry ──
  const entry: VoiceSessionEntry = {
    timestamp: Date.now(),
    intent,
    sttText: result.text,
    confidence: result.confidence,
  };
  const session: VoiceSession = { ...ctx.session, entries: [...ctx.session.entries, entry] };
  ctx.emitStateChange();

  // ── 分发意图 | Dispatch by intent type ──
  switch (intent.type) {
    case 'action': {
      const needsConfirm =
        (intent.fromFuzzy && shouldConfirmFuzzyAction(intent.actionId))
        || (ctx.safeMode && isDestructiveAction(intent.actionId));
      if (needsConfirm) {
        const label = intent.fromFuzzy
          ? tf(ctx.locale, 'transcription.voice.confirmLabel.fuzzyAction', { action: getActionLabel(intent.actionId, ctx.locale) })
          : getActionLabel(intent.actionId, ctx.locale);
        ctx.setState({ pendingConfirm: { actionId: intent.actionId, label, ...(intent.fromFuzzy !== undefined && { fromFuzzy: intent.fromFuzzy }) }, agentState: 'idle' });
        Earcon.playTick();
      } else {
        ctx.onExecuteAction?.(intent.actionId, intent.params);
        Earcon.playSuccess();
        globalContext.markSessionStart();
        userBehaviorStore.recordAction({ actionId: intent.actionId, durationMs: 0, sessionId: session.id });
        ctx.setState({ agentState: 'idle' });
      }
      break;
    }
    case 'tool': {
      if (ctx.onToolCall) {
        try {
          const toolResult = await ctx.onToolCall({ name: intent.toolName, arguments: intent.params });
          if (toolResult.ok) {
            ctx.onSendToAiChat?.(tf(ctx.locale, 'transcription.voice.chatPrefix.toolSuccess', {
              toolName: intent.toolName,
              message: toolResult.message,
            }));
            Earcon.playSuccess();
          } else {
            ctx.onSendToAiChat?.(tf(ctx.locale, 'transcription.voice.chatPrefix.toolFailure', {
              toolName: intent.toolName,
              message: toolResult.message,
            }));
            Earcon.playError();
          }
        } catch (err) {
          ctx.onSendToAiChat?.(tf(ctx.locale, 'transcription.voice.chatPrefix.toolException', {
            toolName: intent.toolName,
            message: err instanceof Error ? err.message : String(err),
          }));
          Earcon.playError();
        }
      } else {
        ctx.onSendToAiChat?.(tf(ctx.locale, 'transcription.voice.chatPrefix.command', { text: intent.raw }));
        Earcon.playSuccess();
      }
      ctx.setState({ agentState: 'idle' });
      break;
    }
    case 'dictation': {
      ctx.onInsertDictation?.(intent.text ?? result.text);
      ctx.setState({ agentState: 'idle' });
      break;
    }
    case 'slot-fill': {
      ctx.onSendToAiChat?.(tf(ctx.locale, 'transcription.voice.chatPrefix.slotFill', {
        slotName: intent.slotName,
        value: intent.value,
      }));
      ctx.setState({ agentState: 'idle' });
      break;
    }
    case 'chat': {
      if (llmFallbackFailed) break;
      ctx.onSendToAiChat?.(intent.text ?? result.text);
      ctx.setState({ agentState: 'idle' });
      break;
    }
  }

  return { session, intentAliasMap };
}

// ── Memory pattern detection ───────────────────────────────────────────────

/**
 * 检测文本中的记忆模式并记录到 ProjectMemoryStore
 * Detect natural-language memory patterns in the transcript and record them
 * to ProjectMemoryStore. Currently detects:
 * - Term confirmation: "记住这个词" / "这是术语" / "添加术语"
 * - Phrase recording: "记住这个表达" / "常见说法是" / "固定说法"
 */
export function detectAndRecordMemoryPattern(text: string, corpusLang: string): void {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length < 4) return;

  const LOWER = trimmed.toLowerCase();

  // Term confirmation | 术语确认
  if (MEMORY_TERM_PATTERNS.some((pattern) => LOWER.includes(pattern))) {
    const termMatch = trimmed.match(QUOTED_PHRASE_PATTERN);
    if (termMatch) {
      const term = termMatch[1];
      const gloss = extractMemoryExplanation(trimmed, termMatch, [STRIP_REMEMBER_PATTERN, STRIP_REMEMBER_ALT_PATTERN]);
      if (term && gloss && term !== gloss) {
        void projectMemoryStore.confirmTerm(term, gloss.slice(0, 200), corpusLang);
      }
    }
  }

  // Phrase recording | 短语记录
  if (MEMORY_PHRASE_PATTERNS.some((pattern) => LOWER.includes(pattern))) {
    const phraseMatch = trimmed.match(QUOTED_PHRASE_PATTERN);
    if (phraseMatch) {
      const phrase = phraseMatch[1];
      const translation = extractMemoryExplanation(trimmed, phraseMatch, [
        STRIP_REMEMBER_ALT_PATTERN,
        STRIP_COMMON_PATTERN,
        STRIP_FIXED_PATTERN,
      ]);
      if (phrase && translation && phrase !== translation) {
        void projectMemoryStore.recordPhrase(phrase, translation.slice(0, 200), 'voice-confirmed');
      }
    }
  }
}
