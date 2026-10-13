/**
 * 语音意图解析之后的一致分发（与 ADR-0028 对齐：单一路径、工具真执行）
 * Unified dispatch after `resolveVoiceIntent` for production voice + VoiceAgentService tests.
 */

import * as Earcon from './EarconService';
import { getActionLabel } from './voiceIntentUi';
import { applyVoiceConfirmedPendingTelemetry } from './voiceConfirmedPendingTelemetry';
import { tf, type Locale } from '../i18n';
import type { VoiceAssistantToolCallHandler } from '../types/voiceAssistantToolCall';
import type { ActionId, VoiceIntent, VoiceSession, VoiceSessionEntry } from './IntentRouter';
import type { SttResult } from './VoiceInputService.types';
import { featureFlags, resolveAiAgentRuntimeV2Enabled } from '../ai/config/featureFlags';
import { writeVoiceActionAudit } from './voiceActionAudit';

export type { VoiceAssistantToolCallHandler } from '../types/voiceAssistantToolCall';

export interface VoiceIntentRouterDispatchGuards {
  shouldConfirmFuzzyAction: (id: ActionId) => boolean;
  isDestructiveAction: (id: ActionId) => boolean;
}

export type AgentState = 'idle' | 'listening' | 'routing' | 'executing' | 'ai-thinking';

export interface DispatchResolvedVoiceIntentInput {
  locale: Locale;
  safeMode: boolean;
  sessionId: string;
  intent: VoiceIntent;
  sttResult: SttResult;
  llmFallbackFailed: boolean;
  intentRouter: VoiceIntentRouterDispatchGuards;
  executeAction: (actionId: ActionId, params?: { segmentIndex?: number }) => void;
  sendToAiChat?: (text: string) => void;
  insertDictation?: (text: string) => void;
  /** 与 `useAiChat` / 转写页 `handleAiToolCall` 同源，实现工具真执行 */
  executeVoiceToolCall?: VoiceAssistantToolCallHandler;
  queueAiThinking: () => void;
  setError: (e: string | null) => void;
  setAgentState: (s: AgentState) => void;
  setPendingConfirm: (
    p: {
      actionId: ActionId;
      label: string;
      fromFuzzy?: boolean;
      params?: { segmentIndex?: number };
    } | null,
  ) => void;
  inputModality: 'voice' | 'text';
  /** R1：动作执行后才学别名（来自 resolveVoiceIntent）| R1: learn alias only after execution */
  learnAliasAfterExecution?: () => void;
  /** R1：本次意图由模型解析 | R1: intent came from the LLM fallback */
  llmResolvedAction?: boolean;
}

function toolArgumentsFromIntentParams(params: Record<string, string>): Record<string, unknown> {
  return { ...params };
}

/**
 * 追加一条语音回合到会话（Hook 路径与 VoiceAgentService.commandBridge 共用，避免双份 Entry 构造）。
 */
export function appendTurnToVoiceSession(
  session: VoiceSession,
  intent: VoiceIntent,
  sttResult: SttResult,
): VoiceSession {
  const entry: VoiceSessionEntry = {
    timestamp: Date.now(),
    intent,
    sttText: sttResult.text,
    confidence: sttResult.confidence,
  };
  return { ...session, entries: [...session.entries, entry] };
}

/**
 * 在 `resolveVoiceIntent` 与会话条目追加之后调用；不修改 session / 别名表。
 */
export async function dispatchResolvedVoiceIntent(
  input: DispatchResolvedVoiceIntentInput,
): Promise<void> {
  const {
    locale,
    safeMode,
    sessionId,
    intent,
    sttResult,
    llmFallbackFailed,
    intentRouter,
    executeAction,
    sendToAiChat,
    insertDictation,
    executeVoiceToolCall,
    queueAiThinking,
    setError,
    setAgentState,
    setPendingConfirm,
    inputModality,
    learnAliasAfterExecution,
    llmResolvedAction,
  } = input;
  const runtimeV2 = featureFlags.aiAgentRuntimeV2Enabled || resolveAiAgentRuntimeV2Enabled();

  if (llmFallbackFailed && intent.type === 'chat') {
    return;
  }

  switch (intent.type) {
    case 'action': {
      const needsConfirm =
        (intent.fromFuzzy && intentRouter.shouldConfirmFuzzyAction(intent.actionId)) ||
        // R1：破坏性动作一律确认，不再只在 safeMode 下 | destructive always confirms under v2
        ((runtimeV2 || safeMode) && intentRouter.isDestructiveAction(intent.actionId));
      if (needsConfirm) {
        const label = intent.fromFuzzy
          ? tf(locale, 'transcription.voice.confirmLabel.fuzzyAction', {
              action: getActionLabel(intent.actionId, locale),
            })
          : getActionLabel(intent.actionId, locale);
        if (runtimeV2 && llmResolvedAction) {
          void writeVoiceActionAudit({
            sessionId,
            actionId: intent.actionId,
            decision: 'pending',
            ...(intent.params ? { params: intent.params } : {}),
          });
        }
        setPendingConfirm({
          actionId: intent.actionId,
          label,
          ...(intent.fromFuzzy !== undefined ? { fromFuzzy: intent.fromFuzzy } : {}),
          ...(intent.params !== undefined ? { params: intent.params } : {}),
        });
        Earcon.playTick();
        setAgentState('idle');
        return;
      }
      setError(null);
      executeAction(intent.actionId, intent.params);
      learnAliasAfterExecution?.();
      if (runtimeV2 && llmResolvedAction) {
        void writeVoiceActionAudit({
          sessionId,
          actionId: intent.actionId,
          decision: 'auto_confirmed',
          ...(intent.params ? { params: intent.params } : {}),
        });
      }
      applyVoiceConfirmedPendingTelemetry({
        actionId: intent.actionId,
        sessionId,
        inputModality,
      });
      setAgentState('idle');
      return;
    }
    case 'tool': {
      // R1：语音工具调用交给聊天回合，走同一决策管线的确认、写入门禁与审计 | same pipeline as chat
      if (runtimeV2 && sendToAiChat) {
        queueAiThinking();
        sendToAiChat(intent.raw);
        return;
      }
      if (executeVoiceToolCall) {
        try {
          const toolResult = await executeVoiceToolCall({
            name: intent.toolName,
            arguments: toolArgumentsFromIntentParams(intent.params),
          });
          if (toolResult.ok) {
            sendToAiChat?.(
              tf(locale, 'transcription.voice.chatPrefix.toolSuccess', {
                toolName: intent.toolName,
                message: toolResult.message,
              }),
            );
            Earcon.playSuccess();
          } else {
            sendToAiChat?.(
              tf(locale, 'transcription.voice.chatPrefix.toolFailure', {
                toolName: intent.toolName,
                message: toolResult.message,
              }),
            );
            Earcon.playError();
          }
        } catch (err) {
          sendToAiChat?.(
            tf(locale, 'transcription.voice.chatPrefix.toolException', {
              toolName: intent.toolName,
              message: err instanceof Error ? err.message : String(err),
            }),
          );
          Earcon.playError();
        }
      } else if (sendToAiChat) {
        sendToAiChat(tf(locale, 'transcription.voice.chatPrefix.command', { text: intent.raw }));
        Earcon.playSuccess();
      }
      setAgentState('idle');
      return;
    }
    case 'dictation': {
      insertDictation?.(intent.text ?? sttResult.text);
      setAgentState('idle');
      return;
    }
    case 'slot-fill': {
      if (!sendToAiChat) {
        setAgentState('idle');
        return;
      }
      setError(null);
      queueAiThinking();
      sendToAiChat(
        tf(locale, 'transcription.voice.chatPrefix.slotFill', {
          slotName: intent.slotName,
          value: intent.value,
        }),
      );
      return;
    }
    case 'chat': {
      if (!sendToAiChat) {
        setAgentState('idle');
        return;
      }
      setError(null);
      queueAiThinking();
      sendToAiChat(intent.text ?? sttResult.text);
      return;
    }
    default: {
      setAgentState('idle');
    }
  }
}
