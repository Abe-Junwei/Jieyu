/**
 * P2: Composed workflow reflection retry — extracted from useAiChat.ts
 * Pure logic: no React dependencies.
 */
import { persistSessionMemory } from './sessionMemory';
import type { AiSessionMemory } from '../../hooks/ai/useAiChat.types';
import {
  buildStep2RetryPrompt,
  buildStep3RetryPrompt,
  buildComposedReflectionRetryPromptAppendix,
} from '../vertical/composedWorkflowTemplates';

export interface ComposedWorkflowRetryResult {
  /** The user text to send for retry, or null if no retry needed */
  retryUserText: string | null;
  /** Updated session memory after clearing retry flags */
  nextSessionMemory: AiSessionMemory;
}

/**
 * Resolve reflection retry for composed workflow (max 1 retry per step).
 * Does NOT handle step1_done → step2 auto-trigger; that remains in useAiChat.ts
 * because it requires a nested send-turn and state refresh.
 */
export function resolveComposedWorkflowReflectionRetry(
  sessionMemory: AiSessionMemory,
): ComposedWorkflowRetryResult {
  const composedState = sessionMemory.composedWorkflowState;
  if (!composedState || composedState.pendingReflectionRetryStepIndex === undefined) {
    return { retryUserText: null, nextSessionMemory: sessionMemory };
  }

  const retryStep = composedState.pendingReflectionRetryStepIndex;
  const reflectionDetail = composedState.pendingReflectionRetryDetail;
  const {
    pendingReflectionRetryStepIndex: _pendingRetry,
    pendingReflectionRetryDetail: _pendingDetail,
    ...restComposed
  } = composedState;
  const nextMemory: AiSessionMemory = {
    ...sessionMemory,
    composedWorkflowState: restComposed,
  };
  persistSessionMemory(nextMemory);

  let retryUserText: string;
  if (retryStep === 0) {
    retryUserText = composedState.originalUserText;
  } else if (retryStep === 1) {
    retryUserText = buildStep2RetryPrompt();
  } else {
    retryUserText = buildStep3RetryPrompt();
  }
  if (reflectionDetail) {
    const appendix = buildComposedReflectionRetryPromptAppendix(reflectionDetail).trim();
    if (appendix.length > 0) {
      retryUserText = `${retryUserText}\n\n${appendix}`;
    }
  }

  return { retryUserText, nextSessionMemory: nextMemory };
}
