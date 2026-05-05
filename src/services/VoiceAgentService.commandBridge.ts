/**
 * VoiceAgentService 命令桥接模块
 * Command bridge: STT final result → intent routing → action dispatch.
 *
 * 从 VoiceAgentService._handleSttResult 提取的核心逻辑。
 * Extracted from VoiceAgentService._handleSttResult to reduce file size.
 */

import type { SttResult } from './VoiceInputService.types';
import type { VoiceAgentMode, VoiceAgentServiceState } from './VoiceAgentService.types';
import type { Locale } from '../i18n';
import { routeIntent, isDestructiveAction, shouldConfirmFuzzyAction, learnVoiceIntentAlias, bumpAliasUsage, type ActionId, type VoiceIntent, type VoiceSession } from './IntentRouter';
import { refineLlmFallbackIntent } from './voiceIntentRefine';
import { resolveVoiceIntent } from './voiceIntentResolution';
import { runVoiceFinalSttAfterIntentResolution } from './assistantVoiceSttOrchestrate';
import { createLogger } from '../observability/logger';

export { detectAndRecordMemoryPattern } from './voiceMemoryPattern';

const log = createLogger('VoiceAgentService.commandBridge');

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

/** Fields VoiceAgentService supplies before `handleFinalSttResult` (ADR-0028 thin edge). */
export type CommandBridgeContextFields = Pick<
  CommandBridgeContext,
  'mode' | 'safeMode' | 'session' | 'locale' | 'corpusLang' | 'intentAliasMap' | 'setState' | 'emitStateChange'
> &
  Partial<
    Pick<
      CommandBridgeContext,
      | 'resolveIntentWithLlm'
      | 'onExecuteAction'
      | 'onInsertDictation'
      | 'onSendToAiChat'
      | 'onToolCall'
    >
  >;

/** Assemble bridge context from service / test fields (construct + delegate). */
export function buildCommandBridgeContext(input: CommandBridgeContextFields): CommandBridgeContext {
  return {
    mode: input.mode,
    safeMode: input.safeMode,
    session: input.session,
    locale: input.locale,
    corpusLang: input.corpusLang,
    intentAliasMap: input.intentAliasMap,
    setState: input.setState,
    emitStateChange: input.emitStateChange,
    ...(input.resolveIntentWithLlm !== undefined && { resolveIntentWithLlm: input.resolveIntentWithLlm }),
    ...(input.onExecuteAction !== undefined && { onExecuteAction: input.onExecuteAction }),
    ...(input.onInsertDictation !== undefined && { onInsertDictation: input.onInsertDictation }),
    ...(input.onSendToAiChat !== undefined && { onSendToAiChat: input.onSendToAiChat }),
    ...(input.onToolCall !== undefined && { onToolCall: input.onToolCall }),
  };
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
  ctx.setState({ interimText: '', finalText: result.text, confidence: result.confidence, agentState: 'routing' });

  const resolutionResult = await resolveVoiceIntent(
    { routeIntent, learnVoiceIntentAlias, bumpAliasUsage, refineLlmFallbackIntent },
    {
      result,
      mode: ctx.mode,
      session: ctx.session,
      aliasMap: ctx.intentAliasMap,
      locale: ctx.locale,
      ...(ctx.resolveIntentWithLlm !== undefined && { resolveIntentWithLlm: ctx.resolveIntentWithLlm }),
    },
  );
  const { intent, llmFallbackFailed, nextAliasMap, errorMessage: resolutionError } = resolutionResult;
  log.debug('resolveVoiceIntent', { text: result.text, mode: ctx.mode, intentType: intent.type });
  if (resolutionError) {
    ctx.setState({ error: resolutionError });
  }
  const intentAliasMap = nextAliasMap ?? ctx.intentAliasMap;

  const { session } = await runVoiceFinalSttAfterIntentResolution({
    corpusLang: ctx.corpusLang,
    baseSession: ctx.session,
    intent,
    sttResult: result,
    llmFallbackFailed,
    afterIntentResolved: () => {
      ctx.setState({ lastIntent: intent, agentState: llmFallbackFailed ? 'idle' : 'executing' });
    },
    commitAppendedSession: () => {
      ctx.emitStateChange();
    },
    locale: ctx.locale,
    safeMode: ctx.safeMode,
    intentRouter: { shouldConfirmFuzzyAction, isDestructiveAction },
    executeAction: (id, p) => {
      ctx.onExecuteAction?.(id, p);
    },
    ...(ctx.onSendToAiChat !== undefined ? { sendToAiChat: ctx.onSendToAiChat } : {}),
    ...(ctx.onInsertDictation !== undefined ? { insertDictation: ctx.onInsertDictation } : {}),
    ...(ctx.onToolCall !== undefined ? { executeVoiceToolCall: ctx.onToolCall } : {}),
    queueAiThinking: () => {
      ctx.setState({ agentState: 'ai-thinking' });
    },
    setError: (e) => {
      ctx.setState({ error: e });
    },
    setAgentState: (s) => {
      ctx.setState({ agentState: s });
    },
    setPendingConfirm: (p) => {
      ctx.setState({ pendingConfirm: p });
    },
    inputModality: 'voice',
  });

  return { session, intentAliasMap };
}
