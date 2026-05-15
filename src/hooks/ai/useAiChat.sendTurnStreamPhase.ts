/**
 * Post-opening stream consumption: chunk loop, output-cap retry, stream completion, agent loop, persistence.
 */

import { flushSync } from 'react-dom';
import { formatConnectionHealthyMessage } from '../../ai/messages';
import { mergeTokenUsage } from '../../ai/providers/tokenUsage';
import { recordDurationMetric } from '../../observability/metrics';
import type { ResolveAiChatStreamCompletionParams } from './useAiChat.streamCompletion';
import { finalizeAssistantStreamCompletion } from './useAiChat.streamCompletionPhase';
import { buildSendTurnStreamCompletionEnv } from './useAiChat.sendTurnStreamPhase.completionEnv';
import { runSendTurnStreamPostCompletionPipeline } from './useAiChat.sendTurnStreamPhase.completionPipeline';
import { runSendTurnStreamOutputCapRetryIfNeeded } from './useAiChat.sendTurnStreamPhase.persistOutputCapRetry';
import type { RunAiChatSendTurnStreamPhaseInput } from './useAiChat.sendTurnStreamPhase.types';
import { writeVerticalWorkflowAuditLogForSendTurnStreamPhase } from './useAiChat.sendTurnStreamPhase.verticalAudit';

export type {
  RunAiChatSendTurnStreamPhaseInput,
  SendTurnStreamPhaseState,
} from './useAiChat.sendTurnStreamPhase.types';
export { createInitialSendTurnStreamPhaseState } from './useAiChat.sendTurnStreamPhase.types';

export async function runAiChatSendTurnStreamPhase(
  input: RunAiChatSendTurnStreamPhaseInput,
): Promise<void> {
  const {
    phaseState: s,
    opening,
    stream,
    assistantId,
    effectiveUserText,
    shouldTrackRemoteStatus,
    timeoutHandle,
    sendStartedAtMs,
    aiMetricTags,
    queueFlushAssistantDraft,
    awaitQueuedPersistence,
    finalizeAssistantMessage,
    provider,
    setLastError,
    setMessages,
    setConnectionTestStatus,
    setConnectionTestMessage,
    commitPrimaryStreamUsage,
    recordCompletionSuccessMetric,
    controller,
    verticalWorkflowSelection,
    verticalOutputEnvelopeSeed,
  } = input;

  const { aiContext, memoryRecallShape, ragCitations, db } = opening;

  const buildStreamCompletionEnv = (): Omit<
    ResolveAiChatStreamCompletionParams,
    'assistantId' | 'assistantContent' | 'userText' | 'aiContext'
  > => buildSendTurnStreamCompletionEnv(input);

  const maybeRetryAfterOutputCap = (): Promise<void> =>
    runSendTurnStreamOutputCapRetryIfNeeded({ input, phaseState: s });

  for await (const chunk of stream) {
    if (!s.firstChunkArrived) {
      s.firstChunkArrived = true;
      if (!s.firstTokenMetricRecorded) {
        s.firstTokenMetricRecorded = true;
        try {
          recordDurationMetric('ai.chat.first_token_latency_ms', sendStartedAtMs, aiMetricTags);
        } catch {
          // 忽略指标上报异常，避免影响主流程 | Ignore metric reporting errors to avoid affecting the main flow
        }
      }
      if (shouldTrackRemoteStatus && !s.connectionMarkedSuccess) {
        s.connectionMarkedSuccess = true;
        setConnectionTestStatus('success');
        setConnectionTestMessage(formatConnectionHealthyMessage(provider.label));
      }
      if (timeoutHandle !== null && typeof window !== 'undefined') {
        window.clearTimeout(timeoutHandle);
      }
    }

    if (chunk.error) {
      const errorText = chunk.error;
      s.streamFinalized = true;
      commitPrimaryStreamUsage();
      await awaitQueuedPersistence();
      await finalizeAssistantMessage(
        'error',
        s.assistantContent,
        errorText,
        ragCitations,
        s.assistantReasoningContent,
      );
      setLastError(errorText);
      if (shouldTrackRemoteStatus) {
        setConnectionTestStatus('error');
        setConnectionTestMessage(errorText);
      }
      break;
    }

    if ((chunk.delta ?? '').length > 0) {
      const delta = chunk.delta ?? '';
      s.assistantContent += delta;
      flushSync(() => {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantId
              ? {
                  ...msg,
                  content: msg.content + delta,
                  ...(s.assistantThinking ? { thinking: false } : {}),
                }
              : msg,
          ),
        );
      });
      queueFlushAssistantDraft(s.assistantContent);
    }

    if (chunk.thinking && !chunk.delta) {
      s.assistantThinking = true;
      setMessages((prev) =>
        prev.map((msg) => (msg.id === assistantId ? { ...msg, thinking: true } : msg)),
      );
    }

    if (chunk.reasoningContent && chunk.reasoningContent.length > 0) {
      s.assistantReasoningContent += chunk.reasoningContent;
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantId
            ? { ...msg, reasoningContent: (msg.reasoningContent ?? '') + chunk.reasoningContent }
            : msg,
        ),
      );
    }

    if (chunk.usage) {
      s.usageObservedThisTurn = true;
      s.primaryStreamUsage = mergeTokenUsage(s.primaryStreamUsage, chunk.usage);
    }

    if (chunk.done) {
      s.streamFinalized = true;
      await maybeRetryAfterOutputCap();
      queueFlushAssistantDraft(s.assistantContent, true);
      await awaitQueuedPersistence();
      commitPrimaryStreamUsage();
      const {
        finalContent,
        finalStatus,
        finalErrorMessage,
        connectionErrorMessage,
        localToolResults,
      } = await finalizeAssistantStreamCompletion(
        {
          assistantId,
          assistantContent: s.assistantContent,
          userText: effectiveUserText,
          aiContext,
          ...(memoryRecallShape ? { memoryRecallShape } : {}),
        },
        buildStreamCompletionEnv(),
      );

      const streamCompletionResult = {
        finalContent,
        finalStatus,
        ...(finalErrorMessage !== undefined ? { finalErrorMessage } : {}),
        ...(connectionErrorMessage !== undefined ? { connectionErrorMessage } : {}),
        ...(localToolResults !== undefined ? { localToolResults } : {}),
        verticalWorkflowSelection,
        verticalOutputEnvelopeSeed,
      };

      await runSendTurnStreamPostCompletionPipeline({
        input,
        phaseState: s,
        streamCompletionResult,
        buildStreamCompletionEnv,
      });
      break;
    }
  }

  if (!s.streamFinalized && !controller.signal.aborted) {
    commitPrimaryStreamUsage();
    recordCompletionSuccessMetric();
    await awaitQueuedPersistence();
    await writeVerticalWorkflowAuditLogForSendTurnStreamPhase({
      db,
      assistantId,
      verticalOutputEnvelopeSeed,
      verticalWorkflowSelection,
      completionStatus: 'done',
      completionPath: 'stream_fallback',
    });
    await finalizeAssistantMessage(
      'done',
      s.assistantContent,
      undefined,
      ragCitations,
      s.assistantReasoningContent,
    );
  }
}
