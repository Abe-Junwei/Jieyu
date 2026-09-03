/**
 * Vertical quality pipeline: reflection, judges, adoption, composed workflow, background memory, finalize.
 */

import { flushSync } from 'react-dom';
import { newAuditLogId, nowIso } from './useAiChat.helpers';
import { scheduleAndFlushBackgroundMemory } from './useAiChat.backgroundMemory';
import type { DegradationScenario } from '../../ai/chat/degradationManualOverride';
import type { ComposedReflectionRetryBlob } from '../../ai/vertical/composedWorkflowTemplates';
import { runSendTurnStreamComposedWorkflowAfterVerticalQuality } from './useAiChat.sendTurnStreamPhase.completionPipelineVerticalComposedWorkflow';
import { parseCompatibilityReport } from '../../ai/vertical/elanFlexCompatibilityWorkflow';
import { dispatchVerticalWorkflowReflection } from '../../ai/vertical/verticalWorkflowReflectionDispatch';
import { getDefaultAgentCallbackRegistry } from '../../ai/runtime/agentCallbacks';
import { applyOutboundSemanticGuard } from '../../ai/security/semanticGuard';
import { createAdoptionItem } from '../../ai/vertical/adoptionQueue';
import { judgeCitationAccuracyBatch } from '../../ai/eval/citationJudge';
import { judgeRelevance } from '../../ai/eval/relevanceJudge';
import { buildSourceScopeSummaryFromEvidencePackets } from '../../ai/vertical/sourceScopeSummary';
import { buildWorkflowExplainabilityFromAssistantMessage } from '../../ai/chat/workflowExplainability';
import { reconcileVerticalWorkflowEnvelopeStatus } from '../../ai/vertical/verticalWorkflowSelection';
import { writeVerticalWorkflowAuditLogForSendTurnStreamPhase } from './useAiChat.sendTurnStreamPhase.verticalAudit';
import { createLogger } from '../../observability/logger';
import { shouldApplyStreamUiUpdate } from '../../ai/chat/conversationGeneration';
import type { UiChatMessage } from './useAiChat.types';
import type {
  RunSendTurnStreamPostCompletionPipelineArgs,
  SendTurnStreamPostAgentResolution,
} from './useAiChat.sendTurnStreamPhase.completionPipelineShared';

const log = createLogger('useAiChat.sendTurnStreamPhase.completionPipeline.verticalFinalize');

export async function runSendTurnStreamVerticalQualityAndFinalize(
  args: RunSendTurnStreamPostCompletionPipelineArgs & {
    resolution: SendTurnStreamPostAgentResolution;
  },
): Promise<void> {
  const { input, phaseState: s, streamCompletionResult, resolution } = args;
  const {
    opening,
    sendTurnConversationId,
    effectiveUserText,
    userMsg,
    assistantId,
    queueFlushAssistantDraft,
    awaitQueuedPersistence,
    finalizeAssistantMessage,
    provider,
    setMessages,
    sessionMemoryRef,
    backgroundMemoryRuntimeRef,
    onPushAdoptionItemsRef,
    recordCompletionSuccessMetric,
    conversationGenerationRef,
    streamGenerationAtStart,
  } = input;

  const { db, ragCitations } = opening;
  const { verticalOutputEnvelopeSeed, verticalWorkflowSelection } = streamCompletionResult;
  let effectiveVerticalEnvelope = verticalOutputEnvelopeSeed;
  const clientContent =
    resolution.status === 'done'
      ? await applyOutboundSemanticGuard({
          text: resolution.content,
          ...(input.agentRunId ? { agentRunId: input.agentRunId } : {}),
        })
      : resolution.content;

  // PR-12 / PR-17: reflection audit + degradation scenarios for manual takeover UX
  const degradationScenarios: DegradationScenario[] = [];
  if (effectiveVerticalEnvelope?.status === 'degraded') {
    degradationScenarios.push('rag_no_results');
  }
  // PR-P4: reflection for all vertical workflows
  let reflectionResult: {
    reflectionFlagged: boolean;
    checks: { name: string; passed: boolean }[];
    summary: string;
  } | null = null;
  let composedReflectionRetryBlob: ComposedReflectionRetryBlob | undefined;
  if (resolution.status === 'done' && verticalOutputEnvelopeSeed) {
    try {
      const dispatched = dispatchVerticalWorkflowReflection(
        verticalOutputEnvelopeSeed.workflowId,
        resolution.content,
        verticalOutputEnvelopeSeed.evidencePackets,
      );
      if (dispatched) {
        const reflection = dispatched.reflection;
        reflectionResult = reflection;
        if (dispatched.retryBlob) {
          composedReflectionRetryBlob = dispatched.retryBlob;
        }
        await db.collections.audit_logs.insert({
          id: newAuditLogId(),
          collection: 'ai_messages',
          documentId: assistantId,
          action: 'update',
          field: dispatched.auditField,
          oldValue: reflection.summary,
          newValue: reflection.reflectionFlagged ? 'flagged' : 'passed',
          source: 'ai',
          timestamp: nowIso(),
          requestId: `${assistantId}_reflection`,
          metadataJson: JSON.stringify({
            schemaVersion: 1,
            workflowId: verticalOutputEnvelopeSeed.workflowId,
            reflectionFlagged: reflection.reflectionFlagged,
            checkCount: reflection.checks.length,
            failedCheckNames: reflection.checks.filter((c) => !c.passed).map((c) => c.name),
          }),
        });
        if (reflection.reflectionFlagged) {
          degradationScenarios.push('reflection_flagged');
        }
      }
    } catch (reflectionError) {
      log.error(`${verticalOutputEnvelopeSeed?.workflowId ?? 'unknown'} reflection failed`, {
        err: reflectionError,
      });
    }
    try {
      await getDefaultAgentCallbackRegistry().run('after_model', {
        workflowId: verticalOutputEnvelopeSeed.workflowId,
        resultOk: !reflectionResult?.reflectionFlagged,
        ...(input.agentRunId ? { agentRunId: input.agentRunId } : {}),
      });
    } catch (afterModelError) {
      log.error('after_model callback failed', { err: afterModelError });
    }
  }

  if (effectiveVerticalEnvelope && reflectionResult) {
    effectiveVerticalEnvelope = reconcileVerticalWorkflowEnvelopeStatus(effectiveVerticalEnvelope, {
      reflectionFlagged: reflectionResult.reflectionFlagged,
    });
    await writeVerticalWorkflowAuditLogForSendTurnStreamPhase({
      db,
      assistantId,
      verticalOutputEnvelopeSeed: effectiveVerticalEnvelope,
      verticalWorkflowSelection,
      completionStatus: resolution.status,
      completionPath: 'stream_done',
    });
  }

  // PR-14/19: LLM-as-Judge — run citation and relevance judges on completed output
  if (resolution.status === 'done' && verticalOutputEnvelopeSeed) {
    try {
      const citationInputs = verticalOutputEnvelopeSeed.evidencePackets.map((ep) => ({
        id: ep.id,
        sourceType: ep.sourceType,
        sourceId: ep.sourceId,
        quote: ep.quote ?? '',
        confidence: ep.confidence ?? 0,
      }));
      const citationResult = judgeCitationAccuracyBatch(citationInputs);
      const relevanceResult = judgeRelevance({
        question: effectiveUserText,
        answer: resolution.content,
      });
      await db.collections.audit_logs.insert({
        id: newAuditLogId(),
        collection: 'ai_messages',
        documentId: assistantId,
        action: 'update',
        field: 'ai_citation_judge',
        oldValue: '',
        newValue: String(citationResult.averageScore),
        source: 'ai',
        timestamp: nowIso(),
        requestId: `${assistantId}_citation_judge`,
        metadataJson: JSON.stringify({
          schemaVersion: 1,
          workflowId: verticalOutputEnvelopeSeed.workflowId,
          providerId: provider.id,
          averageScore: citationResult.averageScore,
          resultCount: citationResult.results.length,
        }),
      });
      await db.collections.audit_logs.insert({
        id: newAuditLogId(),
        collection: 'ai_messages',
        documentId: assistantId,
        action: 'update',
        field: 'ai_relevance_judge',
        oldValue: '',
        newValue: String(relevanceResult.overallScore),
        source: 'ai',
        timestamp: nowIso(),
        requestId: `${assistantId}_relevance_judge`,
        metadataJson: JSON.stringify({
          schemaVersion: 1,
          workflowId: verticalOutputEnvelopeSeed.workflowId,
          providerId: provider.id,
          overallScore: relevanceResult.overallScore,
        }),
      });
    } catch (judgeError) {
      log.error('judge evaluation failed', { err: judgeError });
      try {
        await db.collections.audit_logs.insert({
          id: newAuditLogId(),
          collection: 'ai_messages',
          documentId: assistantId,
          action: 'update',
          field: 'ai_judge_failure',
          oldValue: '',
          newValue: 'failed',
          source: 'ai',
          timestamp: nowIso(),
          requestId: `${assistantId}_judge_failure`,
          metadataJson: JSON.stringify({
            schemaVersion: 1,
            workflowId: verticalOutputEnvelopeSeed?.workflowId ?? 'unknown',
            providerId: provider.id,
            error: String(judgeError),
          }),
        });
      } catch {
        // Audit write failure must not block stream completion
      }
    }
  }

  let sourceScopeSummary: UiChatMessage['sourceScopeSummary'] | undefined;
  if (resolution.status === 'done' && verticalOutputEnvelopeSeed) {
    sourceScopeSummary = buildSourceScopeSummaryFromEvidencePackets(
      verticalOutputEnvelopeSeed.evidencePackets,
    );
  }

  // P1: store reflection checks for UI quality panel
  let reflectionChecks: UiChatMessage['reflectionChecks'] | undefined;
  if (resolution.status === 'done' && verticalOutputEnvelopeSeed && reflectionResult) {
    reflectionChecks = reflectionResult.checks;
  }

  const uniqueDegradation = Array.from(new Set(degradationScenarios));
  let workflowExplainability: UiChatMessage['workflowExplainability'] | undefined;
  if (resolution.status === 'done' && verticalOutputEnvelopeSeed) {
    const dto = buildWorkflowExplainabilityFromAssistantMessage({
      degradationScenarios: uniqueDegradation,
      ...(sourceScopeSummary !== undefined ? { sourceScopeSummary } : {}),
      status: 'done',
    });
    const trivialOk = dto.headlineKey === 'ok' && !dto.hasDegradation && !dto.hasSourceScopeSummary;
    if (!trivialOk) {
      workflowExplainability = dto;
    }
  }

  // P5: parse compatibility report for elan_flex_compatibility workflow
  let compatibilityReport: UiChatMessage['compatibilityReport'] | undefined;
  const adoptionItemsToPush: import('../../ai/vertical/adoptionQueue').AdoptionItem[] = [];
  if (
    resolution.status === 'done' &&
    verticalOutputEnvelopeSeed?.workflowId === 'elan_flex_compatibility'
  ) {
    const parsed = parseCompatibilityReport(resolution.content);
    if (parsed) {
      compatibilityReport = {
        reportId: parsed.reportId,
        findings: parsed.findings.map((f) => ({
          findingId: f.findingId,
          kind: f.kind,
          severity: f.severity,
          title: f.title,
          description: f.description,
          recommendedAction: f.recommendedAction,
          evidenceCount: f.evidencePackets.length,
        })),
        summary: parsed.summary,
        exportTargets: parsed.exportTargets,
      };
      // Auto-push findings with adoptionCandidateId to AdoptionQueue
      for (const f of parsed.findings) {
        if (f.adoptionCandidateId) {
          adoptionItemsToPush.push(
            createAdoptionItem({
              workflowId: 'elan_flex_compatibility',
              requestId: f.adoptionCandidateId,
              sourceAssistantMessageId: assistantId,
              outputKind: 'compatibility_finding',
              title: f.title,
              summary: f.title,
              evidencePacketIds: f.evidencePackets.map((ep) => ep.id),
              recommendedAction: f.recommendedAction,
              writeMode: 'propose_changes',
              rawContent: f.description,
              actionLabel: f.recommendedAction,
            }),
          );
        }
      }
    }
  }

  // P4: push annotation_qa / lexeme_candidates outputs to AdoptionQueue
  if (
    resolution.status === 'done' &&
    verticalOutputEnvelopeSeed &&
    (verticalOutputEnvelopeSeed.workflowId === 'annotation_qa' ||
      verticalOutputEnvelopeSeed.workflowId === 'lexeme_candidates')
  ) {
    const evidencePacketIds = verticalOutputEnvelopeSeed.evidencePackets.map((ep) => ep.id);
    const titlePrefix =
      verticalOutputEnvelopeSeed.workflowId === 'annotation_qa'
        ? 'Annotation QA'
        : 'Lexeme Candidates';
    adoptionItemsToPush.push(
      createAdoptionItem({
        workflowId: verticalOutputEnvelopeSeed.workflowId,
        requestId: `${assistantId}:${verticalOutputEnvelopeSeed.workflowId}`,
        sourceAssistantMessageId: assistantId,
        outputKind: verticalOutputEnvelopeSeed.workflowId,
        title: `${titlePrefix} result`,
        summary: clientContent.slice(0, 200),
        evidencePacketIds,
        recommendedAction: 'review_output',
        writeMode: 'append',
        rawContent: clientContent,
        actionLabel: 'review_output',
      }),
    );
  }

  if (
    uniqueDegradation.length > 0 ||
    sourceScopeSummary !== undefined ||
    workflowExplainability !== undefined ||
    compatibilityReport !== undefined ||
    reflectionChecks !== undefined
  ) {
    flushSync(() => {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantId
            ? {
                ...msg,
                ...(uniqueDegradation.length > 0
                  ? { degradationScenarios: uniqueDegradation }
                  : {}),
                ...(sourceScopeSummary !== undefined ? { sourceScopeSummary } : {}),
                ...(workflowExplainability !== undefined ? { workflowExplainability } : {}),
                ...(compatibilityReport !== undefined ? { compatibilityReport } : {}),
                ...(reflectionChecks !== undefined ? { reflectionChecks } : {}),
              }
            : msg,
        ),
      );
    });
  }

  // Push auto-generated adoption items to queue (best-effort, non-blocking)
  if (adoptionItemsToPush.length > 0 && onPushAdoptionItemsRef?.current) {
    try {
      onPushAdoptionItemsRef.current(adoptionItemsToPush);
    } catch {
      // Queue push failure must not block stream completion.
    }
  }

  // Audit log adoption item creation
  if (adoptionItemsToPush.length > 0) {
    try {
      for (const item of adoptionItemsToPush) {
        await db.collections.audit_logs.insert({
          id: newAuditLogId(),
          collection: 'ai_messages',
          documentId: assistantId,
          action: 'create',
          field: 'ai_adoption_item_queued',
          oldValue: '',
          newValue: item.status,
          source: 'ai',
          timestamp: nowIso(),
          requestId: item.requestId,
          metadataJson: JSON.stringify({
            schemaVersion: 1,
            workflowId: item.workflowId,
            outputKind: item.outputKind,
            writeMode: item.writeMode,
          }),
        });
      }
    } catch {
      // Audit write failure must not block stream completion
    }
  }

  await runSendTurnStreamComposedWorkflowAfterVerticalQuality({
    db,
    assistantId,
    resolution,
    resolutionStatus: resolution.status,
    sessionMemoryRef,
    queueFlushAssistantDraft,
    awaitQueuedPersistence,
    setMessages,
    reflectionResult,
    composedReflectionRetryBlob,
    locale: input.toolFeedbackLocaleRef.current,
    turnConversationId: sendTurnConversationId,
    shouldApplyTurnSideEffects: () =>
      shouldApplyStreamUiUpdate(conversationGenerationRef, streamGenerationAtStart),
  });

  if (resolution.status === 'done') {
    recordCompletionSuccessMetric();
    const backgroundMemoryRuntime = backgroundMemoryRuntimeRef.current;
    const shouldApplyBackgroundMemorySideEffects = () =>
      shouldApplyStreamUiUpdate(conversationGenerationRef, streamGenerationAtStart);
    if (backgroundMemoryRuntime && shouldApplyBackgroundMemorySideEffects()) {
      scheduleAndFlushBackgroundMemory(
        backgroundMemoryRuntime,
        {
          conversationId: sendTurnConversationId,
          assistantMessageId: assistantId,
          userMessageId: userMsg.id,
          userText: effectiveUserText,
          assistantText: clientContent,
          actorId: 'ai-chat',
        },
        (entry) => db.collections.audit_logs.insert(entry),
        shouldApplyBackgroundMemorySideEffects,
      );
    }
  }
  const hasExtraFields =
    sourceScopeSummary !== undefined ||
    reflectionChecks !== undefined ||
    compatibilityReport !== undefined;
  if (hasExtraFields) {
    await finalizeAssistantMessage(
      resolution.status,
      clientContent,
      resolution.errorMessage,
      ragCitations,
      s.assistantReasoningContent,
      {
        ...(sourceScopeSummary !== undefined ? { sourceScopeSummary } : {}),
        ...(reflectionChecks !== undefined ? { reflectionChecks } : {}),
        ...(compatibilityReport !== undefined ? { compatibilityReport } : {}),
      },
    );
  } else {
    await finalizeAssistantMessage(
      resolution.status,
      clientContent,
      resolution.errorMessage,
      ragCitations,
      s.assistantReasoningContent,
    );
  }
}
