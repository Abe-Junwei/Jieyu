/**
 * Send-turn catch/finally: abort/timeout paths, provider errors, timer cleanup, metrics, onMessageComplete.
 */

import { normalizeAiProviderError } from '../../ai/providers/errorUtils';
import { formatAbortedMessage, formatFirstChunkTimeoutError } from '../../ai/messages';
import type { SendTurnStreamPhaseState } from './useAiChat.sendTurnStreamPhase';
import type { SendTurnPreflightContext } from './useAiChat.sendTurnPreflight';
import type { RunAiChatSendTurnArgs } from './useAiChat.sendTurn.types';
import type { AiInteractionMetrics } from './useAiChat.types';

export type SendTurnCompletionBundle = Readonly<
  Pick<
    RunAiChatSendTurnArgs,
    | 'provider'
    | 'setLastError'
    | 'setIsStreaming'
    | 'setConnectionTestStatus'
    | 'setConnectionTestMessage'
    | 'setMetrics'
    | 'messagesRef'
    | 'onMessageCompleteRef'
    | 'abortRef'
  > & {
    assistantId: string;
    controller: AbortController;
    phaseState: SendTurnStreamPhaseState;
    timedOutBeforeFirstChunk: SendTurnPreflightContext['timedOutBeforeFirstChunk'];
    shouldTrackRemoteStatus: boolean;
    timeoutHandle: SendTurnPreflightContext['timeoutHandle'];
    awaitQueuedPersistence: SendTurnPreflightContext['awaitQueuedPersistence'];
    finalizeAssistantMessage: SendTurnPreflightContext['finalizeAssistantMessage'];
    commitPrimaryStreamUsage: SendTurnPreflightContext['commitPrimaryStreamUsage'];
  }
>;

export async function handleSendTurnStreamCatch(
  bundle: SendTurnCompletionBundle,
  error: unknown,
): Promise<void> {
  const {
    controller,
    timedOutBeforeFirstChunk,
    provider,
    shouldTrackRemoteStatus,
    assistantId,
    messagesRef,
    awaitQueuedPersistence,
    finalizeAssistantMessage,
    setLastError,
    setConnectionTestStatus,
    setConnectionTestMessage,
    phaseState,
    commitPrimaryStreamUsage,
  } = bundle;

  if (controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
    if (timedOutBeforeFirstChunk.current) {
      const isLongThinkProvider = provider.id === 'deepseek' || provider.id === 'minimax';
      const timeoutMessage = formatFirstChunkTimeoutError(isLongThinkProvider, provider.label);
      const timeoutContent =
        messagesRef.current.find((msg) => msg.id === assistantId)?.content ?? '';
      await awaitQueuedPersistence();
      await finalizeAssistantMessage('error', timeoutContent, timeoutMessage);
      setLastError(timeoutMessage);
      if (shouldTrackRemoteStatus) {
        setConnectionTestStatus('error');
        setConnectionTestMessage(timeoutMessage);
      }
      return;
    }
    if (shouldTrackRemoteStatus && !phaseState.firstChunkArrived) {
      setConnectionTestStatus('idle');
      setConnectionTestMessage(null);
    }
    const abortedMsg = messagesRef.current.find((msg) => msg.id === assistantId);
    const abortedContent = abortedMsg?.content ?? '';
    commitPrimaryStreamUsage();
    await awaitQueuedPersistence();
    await finalizeAssistantMessage('aborted', abortedContent, formatAbortedMessage());
    return;
  }

  const message = normalizeAiProviderError(error, provider.label);
  const errorMsg = messagesRef.current.find((msg) => msg.id === assistantId);
  const errorContent = errorMsg?.content ?? '';
  commitPrimaryStreamUsage();
  await awaitQueuedPersistence();
  await finalizeAssistantMessage('error', errorContent, message);
  setLastError(message);
  if (shouldTrackRemoteStatus) {
    setConnectionTestStatus('error');
    setConnectionTestMessage(message);
  }
}

export function finalizeSendTurnStream(bundle: SendTurnCompletionBundle): void {
  const {
    timeoutHandle,
    abortRef,
    controller,
    setIsStreaming,
    messagesRef,
    assistantId,
    phaseState,
    commitPrimaryStreamUsage,
    setMetrics,
    onMessageCompleteRef,
  } = bundle;

  if (timeoutHandle !== null && typeof window !== 'undefined') {
    window.clearTimeout(timeoutHandle);
  }
  if (abortRef.current === controller) {
    abortRef.current = null;
    setIsStreaming(false);
  }
  const completionContent =
    messagesRef.current.find((m) => m.id === assistantId)?.content ??
    (phaseState.assistantContent.trim().length > 0 ? phaseState.assistantContent : '');
  commitPrimaryStreamUsage();
  const inputTokens = phaseState.reportedInputTokens;
  const outputTokens = phaseState.totalReportedOutputTokens;
  setMetrics((prev: AiInteractionMetrics) => ({
    ...prev,
    totalInputTokens: prev.totalInputTokens + inputTokens,
    totalOutputTokens: prev.totalOutputTokens + outputTokens,
    currentTurnTokens: inputTokens + outputTokens,
    totalInputTokensAvailable: prev.totalInputTokensAvailable || phaseState.usageObservedThisTurn,
    totalOutputTokensAvailable: prev.totalOutputTokensAvailable || phaseState.usageObservedThisTurn,
    currentTurnTokensAvailable: phaseState.usageObservedThisTurn,
  }));
  onMessageCompleteRef.current?.(assistantId, completionContent);
}
