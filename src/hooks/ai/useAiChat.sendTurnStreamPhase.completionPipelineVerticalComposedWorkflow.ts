/**
 * Composed multi-step workflow: parse assistant output, persist session memory, optional content rewrite.
 */

import { flushSync } from 'react-dom';
import { persistSessionMemory } from '../../ai/chat/sessionMemory';
import { newAuditLogId, nowIso } from './useAiChat.helpers';
import {
  advanceComposedWorkflowStateAfterParse,
  ANNOTATION_QA_THEN_LEXEME_CANDIDATES,
  type ComposedReflectionRetryBlob,
  parseComposedWorkflowOutput,
  SEGMENT_QA_THEN_ANNOTATION_QA_THEN_LEXEME_CANDIDATES,
} from '../../ai/vertical/composedWorkflowTemplates';
import { createLogger } from '../../observability/logger';
import { t, tf, type Locale } from '../../i18n';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { AiSessionMemory, UiChatMessage } from './useAiChat.types';
import type { PersistOpeningTurnAndBuildPromptContextResult } from './useAiChat.sendPersistTurnAndBuildPromptContext';
import type { SendTurnStreamPostAgentResolution } from './useAiChat.sendTurnStreamPhase.completionPipelineShared';

const log = createLogger('useAiChat.sendTurnStreamPhase.completionPipeline.composedWorkflow');

type SendTurnStreamVerticalReflectionResult = {
  reflectionFlagged: boolean;
  checks: { name: string; passed: boolean }[];
  summary: string;
} | null;

export async function runSendTurnStreamComposedWorkflowAfterVerticalQuality(opts: {
  db: PersistOpeningTurnAndBuildPromptContextResult['db'];
  assistantId: string;
  resolution: SendTurnStreamPostAgentResolution;
  resolutionStatus: 'done' | 'error';
  sessionMemoryRef: MutableRefObject<AiSessionMemory>;
  queueFlushAssistantDraft: (content: string, force?: boolean) => void;
  awaitQueuedPersistence: () => Promise<void>;
  setMessages: Dispatch<SetStateAction<UiChatMessage[]>>;
  reflectionResult: SendTurnStreamVerticalReflectionResult;
  composedReflectionRetryBlob: ComposedReflectionRetryBlob | undefined;
  locale: Locale;
}): Promise<void> {
  const {
    db,
    assistantId,
    resolution,
    resolutionStatus,
    sessionMemoryRef,
    queueFlushAssistantDraft,
    awaitQueuedPersistence,
    setMessages,
    reflectionResult,
    composedReflectionRetryBlob,
    locale,
  } = opts;

  const composedState = sessionMemoryRef.current.composedWorkflowState;
  if (!composedState || resolutionStatus !== 'done') return;

  try {
    const template =
      composedState.templateId === SEGMENT_QA_THEN_ANNOTATION_QA_THEN_LEXEME_CANDIDATES.id
        ? SEGMENT_QA_THEN_ANNOTATION_QA_THEN_LEXEME_CANDIDATES
        : ANNOTATION_QA_THEN_LEXEME_CANDIDATES;
    const parseResult = parseComposedWorkflowOutput(template, resolution.content);
    const { nextState, step1Result, step2Result } = advanceComposedWorkflowStateAfterParse(
      composedState,
      parseResult,
      resolution.content,
    );

    let effectiveNextState = nextState;
    let reflectionRetryScheduled = false;
    if (reflectionResult?.reflectionFlagged) {
      const retryCounts = composedState.stepReflectionRetryCounts ?? {};
      const currentRetryCount = retryCounts[composedState.currentStepIndex] ?? 0;
      if (currentRetryCount < 1) {
        reflectionRetryScheduled = true;
        effectiveNextState = {
          ...composedState,
          stepReflectionRetryCounts: {
            ...retryCounts,
            [composedState.currentStepIndex]: currentRetryCount + 1,
          },
          pendingReflectionRetryStepIndex: composedState.currentStepIndex,
          ...(composedReflectionRetryBlob
            ? { pendingReflectionRetryDetail: composedReflectionRetryBlob }
            : {}),
        };
      }
    }

    if (reflectionRetryScheduled) {
      try {
        await db.collections.audit_logs.insert({
          id: newAuditLogId(),
          collection: 'ai_messages',
          documentId: assistantId,
          action: 'update',
          field: 'ai_composed_reflection_retry',
          oldValue: '',
          newValue: String(composedState.currentStepIndex),
          source: 'ai',
          timestamp: nowIso(),
          requestId: `${assistantId}_composed_retry`,
          metadataJson: JSON.stringify({
            schemaVersion: 1,
            templateId: composedState.templateId,
            stepIndex: composedState.currentStepIndex,
            retryCount:
              (composedState.stepReflectionRetryCounts?.[composedState.currentStepIndex] ?? 0) + 1,
          }),
        });
      } catch {
        // Audit write failure must not block stream completion
      }
    }

    sessionMemoryRef.current = {
      ...sessionMemoryRef.current,
      composedWorkflowState: effectiveNextState,
    };
    persistSessionMemory(sessionMemoryRef.current);

    if (parseResult && step1Result && step2Result) {
      const annotationHeading = t(locale, 'msg.ai.vertical.workflow.annotationQa');
      const lexemeHeading = t(locale, 'msg.ai.vertical.workflow.lexemeCandidates');
      const combinedContent = tf(
        locale,
        'msg.ai.vertical.composed.markdown.annotationAndLexemeCombined',
        {
          annotationHeading,
          lexemeHeading,
          step1: step1Result,
          step2: step2Result,
        },
      );
      resolution.content = combinedContent;
      flushSync(() => {
        setMessages((prev) =>
          prev.map((msg) => (msg.id === assistantId ? { ...msg, content: combinedContent } : msg)),
        );
      });
      queueFlushAssistantDraft(combinedContent, true);
      await awaitQueuedPersistence();
    } else if (step1Result) {
      const annotationHeading = t(locale, 'msg.ai.vertical.workflow.annotationQa');
      const pendingLine = t(locale, 'msg.ai.vertical.composed.markdown.lexemePendingRetryLine');
      const partialContent = tf(
        locale,
        'msg.ai.vertical.composed.markdown.annotationWithLexemePendingRetry',
        {
          annotationHeading,
          step1: step1Result,
          pendingLine,
        },
      );
      resolution.content = partialContent;
      flushSync(() => {
        setMessages((prev) =>
          prev.map((msg) => (msg.id === assistantId ? { ...msg, content: partialContent } : msg)),
        );
      });
      queueFlushAssistantDraft(partialContent, true);
      await awaitQueuedPersistence();
    }

    await db.collections.audit_logs.insert({
      id: newAuditLogId(),
      collection: 'ai_messages',
      documentId: assistantId,
      action: 'update',
      field: 'ai_composed_workflow_result',
      oldValue: composedState.status,
      newValue: nextState.status,
      source: 'ai',
      timestamp: nowIso(),
      requestId: `${assistantId}_composed`,
      metadataJson: JSON.stringify({
        schemaVersion: 1,
        templateId: composedState.templateId,
        previousStatus: composedState.status,
        currentStatus: nextState.status,
        stepIndex: nextState.currentStepIndex,
        hasStep1Result: step1Result !== null,
        hasStep2Result: step2Result !== null,
      }),
    });
  } catch (composedError) {
    log.error('composed workflow parsing failed', { err: composedError });
  }
}
