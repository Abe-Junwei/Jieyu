/**
 * 语音意图解析共享纯逻辑模块
 * Shared pure logic for voice intent resolution: routeIntent → LLM fallback → alias learning.
 *
 * 被 VoiceAgentService.commandBridge（Service 路径）和
 * useVoiceAgentResultHandler（Hook 路径）共同使用。
 * Used by both the Service path (commandBridge) and the Hook path (useVoiceAgentResultHandler).
 */

import type { SttResult } from './VoiceInputService.types';
import type { ActionId, VoiceIntent, VoiceSession } from './IntentRouter';
import { writeVoiceActionAudit } from './voiceActionAudit';
import type { Locale } from '../i18n';
import { t } from '../i18n';
import type { VoiceMode } from './voiceMode';
import { featureFlags, resolveAiAgentRuntimeV2Enabled } from '../ai/config/featureFlags';

/** R1：模型意图解析上限；超时后迟到结果整个丢弃 | LLM intent timeout; late results are discarded */
export const VOICE_LLM_INTENT_TIMEOUT_MS = 1500;

// ── 依赖注入接口 | Dependency injection interfaces ───────────────────────

/**
 * 意图路由核心函数依赖
 * Core intent routing function dependencies — injected to support both
 * direct import (Service) and lazy-loaded import (Hook).
 */
type VoiceAgentMode = VoiceMode;

export interface VoiceIntentResolutionDeps {
  routeIntent: (
    text: string,
    mode?: VoiceAgentMode,
    options?: {
      sttConfidence?: number;
      detectedLang?: string;
      aliasMap?: Record<string, ActionId>;
    },
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
  mode: VoiceMode;
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
  /** R1：模型解析超时，迟到结果已丢弃 | R1: LLM timed out, late result discarded */
  llmTimedOut?: boolean;
  /** R1：别名只在动作执行后学习，由分发在执行后调用 | R1: learn the alias only after execution */
  learnAliasAfterExecution?: () => Record<string, ActionId> | undefined;
}

// ── Core resolution ────────────────────────────────────────────────────────

/**
 * 核心意图解析：routeIntent → LLM 回退 → 别名学习
 * Core intent resolution: routeIntent → LLM fallback → alias learning.
 *
 * 不包含记忆模式检测（由 `runVoiceFinalSttAfterIntentResolution` 在意图解析之后统一处理）、
 * 也不包含 Hook 独有的消歧选项和 React 状态更新。
 * `VoiceSession` 单行追加见 `appendTurnToVoiceSession`（commandBridge 与 hook 共用）。
 * Excludes memory-pattern detection (handled in `runVoiceFinalSttAfterIntentResolution`) and Hook-only disambiguation / React updates.
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

  // ── Step 2: LLM 回退 | LLM fallback for chat intents in non-dictation modes ──
  let llmFallbackFailed = false;
  let llmResolvedAction = false;
  let errorMessage: string | null = null;

  const shouldResolveWithLlm = input.mode !== 'dictation';

  if (intent.type === 'chat' && shouldResolveWithLlm && input.resolveIntentWithLlm) {
    try {
      const llmRequest = input.resolveIntentWithLlm({
        text: input.result.text,
        mode: input.mode,
        session: input.session,
      });
      const fallbackIntent =
        featureFlags.aiAgentRuntimeV2Enabled || resolveAiAgentRuntimeV2Enabled()
          ? await raceVoiceLlmTimeout(llmRequest)
          : await llmRequest;
      if (fallbackIntent === VOICE_LLM_TIMED_OUT) {
        // shortcut: 超时时动作未知，用占位 actionId 记 timeout_discarded | placeholder actionId; action unknown at timeout
        void writeVoiceActionAudit({
          sessionId: input.session.id,
          actionId: 'llm_intent' as ActionId,
          decision: 'timeout_discarded',
          turnIndex: input.session.entries.length,
        }).catch(() => undefined);
        return {
          intent,
          llmFallbackFailed: true,
          llmResolvedAction: false,
          nextAliasMap: undefined,
          errorMessage: t(input.locale, 'transcription.voice.error.intentResolveFailed'),
          llmTimedOut: true,
        };
      }
      if (fallbackIntent) {
        intent = deps.refineLlmFallbackIntent(fallbackIntent, input.result);
        llmResolvedAction = intent.type === 'action';
      } else {
        llmFallbackFailed = true;
        errorMessage = t(input.locale, 'transcription.voice.error.nonDictationIntentUnrecognized');
      }
    } catch (err) {
      llmFallbackFailed = true;
      errorMessage =
        err instanceof Error
          ? err.message
          : t(input.locale, 'transcription.voice.error.intentResolveFailed');
    }
  }

  // ── Step 3: 别名学习 | Alias learning ──
  let nextAliasMap: Record<string, ActionId> | undefined;
  let learnAliasAfterExecution: VoiceIntentResolutionOutput['learnAliasAfterExecution'];
  if (llmResolvedAction && intent.type === 'action') {
    const { actionId } = intent;
    if (featureFlags.aiAgentRuntimeV2Enabled || resolveAiAgentRuntimeV2Enabled()) {
      learnAliasAfterExecution = () => {
        const learned = deps.learnVoiceIntentAlias(input.result.text, actionId);
        return learned.applied ? learned.aliasMap : undefined;
      };
    } else {
      const learned = deps.learnVoiceIntentAlias(input.result.text, actionId);
      if (learned.applied) {
        nextAliasMap = learned.aliasMap;
      }
    }
  }
  if (!llmResolvedAction && intent.type === 'action' && intent.fromAlias) {
    deps.bumpAliasUsage(input.result.text);
  }

  return {
    intent,
    llmFallbackFailed,
    llmResolvedAction,
    nextAliasMap,
    errorMessage,
    ...(learnAliasAfterExecution ? { learnAliasAfterExecution } : {}),
  };
}

const VOICE_LLM_TIMED_OUT = Symbol('voiceLlmTimedOut');

/**
 * 超时即返回标记；请求本身不重试，迟到的结果被忽略（不执行、不学别名）| late results are ignored
 * 注意：不会取消底层请求（无 AbortSignal），迟到请求仍会跑完并计费 |
 * NOTE: does NOT cancel the underlying request (no AbortSignal); it still runs to completion.
 */
async function raceVoiceLlmTimeout<T>(
  request: Promise<T>,
): Promise<T | typeof VOICE_LLM_TIMED_OUT> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<typeof VOICE_LLM_TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(VOICE_LLM_TIMED_OUT), VOICE_LLM_INTENT_TIMEOUT_MS);
  });
  try {
    return await Promise.race([request, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
