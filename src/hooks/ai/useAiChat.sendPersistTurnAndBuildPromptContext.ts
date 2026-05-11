/**
 * Opening of `useAiChat.send`: persist user+assistant rows, build history/RAG context, system prompt.
 */

import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { AiMessageCitation } from '../../db';
import { getDb } from '../../db';
import type {
  AiPromptContext,
  AiSessionMemoryPendingAgentLoopCheckpoint,
} from '../../ai/chat/chatDomain.types';
import {
  buildConversationSummaryFromHistory,
  countHistoryUserTurns,
  estimateSummaryCoverageSimilarity,
  splitHistoryByRecentRounds,
  trimHistoryByChars,
  type HistoryChatMessage,
} from '../../ai/chat/historyTrim';
import { resolveContextCharBudgets } from '../../ai/chat/contextBudget';
import {
  buildAiSystemPrompt,
  buildPromptContextBlock,
  isAiContextDebugEnabled,
} from '../../ai/chat/promptContext';
import { buildUserDirectivePrompt } from '../../ai/chat/userDirectivePrompt';
import { resolveLocalToolRoutingPlan } from '../../ai/chat/localToolSlotResolver';
import {
  buildSessionMemoryPromptDigest,
  persistSessionMemory,
  updateConversationSummaryMemory,
} from '../../ai/chat/sessionMemory';
import type { EmbeddingSearchService } from '../../ai/embeddings/EmbeddingSearchService';
import { featureFlags } from '../../ai/config/featureFlags';
import { enrichContextWithRag } from './useAiChat.rag';
import {
  buildSessionMemoryDigestSuppressionRefs,
  maybeAppendMemoryBrokerContext,
} from './useAiChat.memoryBroker';
import { buildContextDebugSnapshot, logContextDebugSnapshot } from './useAiChat.debug';
import { resolveClarifyFastPathCall, type ClarifyFastPathCall } from './useAiChat.clarify';
import {
  buildResponsePolicyAuditMetadata,
  resolveAiChatResponsePolicy,
} from './useAiChat.responsePolicy';
import type { ResolveAiChatStreamCompletionParams } from './useAiChat.streamCompletion';
import { newMessageId, nowIso } from './useAiChat.helpers';
import { persistUserMessage, persistAssistantPlaceholder } from './useAiChat.sendTurnPersistPhase';
import { normalizeLocale, type Locale } from '../../i18n';
import {
  ragCandidateSourceIdsForSegmentQa,
  resolveCorpusSourceSet,
  ragCitationsToEvidencePackets,
} from '../../ai/vertical/sourceResolver';
import {
  buildVerticalWorkflowOutputEnvelopeV0,
  type VerticalWorkflowOutputEnvelopeV0,
  type VerticalWorkflowSelectionV0,
} from '../../ai/vertical/verticalWorkflowSelection';
import {
  ANNOTATION_QA_THEN_LEXEME_CANDIDATES,
  buildComposedWorkflowSystemPromptAppendix,
} from '../../ai/vertical/composedWorkflowTemplates';
import { buildElanFlexCompatibilitySystemPrompt } from '../../ai/vertical/elanFlexCompatibilityWorkflow';
import type { AiChatSettings } from '../../ai/providers/providerCatalog';
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
  verticalWorkflowSelection: VerticalWorkflowSelectionV0 | null;
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
  memoryRecallShape:
    | NonNullable<ResolveAiChatStreamCompletionParams['memoryRecallShape']>
    | undefined;
  clarifyFastPathCall: ClarifyFastPathCall | null;
  systemPrompt: string;
  verticalOutputEnvelopeSeed: VerticalWorkflowOutputEnvelopeV0 | null;
}

export async function persistOpeningTurnAndBuildPromptContext(
  input: PersistOpeningTurnAndBuildPromptContextInput,
): Promise<PersistOpeningTurnAndBuildPromptContextResult> {
  const settings = input.getSettings();
  const activeConversationId = await input.ensureConversation();
  const db = await getDb();
  const userTimestamp = nowIso();
  await persistUserMessage(db, {
    id: input.userMsg.id,
    conversationId: activeConversationId,
    content: input.userMsg.content,
    timestamp: userTimestamp,
  });
  const assistantTimestamp = nowIso();
  await persistAssistantPlaceholder(db, {
    id: input.assistantId,
    conversationId: activeConversationId,
    generationSource: input.assistantSeed.generationSource,
    generationModel: input.assistantSeed.generationModel,
    timestamp: assistantTimestamp,
  });

  const conversation = await db.collections.ai_conversations
    .findOne({ selector: { id: activeConversationId } })
    .exec();
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
    ...(input.maxContextCharsOverride !== undefined
      ? { maxContextCharsOverride: input.maxContextCharsOverride }
      : {}),
    ...(input.historyCharBudgetOverride !== undefined
      ? { historyCharBudgetOverride: input.historyCharBudgetOverride }
      : {}),
  });
  const historyCharBudget = contextCharBudgets.historyCharBudget;
  const maxContextChars = contextCharBudgets.maxContextChars;

  const summaryRecentRounds = 3;
  const summaryTriggerTurns = 5;
  const summaryCandidateHistory = historyRaw.filter((message) => !message.pinned);
  const { olderMessages } = splitHistoryByRecentRounds(
    summaryCandidateHistory,
    summaryRecentRounds,
  );
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
    ? basePromptContext
      ? { ...basePromptContext, shortTerm: { ...basePromptContext.shortTerm, sessionMemoryDigest } }
      : { shortTerm: { sessionMemoryDigest } }
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
  let memoryRecallShape:
    | NonNullable<ResolveAiChatStreamCompletionParams['memoryRecallShape']>
    | undefined;
  const corpusSourceSetResolved = resolveCorpusSourceSet(aiContext);
  const ragCandidateSourceIds = ragCandidateSourceIdsForSegmentQa(
    input.verticalWorkflowSelection?.workflowId,
    corpusSourceSetResolved,
  );
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
      ...(ragCandidateSourceIds ? { candidateSourceIds: ragCandidateSourceIds } : {}),
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
      ...buildSessionMemoryDigestSuppressionRefs(
        input.sessionMemoryRef.current,
        sessionMemoryDigest,
      ),
    ],
  });

  // P5: inject active source set id into evidence packets for traceability
  const activeSourceSetId = input.sessionMemoryRef.current.activeSourceSetId;
  const evidencePacketsWithSourceSet = ragCitationsToEvidencePackets(
    ragCitations,
    corpusSourceSetResolved,
  );
  if (activeSourceSetId && evidencePacketsWithSourceSet.length > 0) {
    for (const packet of evidencePacketsWithSourceSet) {
      packet.sourceSetId = activeSourceSetId;
    }
  }

  const verticalOutputEnvelopeSeed: VerticalWorkflowOutputEnvelopeV0 | null =
    input.verticalWorkflowSelection
      ? buildVerticalWorkflowOutputEnvelopeV0(
          input.verticalWorkflowSelection,
          evidencePacketsWithSourceSet,
        )
      : null;

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

  let systemPrompt = buildAiSystemPrompt(
    input.getSystemPersonaKey(),
    contextBlock,
    responsePolicy.style,
    routingPlan.selectedTools,
    buildUserDirectivePrompt(input.sessionMemoryRef.current),
  );

  // PR-7b: explicit EvidencePacket list for vertical workflows (esp. segment_qa) so the model can ground [n] markers.
  if (input.verticalWorkflowSelection && ragCitations.length > 0) {
    const evidenceForPrompt = ragCitationsToEvidencePackets(ragCitations, corpusSourceSetResolved);
    if (evidenceForPrompt.length > 0) {
      const compact = evidenceForPrompt.map((p) => ({
        id: p.id,
        sourceType: p.sourceType,
        sourceId: p.sourceId,
        quote: p.quote,
        confidence: p.confidence,
        reasonCode: p.reasonCode,
        ...(p.timeRangeMs ? { timeRangeMs: p.timeRangeMs } : {}),
      }));
      systemPrompt += `\n\n## Evidence packets (ground truth for citations)\nUse only citation markers [1]…[${compact.length}] that refer to these packets. Do not invent sources.\n${JSON.stringify(compact, null, 2)}`;
    }
  }

  const composedState = input.sessionMemoryRef.current.composedWorkflowState;
  if (composedState?.templateId === ANNOTATION_QA_THEN_LEXEME_CANDIDATES.id) {
    const appendix = buildComposedWorkflowSystemPromptAppendix(
      ANNOTATION_QA_THEN_LEXEME_CANDIDATES,
      composedState.currentStepIndex,
      composedState.stepResults.step1,
    );
    if (appendix) {
      systemPrompt += '\n\n' + appendix;
    }
  }

  // P5: elan_flex_compatibility workflow system prompt appendix
  if (input.verticalWorkflowSelection?.workflowId === 'elan_flex_compatibility') {
    systemPrompt += '\n\n' + buildElanFlexCompatibilitySystemPrompt();
  }
  db.collections.audit_logs
    .insert({
      id: newMessageId('audit'),
      collection: 'ai_messages',
      documentId: input.assistantId,
      action: 'update',
      field: 'ai_response_policy_resolution',
      oldValue: '',
      newValue: responsePolicy.locale,
      source: 'ai',
      timestamp: nowIso(),
      requestId: `${input.assistantId}_response_policy`,
      metadataJson: JSON.stringify(buildResponsePolicyAuditMetadata(responsePolicy)),
    })
    .catch(() => {
      // 审计写入失败不阻断主流程 | Do not block the main flow when audit write fails.
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
    verticalOutputEnvelopeSeed,
  };
}
