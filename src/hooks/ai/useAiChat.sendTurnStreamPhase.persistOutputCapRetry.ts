/**
 * Persist slice: optional retry stream after primary output hits token cap (cost guard audit + DB meta).
 */

import { flushSync } from 'react-dom';
import { createAssistantStream } from './useAiChat.streamFactory';
import type { ChatTokenUsage } from '../../ai/providers/LLMProvider';
import { mergeTokenUsage } from '../../ai/providers/tokenUsage';
import { genRequestId } from './useAiChat.toolAudit';
import { updateAssistantRetryMeta } from './useAiChat.sendTurnPersistPhase';
import type {
  RunAiChatSendTurnStreamPhaseInput,
  SendTurnStreamPhaseState,
} from './useAiChat.sendTurnStreamPhase.types';

export async function runSendTurnStreamOutputCapRetryIfNeeded(params: {
  input: RunAiChatSendTurnStreamPhaseInput;
  phaseState: SendTurnStreamPhaseState;
}): Promise<void> {
  const { input, phaseState: s } = params;
  const {
    opening,
    controller,
    effectiveUserText,
    assistantId,
    generationSource,
    outputTokenCap,
    outputTokenRetryCap,
    orchestrator,
    queueFlushAssistantDraft,
    awaitQueuedPersistence,
    setMessages,
    writeToolDecisionAuditLog,
    settingsRef,
    taskSessionRef,
  } = input;
  const { history, systemPrompt, clarifyFastPathCall, db } = opening;

  const initialOutputTokens = s.primaryStreamUsage?.outputTokens ?? 0;
  const shouldRetry =
    generationSource === 'llm' &&
    outputTokenRetryCap > outputTokenCap &&
    initialOutputTokens >= outputTokenCap &&
    !controller.signal.aborted;
  if (!shouldRetry) return;

  const costGuardRequestId = genRequestId({
    name: 'propose_changes',
    arguments: { scope: 'cost_guard_output_cap' },
  });
  await writeToolDecisionAuditLog(
    assistantId,
    'pending:cost_guard',
    'capped:cost_guard:output_token_cap_exceeded',
    'system',
    costGuardRequestId,
  );
  await writeToolDecisionAuditLog(
    assistantId,
    'capped:cost_guard:output_token_cap_exceeded',
    'retry:cost_guard:retry_after_output_cap',
    'system',
    costGuardRequestId,
  );

  const {
    stream: retryStream,
    generationSource: retryGenerationSource,
    generationModel: retryGenerationModel,
  } = createAssistantStream({
    userText: effectiveUserText,
    clarifyFastPathCall,
    history,
    orchestrator,
    systemPrompt,
    signal: controller.signal,
    taskSessionStatus: taskSessionRef.current.status,
    model: settingsRef.current.model,
    maxTokens: outputTokenRetryCap,
    ...(settingsRef.current.explainModel ? { explainModel: settingsRef.current.explainModel } : {}),
  });

  let retryContent = '';
  let retryReasoningContent = '';
  let retryUsage: ChatTokenUsage | undefined;
  let retryError: string | null = null;
  for await (const retryChunk of retryStream) {
    if (retryChunk.error) {
      retryError = retryChunk.error;
      break;
    }
    if ((retryChunk.delta ?? '').length > 0) {
      retryContent += retryChunk.delta ?? '';
    }
    if (retryChunk.reasoningContent && retryChunk.reasoningContent.length > 0) {
      retryReasoningContent += retryChunk.reasoningContent;
    }
    if (retryChunk.usage) {
      retryUsage = mergeTokenUsage(retryUsage, retryChunk.usage);
    }
    if (retryChunk.done) {
      break;
    }
  }

  if (controller.signal.aborted || retryError) {
    await writeToolDecisionAuditLog(
      assistantId,
      'retry:cost_guard:retry_after_output_cap',
      'failed:cost_guard:retry_budget_upgrade_failed',
      'system',
      costGuardRequestId,
    );
    return;
  }

  if (retryUsage) {
    s.usageObservedThisTurn = true;
    s.reportedInputTokens += retryUsage.inputTokens ?? 0;
    s.totalReportedOutputTokens += retryUsage.outputTokens ?? 0;
  }

  s.assistantContent = retryContent;
  s.assistantReasoningContent = retryReasoningContent;
  flushSync(() => {
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === assistantId
          ? {
              ...msg,
              content: retryContent,
              reasoningContent: retryReasoningContent,
              generationSource: retryGenerationSource,
              generationModel: retryGenerationModel,
              ...(s.assistantThinking ? { thinking: false } : {}),
            }
          : msg,
      ),
    );
  });
  queueFlushAssistantDraft(s.assistantContent, true);
  await awaitQueuedPersistence();

  await updateAssistantRetryMeta(db, assistantId, retryGenerationSource, retryGenerationModel);

  await writeToolDecisionAuditLog(
    assistantId,
    'retry:cost_guard:retry_after_output_cap',
    'confirmed:cost_guard:retry_budget_upgrade',
    'system',
    costGuardRequestId,
  );
}
