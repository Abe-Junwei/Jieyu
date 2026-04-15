import {
  buildClarifyCandidates,
  toNaturalActionClarify,
  toNaturalNonActionFallback,
  toNaturalTargetClarify,
  toNaturalToolCancelled,
} from '../ai/chat/toolCallHelpers';
import type { AiToolFeedbackStyle } from '../ai/providers/providerCatalog';
import type { Locale } from '../i18n';
import type {
  AiChatToolName,
  AiInteractionMetrics,
  AiPromptContext,
  AiSessionMemory,
  AiTaskSession,
  PendingAiToolCall,
} from './useAiChat';

type ToolIntentAssessment = {
  decision: 'execute' | 'clarify' | 'ignore' | 'cancel';
};

type PlannerDecision = 'resolved' | 'clarify';

type PlannerReason =
  | 'missing-utterance-target'
  | 'missing-split-position'
  | 'missing-translation-layer-target'
  | 'missing-layer-link-target'
  | 'missing-layer-target'
  | 'missing-language-target';

interface ResolveToolIntentOutcomeParams {
  intentAssessment: ToolIntentAssessment;
  plannerDecision?: PlannerDecision;
  plannerReason?: PlannerReason;
  toolCallName: AiChatToolName;
  userText: string;
  locale: Locale;
  toolFeedbackStyle: AiToolFeedbackStyle;
  aiContext: AiPromptContext | null;
  sessionMemory: AiSessionMemory;
  taskSessionId: string;
  bumpMetric: (key: keyof AiInteractionMetrics) => void;
  setTaskSession: (value: AiTaskSession) => void;
  setPendingToolCall: (value: PendingAiToolCall | null) => void;
}

/**
 * 处理工具意图分流（执行/澄清/忽略/取消） | Resolve tool intent outcome (execute/clarify/ignore/cancel)
 */
export function resolveToolIntentOutcome({
  intentAssessment,
  plannerDecision,
  plannerReason,
  toolCallName,
  userText,
  locale,
  toolFeedbackStyle,
  aiContext,
  sessionMemory,
  taskSessionId,
  bumpMetric,
  setTaskSession,
  setPendingToolCall,
}: ResolveToolIntentOutcomeParams): string | null {
  const now = new Date().toISOString();

  // Model-emitted batch preview: never short-circuit on user-text intent (tests use __TOOL_* hooks).
  if (toolCallName === 'propose_changes') {
    return null;
  }

  if (intentAssessment.decision === 'ignore') {
    bumpMetric('explainFallbackCount');
    setPendingToolCall(null);
    setTaskSession({
      id: taskSessionId,
      status: 'explaining',
      updatedAt: now,
    });
    return toNaturalNonActionFallback(userText, toolFeedbackStyle);
  }

  if (intentAssessment.decision === 'cancel') {
    setPendingToolCall(null);
    setTaskSession({
      id: taskSessionId,
      status: 'idle',
      updatedAt: now,
    });
    return toNaturalToolCancelled(locale, toolCallName, toolFeedbackStyle);
  }

  if (plannerDecision === 'clarify') {
    const candidates = buildClarifyCandidates(toolCallName, plannerReason, aiContext, sessionMemory);
    bumpMetric('clarifyCount');
    setPendingToolCall(null);
    setTaskSession({
      id: taskSessionId,
      status: 'waiting_clarify',
      toolName: toolCallName,
      ...(plannerReason ? { clarifyReason: plannerReason } : {}),
      ...(candidates.length > 0 ? { candidates } : {}),
      updatedAt: now,
    });
    return toNaturalTargetClarify(toolCallName, plannerReason, toolFeedbackStyle, candidates);
  }

  if (intentAssessment.decision === 'clarify') {
    bumpMetric('clarifyCount');
    setPendingToolCall(null);
    setTaskSession({
      id: taskSessionId,
      status: 'waiting_clarify',
      toolName: toolCallName,
      updatedAt: now,
    });
    return toNaturalActionClarify(toolCallName, toolFeedbackStyle);
  }

  return null;
}
