/**
 * 语音意图解析共享纯逻辑模块
 * Shared pure logic for voice intent resolution: routeIntent → LLM fallback → alias learning.
 *
 * 被 VoiceAgentService.commandBridge（Service 路径）和
 * useVoiceAgentResultHandler（Hook 路径）共同使用。
 * Used by both the Service path (commandBridge) and the Hook path (useVoiceAgentResultHandler).
 */

import type { SttResult } from './VoiceInputService';
import type { ActionId, VoiceIntent, VoiceSession } from './IntentRouter';
import type { Locale } from '../i18n';
import { t } from '../i18n';

// ── 依赖注入接口 | Dependency injection interfaces ───────────────────────

/**
 * 意图路由核心函数依赖
 * Core intent routing function dependencies — injected to support both
 * direct import (Service) and lazy-loaded import (Hook).
 */
type VoiceAgentMode = 'command' | 'dictation' | 'analysis';

export interface VoiceIntentResolutionDeps {
  routeIntent: (
    text: string,
    mode?: VoiceAgentMode,
    options?: { sttConfidence?: number; detectedLang?: string; aliasMap?: Record<string, ActionId> },
  ) => VoiceIntent;
  learnVoiceIntentAlias: (
    phrase: string,
    actionId: ActionId,
  ) => { applied: boolean; aliasMap: Record<string, ActionId> };
  bumpAliasUsage: (phrase: string) => void;
  refineLlmFallbackIntent: (intent: VoiceIntent, sttResult: SttResult) => VoiceIntent;
}

export interface VoiceIntentResolutionInput {
  result: SttResult;
  mode: 'command' | 'dictation' | 'analysis';
  session: VoiceSession;
  aliasMap: Record<string, ActionId>;
  locale: Locale;
  resolveIntentWithLlm?: (input: {
    text: string;
    mode: VoiceAgentMode;
    session: VoiceSession;
  }) => Promise<VoiceIntent | null>;
}

export interface VoiceIntentResolutionOutput {
  intent: VoiceIntent;
  llmFallbackFailed: boolean;
  llmResolvedAction: boolean;
  nextAliasMap: Record<string, ActionId> | undefined;
  /** 错误信息（LLM 回退失败时设置） | Error message (set when LLM fallback fails) */
  errorMessage: string | null;
}

// ── Core resolution ────────────────────────────────────────────────────────

/**
 * 核心意图解析：routeIntent → LLM 回退 → 别名学习
 * Core intent resolution: routeIntent → LLM fallback → alias learning.
 *
 * 不包含 Service 独有的混合意图门控和记忆模式检测，
 * 也不包含 Hook 独有的消歧选项和 React 状态更新。
 * Excludes Service-only hybrid intent gate and memory pattern detection,
 * and Hook-only disambiguation options and React state updates.
 */
export async function resolveVoiceIntent(
  deps: VoiceIntentResolutionDeps,
  input: VoiceIntentResolutionInput,
): Promise<VoiceIntentResolutionOutput> {
  // ── Step 1: 基础意图路由 | Route intent from STT text ──
  let intent = deps.routeIntent(input.result.text, input.mode, {
    sttConfidence: input.result.confidence,
    detectedLang: input.result.lang,
    aliasMap: input.aliasMap,
  });

  // ── Step 2: LLM 回退 | LLM fallback for chat intents in command mode ──
  let llmFallbackFailed = false;
  let llmResolvedAction = false;
  let errorMessage: string | null = null;

  if (intent.type === 'chat' && input.mode === 'command' && input.resolveIntentWithLlm) {
    try {
      const fallbackIntent = await input.resolveIntentWithLlm({
        text: input.result.text,
        mode: input.mode,
        session: input.session,
      });
      if (fallbackIntent) {
        intent = deps.refineLlmFallbackIntent(fallbackIntent, input.result);
        llmResolvedAction = intent.type === 'action';
      } else {
        llmFallbackFailed = true;
        errorMessage = t(input.locale, 'transcription.voice.error.commandUnrecognized');
      }
    } catch (err) {
      llmFallbackFailed = true;
      errorMessage = err instanceof Error
        ? err.message
        : t(input.locale, 'transcription.voice.error.intentResolveFailed');
    }
  }

  // ── Step 3: 别名学习 | Alias learning ──
  let nextAliasMap: Record<string, ActionId> | undefined;
  if (llmResolvedAction && intent.type === 'action') {
    const learned = deps.learnVoiceIntentAlias(input.result.text, intent.actionId);
    if (learned.applied) {
      nextAliasMap = learned.aliasMap;
    }
  }
  if (!llmResolvedAction && intent.type === 'action' && intent.fromAlias) {
    deps.bumpAliasUsage(input.result.text);
  }

  return { intent, llmFallbackFailed, llmResolvedAction, nextAliasMap, errorMessage };
}
