/**
 * Opening of `useAiChat.send`: persist user+assistant rows, build history/RAG context, system prompt.
 */

import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { AiMessageCitation } from '../db';
import { getDb } from '../db';
import type { AiPromptContext, AiSessionMemoryPendingAgentLoopCheckpoint } from '../ai/chat/chatDomain.types';
import { buildConversationSummaryFromHistory, countHistoryUserTurns, estimateSummaryCoverageSimilarity, splitHistoryByRecentRounds, trimHistoryByChars, type HistoryChatMessage } from '../ai/chat/historyTrim';
import { resolveContextCharBudgets } from '../ai/chat/contextBudget';
import { buildAiSystemPrompt, buildPromptContextBlock, isAiContextDebugEnabled } from '../ai/chat/promptContext';
import { buildUserDirectivePrompt } from '../ai/chat/userDirectivePrompt';
import { resolveLocalToolRoutingPlan } from '../ai/chat/localToolSlotResolver';
import { buildSessionMemoryPromptDigest, persistSessionMemory, updateConversationSummaryMemory } from '../ai/chat/sessionMemory';
import type { EmbeddingSearchService } from '../ai/embeddings/EmbeddingSearchService';
import { featureFlags } from '../ai/config/featureFlags';
import { enrichContextWithRag } from './useAiChat.rag';
import { buildSessionMemoryDigestSuppressionRefs, maybeAppendMemoryBrokerContext } from './useAiChat.memoryBroker';
import { buildContextDebugSnapshot, logContextDebugSnapshot } from './useAiChat.debug';
import { resolveClarifyFastPathCall, type ClarifyFastPathCall } from './useAiChat.clarify';
import { buildResponsePolicyAuditMetadata, resolveAiChatResponsePolicy } from './useAiChat.responsePolicy';
import type { ResolveAiChatStreamCompletionParams } from './useAiChat.streamCompletion';
import { newMessageId, nowIso } from './useAiChat.helpers';
import { normalizeLocale, type Locale } from '../i18n';
import type { AiChatSettings } from '../ai/providers/providerCatalog';
import type {
  AiContextDebugSnapshot,
  AiInteractionMetrics,
  AiSessionMemory,
  AiSystemPersonaKey,
  AiTaskSession,
  UiChatMessage,
} from './useAiChat.types';

export interface PersistOpeningTurnAndBuildPromptContextInput {
  ensureConversation: () => Promise<string>;
  providerId: string;
  getSettings: () => AiChatSettings;
  userMsg: UiChatMessage;
  assistantId: string;
  assistantSeed: UiChatMessage;
  messagesSnapshot: UiChatMessage[];
  sessionMemoryRef: MutableRefObject<AiSessionMemory>;
  maxContextCharsOverride: number | undefined;
  historyCharBudgetOverride: number | undefined;
  getToolFeedbackLocale: () => Locale;
  getSystemPersonaKey: () => AiSystemPersonaKey;
  trimmed: string;
  resumeCheckpoint: AiSessionMemoryPendingAgentLoopCheckpoint | null | undefined;
  agentLoopSourceUserText: string;
  effectiveUserText: string;
  setContextDebugSnapshot: (snapshot: AiContextDebugSnapshot) => void;
  getPromptContext: () => AiPromptContext | null;
  getEmbeddingSearchService: () => EmbeddingSearchService | null | undefined;
  ragContextTimeoutMs: number;
  taskSession: AiTaskSession;
  setMetrics: Dispatch<SetStateAction<AiInteractionMetrics>>;
}

export interface PersistOpeningTurnAndBuildPromptContextResult {
  db: Awaited<ReturnType<typeof getDb>>;
  activeConversationId: string;
  history: HistoryChatMessage[];
  historyCharBudget: number;
  maxContextChars: number;
  aiContext: AiPromptContext | null;
  responsePolicy: ReturnType<typeof resolveAiChatResponsePolicy>;
  routingPlan: ReturnType<typeof resolveLocalToolRoutingPlan>;
  contextBlock: string;
  ragCitations: AiMessageCitation[];
  memoryRecallShape: NonNullable<ResolveAiChatStreamCompletionParams['memoryRecallShape']> | undefined;
  clarifyFastPathCall: ClarifyFastPathCall | null;
  systemPrompt: string;
}

export async function persistOpeningTurnAndBuildPromptContext(
  input: PersistOpeningTurnAndBuildPromptContextInput,
): Promise<PersistOpeningTurnAndBuildPromptContextResult> {
  const settings = input.getSettings();
  const activeConversationId = await input.ensureConversation();
  const db = await getDb();
  const userTimestamp = nowIso();
  await db.collections.ai_messages.insert({
    id: input.userMsg.id,
    conversationId: activeConversationId,
    role: 'user',
    content: input.userMsg.content,
    status: 'done',
    createdAt: userTimestamp,
    updatedAt: userTimestamp,
  });
  const assistantTimestamp = nowIso();
  await db.collections.ai_messages.insert({
    id: input.assistantId,
    conversationId: activeConversationId,
    role: 'assistant',
    content: '',
    status: 'streaming',
    ...(input.assistantSeed.generationSource !== undefined ? { generationSource: input.assistantSeed.generationSource } : {}),
    ...(input.assistantSeed.generationModel !== undefined ? { generationModel: input.assistantSeed.generationModel } : {}),
    createdAt: assistantTimestamp,
    updatedAt: assistantTimestamp,
  });

  const conversation = await db.collections.ai_conversations.findOne({ selector: { id: activeConversationId } }).exec();
  if (conversation) {
    const row = conversation.toJSON();
    await db.collections.ai_conversations.insert({
      ...row,
      providerId: input.providerId,
      model: settings.model || input.providerId,
      updatedAt: nowIso(),
    });
  }

  const pinnedMessageIds = new Set(input.sessionMemoryRef.current.pinnedMessageIds ?? []);
  const historyRaw: HistoryChatMessage[] = [...input.messagesSnapshot]
    .filter((m) => m.id !== input.userMsg.id && m.id !== input.assistantId)
    .reverse()
    .map((m) => ({
      role: m.role,
      content: m.content,
      messageId: m.id,
      ...(pinnedMessageIds.has(m.id) ? { pinned: true } : {}),
    }));
  const contextCharBudgets = await resolveContextCharBudgets({
    providerKind: settings.providerKind,
    model: settings.model,
    ...(input.maxContextCharsOverride !== undefined ? { maxContextCharsOverride: input.maxContextCharsOverride } : {}),
    ...(input.historyCharBudgetOverride !== undefined ? { historyCharBudgetOverride: input.historyCharBudgetOverride } : {}),
  });
  const historyCharBudget = contextCharBudgets.historyCharBudget;
  const maxContextChars = contextCharBudgets.maxContextChars;

  const summaryRecentRounds = 3;
  const summaryTriggerTurns = 5;
  const summaryCandidateHistory = historyRaw.filter((message) => !message.pinned);
  const { olderMessages } = splitHistoryByRecentRounds(summaryCandidateHistory, summaryRecentRounds);
  const coveredTurnTarget = countHistoryUserTurns(olderMessages);
  const previousCoveredTurns = input.sessionMemoryRef.current.summaryTurnCount ?? 0;
  if (coveredTurnTarget - previousCoveredTurns >= summaryTriggerTurns) {
    const conversationSummary = buildConversationSummaryFromHistory(
      olderMessages,
      contextCharBudgets.conversationSummaryMaxChars,
    );
    if (conversationSummary) {
      const similarityScore = estimateSummaryCoverageSimilarity(olderMessages, conversationSummary);
      input.sessionMemoryRef.current = updateConversationSummaryMemory(
        input.sessionMemoryRef.current,
        conversationSummary,
        coveredTurnTarget,
        {
          similarityScore,
          qualityWarningThreshold: 0.85,
        },
      );
      persistSessionMemory(input.sessionMemoryRef.current);
    }
  }

  const history = trimHistoryByChars(
    historyRaw,
    historyCharBudget,
    summaryRecentRounds,
    input.sessionMemoryRef.current.conversationSummary,
  );
  const basePromptContext = input.getPromptContext();
  const sessionMemoryDigest = buildSessionMemoryPromptDigest(
    input.sessionMemoryRef.current,
    contextCharBudgets.sessionMemoryDigestMaxChars,
  );
  const aiContext = sessionMemoryDigest
    ? (basePromptContext
      ? { ...basePromptContext, shortTerm: { ...basePromptContext.shortTerm, sessionMemoryDigest } }
      : { shortTerm: { sessionMemoryDigest } })
    : basePromptContext;
  const toolFeedbackLocale: Locale = normalizeLocale(input.getToolFeedbackLocale()) ?? 'zh-CN';
  const responsePolicy = resolveAiChatResponsePolicy(
    input.sessionMemoryRef.current,
    toolFeedbackLocale,
    settings.toolFeedbackStyle,
  );
  const routingPlan = resolveLocalToolRoutingPlan(
    input.agentLoopSourceUserText,
    input.sessionMemoryRef.current,
    input.sessionMemoryRef.current.toolPreferences?.defaultScope,
  );
  let contextBlock = buildPromptContextBlock(aiContext, maxContextChars);
  let ragCitations: AiMessageCitation[] = [];
  let memoryRecallShape: NonNullable<ResolveAiChatStreamCompletionParams['memoryRecallShape']> | undefined;
  if (featureFlags.aiChatRagEnabled) {
    ({
      contextBlock,
      citations: ragCitations,
      memoryRecallShape,
    } = await enrichContextWithRag({
      embeddingSearchService: input.getEmbeddingSearchService(),
      userText: input.effectiveUserText,
      contextBlock,
      ragContextTimeoutMs: input.ragContextTimeoutMs,
      maxContextChars,
      promptContext: aiContext,
    }));
  }
  contextBlock = await maybeAppendMemoryBrokerContext({
    enabled: featureFlags.aiMemoryBrokerEnabled,
    query: input.effectiveUserText,
    contextBlock,
    tokenBudget: Math.floor(contextCharBudgets.sessionMemoryDigestMaxChars / 4),
    sessionMemory: input.sessionMemoryRef.current,
    maxContextChars,
    alreadySurfacedRefs: [
      ...ragCitations.map((item) => item.refId),
      ...buildSessionMemoryDigestSuppressionRefs(input.sessionMemoryRef.current, sessionMemoryDigest),
    ],
  });
  const contextDebugEnabled = isAiContextDebugEnabled();
  const nextDebugSnapshot: AiContextDebugSnapshot = buildContextDebugSnapshot({
    enabled: contextDebugEnabled,
    persona: input.getSystemPersonaKey(),
    historyContentList: history.map((item) => item.content),
    contextBlock,
    historyCharBudget,
    maxContextChars,
    responsePolicyPreview: JSON.stringify({
      response: input.sessionMemoryRef.current.responsePreferences ?? null,
      tool: input.sessionMemoryRef.current.toolPreferences ?? null,
      safety: input.sessionMemoryRef.current.safetyPreferences ?? null,
      policy: responsePolicy,
    }),
  });
  input.setContextDebugSnapshot(nextDebugSnapshot);
  if (contextDebugEnabled) {
    logContextDebugSnapshot(nextDebugSnapshot);
  }
  const clarifyFastPathCall = input.resumeCheckpoint
    ? null
    : resolveClarifyFastPathCall({
        taskSession: input.taskSession,
        userText: input.trimmed,
        aiContext,
      });

  const systemPrompt = buildAiSystemPrompt(
    input.getSystemPersonaKey(),
    contextBlock,
    responsePolicy.style,
    routingPlan.selectedTools,
    buildUserDirectivePrompt(input.sessionMemoryRef.current),
  );
  void db.collections.audit_logs.insert({
    id: newMessageId('audit'),
    collection: 'ai_messages',
    documentId: input.assistantId,
    action: 'update',
    field: 'ai_response_policy_resolution',
    newValue: responsePolicy.locale,
    source: 'ai',
    timestamp: nowIso(),
    requestId: `${input.assistantId}_response_policy`,
    metadataJson: JSON.stringify(buildResponsePolicyAuditMetadata(responsePolicy)),
  });
  input.setMetrics((prev) => ({
    ...prev,
    currentTurnTokens: 0,
    currentTurnTokensAvailable: false,
  }));

  return {
    db,
    activeConversationId,
    history,
    historyCharBudget,
    maxContextChars,
    aiContext,
    responsePolicy,
    routingPlan,
    contextBlock,
    ragCitations,
    memoryRecallShape,
    clarifyFastPathCall,
    systemPrompt,
  };
}
