/**
 * Persist opening turn (DB + prompt context) and start the primary assistant stream + generation metadata rows.
 */

import { createAssistantStream, type AssistantStreamChunk } from './useAiChat.streamFactory';
import { persistOpeningTurnAndBuildPromptContext } from './useAiChat.sendPersistTurnAndBuildPromptContext';
import { nowIso } from './useAiChat.helpers';
import type { PersistOpeningTurnAndBuildPromptContextResult } from './useAiChat.sendPersistTurnAndBuildPromptContext';
import type { SendTurnDbConversationHolder, SendTurnPreflightContext } from './useAiChat.sendTurnPreflight';
import type { RunAiChatSendTurnArgs } from './useAiChat.sendTurn.types';
import type { UiChatMessage } from './useAiChat.types';

export type SendTurnPersistAndPrimaryStreamResult = Readonly<{
  opening: PersistOpeningTurnAndBuildPromptContextResult;
  sendTurnConversationId: string;
  stream: AsyncGenerator<AssistantStreamChunk>;
  generationSource: NonNullable<UiChatMessage['generationSource']>;
}>;

export async function runAiChatSendTurnPersistAndPrimaryStream(
  args: RunAiChatSendTurnArgs,
  preflight: SendTurnPreflightContext,
  dbConversation: SendTurnDbConversationHolder,
): Promise<SendTurnPersistAndPrimaryStreamResult> {
  const {
    ensureConversation,
    provider,
    orchestrator,
    setMessages,
    setContextDebugSnapshot,
    setMetrics,
    messagesRef,
    sessionMemoryRef,
    settingsRef,
    toolFeedbackLocaleRef,
    systemPersonaKeyRef,
    getContextRef,
    embeddingSearchServiceRef,
    ragContextTimeoutMsRef,
    taskSessionRef,
    outputTokenCap,
    maxContextCharsOverride,
    historyCharBudgetOverride,
  } = args;

  const {
    trimmed,
    resumeCheckpoint,
    agentLoopSourceUserText,
    effectiveUserText,
    userMsg,
    assistantId,
    assistantSeed,
    controller,
  } = preflight;

  const opening = await persistOpeningTurnAndBuildPromptContext({
    ensureConversation,
    providerId: provider.id,
    getSettings: () => settingsRef.current,
    userMsg,
    assistantId,
    assistantSeed,
    messagesSnapshot: messagesRef.current,
    sessionMemoryRef,
    maxContextCharsOverride,
    historyCharBudgetOverride,
    getToolFeedbackLocale: () => toolFeedbackLocaleRef.current,
    getSystemPersonaKey: () => systemPersonaKeyRef.current,
    trimmed,
    resumeCheckpoint,
    agentLoopSourceUserText,
    effectiveUserText,
    setContextDebugSnapshot,
    getPromptContext: () => getContextRef.current?.() ?? null,
    getEmbeddingSearchService: () => embeddingSearchServiceRef.current,
    ragContextTimeoutMs: ragContextTimeoutMsRef.current,
    taskSession: taskSessionRef.current,
    setMetrics,
  });
  dbConversation.dbRef = opening.db;
  dbConversation.activeConversationId = opening.activeConversationId;
  const sendTurnConversationId = opening.activeConversationId;

  const {
    stream,
    generationSource,
    generationModel,
  } = createAssistantStream({
    userText: effectiveUserText,
    clarifyFastPathCall: opening.clarifyFastPathCall,
    history: opening.history,
    orchestrator,
    systemPrompt: opening.systemPrompt,
    signal: controller.signal,
    taskSessionStatus: taskSessionRef.current.status,
    model: settingsRef.current.model,
    maxTokens: outputTokenCap,
    ...(settingsRef.current.explainModel
      ? { explainModel: settingsRef.current.explainModel }
      : {}),
  });

  setMessages((prev) => prev.map((msg) => (
    msg.id === assistantId
      ? { ...msg, generationSource, generationModel }
      : msg
  )));

  await opening.db.collections.ai_messages.update(assistantId, {
    generationSource,
    generationModel,
    updatedAt: nowIso(),
  });

  return {
    opening,
    sendTurnConversationId,
    stream,
    generationSource,
  };
}
