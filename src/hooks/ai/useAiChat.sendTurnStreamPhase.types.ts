/**
 * Types for send-turn stream phase (post-opening consumption).
 */

import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { ChatOrchestrator } from '../../ai/ChatOrchestrator';
import { featureFlags } from '../../ai/config/featureFlags';
import type { AssistantStreamChunk } from './useAiChat.streamFactory';
import type { ChatTokenUsage } from '../../ai/providers/LLMProvider';
import type { MetricTags } from '../../observability/metrics';
import type { PersistOpeningTurnAndBuildPromptContextResult } from './useAiChat.sendPersistTurnAndBuildPromptContext';
import type { ToolIntentAssessment } from './useAiChat.sendTurn.types';
import type {
  ToolDecisionAuditMetadata,
  ToolIntentAuditMetadata,
} from '../../ai/chat/toolCallHelpers';
import type { AiChatSettings } from '../../ai/providers/providerCatalog';
import type { Locale } from '../../i18n';
import type {
  AiChatToolName,
  AiConnectionTestStatus,
  AiInteractionMetrics,
  AiPromptContext,
  AiSessionMemory,
  AiTaskSession,
  AiToolDecisionMode,
  PendingAiToolCall,
  UiChatMessage,
  UseAiChatOptions,
} from './useAiChat.types';
import type { AiMessageCitation } from '../../db';
import type { AiChatBackgroundMemoryRuntime } from './useAiChat.backgroundMemory';
import type {
  VerticalWorkflowOutputEnvelopeV0,
  VerticalWorkflowSelectionV0,
} from '../../ai/vertical/verticalWorkflowSelection';

export type SendTurnStreamPhaseState = {
  assistantContent: string;
  assistantReasoningContent: string;
  reportedInputTokens: number;
  totalReportedOutputTokens: number;
  primaryStreamUsage: ChatTokenUsage | undefined;
  usageObservedThisTurn: boolean;
  streamFinalized: boolean;
  assistantThinking: boolean;
  firstChunkArrived: boolean;
  connectionMarkedSuccess: boolean;
  firstTokenMetricRecorded: boolean;
  primaryUsageCommitted: boolean;
};

export function createInitialSendTurnStreamPhaseState(): SendTurnStreamPhaseState {
  return {
    assistantContent: '',
    assistantReasoningContent: '',
    reportedInputTokens: 0,
    totalReportedOutputTokens: 0,
    primaryStreamUsage: undefined,
    usageObservedThisTurn: false,
    streamFinalized: false,
    assistantThinking: false,
    firstChunkArrived: false,
    connectionMarkedSuccess: false,
    firstTokenMetricRecorded: false,
    primaryUsageCommitted: false,
  };
}

export type RunAiChatSendTurnStreamPhaseInput = Readonly<{
  phaseState: SendTurnStreamPhaseState;
  commitPrimaryStreamUsage: () => void;
  recordCompletionSuccessMetric: () => void;
  opening: PersistOpeningTurnAndBuildPromptContextResult;
  sendTurnConversationId: string;
  stream: AsyncGenerator<AssistantStreamChunk>;
  generationSource: NonNullable<UiChatMessage['generationSource']>;
  controller: AbortController;
  effectiveUserText: string;
  agentLoopSourceUserText: string;
  resumeCheckpoint: NonNullable<AiSessionMemory['pendingAgentLoopCheckpoint']> | null;
  verticalWorkflowSelection: VerticalWorkflowSelectionV0 | null;
  verticalOutputEnvelopeSeed: VerticalWorkflowOutputEnvelopeV0 | null;
  userMsg: UiChatMessage;
  assistantId: string;
  shouldTrackRemoteStatus: boolean;
  /** Browser `window.setTimeout` id or Node timer handle. */
  timeoutHandle: number | NodeJS.Timeout | null;
  sendStartedAtMs: number;
  aiMetricTags: MetricTags;
  queueFlushAssistantDraft: (content: string, force?: boolean) => void;
  awaitQueuedPersistence: () => Promise<void>;
  finalizeAssistantMessage: (
    status: 'done' | 'error' | 'aborted',
    content: string,
    errorMessage?: string,
    citations?: AiMessageCitation[],
    reasoningContent?: string,
    options?: {
      sourceScopeSummary?: UiChatMessage['sourceScopeSummary'];
      reflectionChecks?: UiChatMessage['reflectionChecks'];
      compatibilityReport?: UiChatMessage['compatibilityReport'];
    },
  ) => Promise<void>;
  provider: { id: string; label: string };
  flags: typeof featureFlags;
  orchestrator: ChatOrchestrator;
  outputTokenCap: number;
  outputTokenRetryCap: number;
  clearPendingAgentLoopCheckpoint: () => void;
  setLastError: Dispatch<SetStateAction<string | null>>;
  setMessages: Dispatch<SetStateAction<UiChatMessage[]>>;
  setConnectionTestStatus: Dispatch<SetStateAction<AiConnectionTestStatus>>;
  setConnectionTestMessage: Dispatch<SetStateAction<string | null>>;
  setTaskSession: Dispatch<SetStateAction<AiTaskSession>>;
  setMetrics: Dispatch<SetStateAction<AiInteractionMetrics>>;
  setPendingToolCall: Dispatch<SetStateAction<PendingAiToolCall | null>>;
  messagesRef: MutableRefObject<UiChatMessage[]>;
  metricsRef: MutableRefObject<AiInteractionMetrics>;
  sessionMemoryRef: MutableRefObject<AiSessionMemory>;
  settingsRef: MutableRefObject<AiChatSettings>;
  toolFeedbackLocaleRef: MutableRefObject<Locale>;
  getContextRef: MutableRefObject<(() => AiPromptContext | null) | undefined>;
  toolDecisionModeRef: MutableRefObject<AiToolDecisionMode>;
  onToolRiskCheckRef: MutableRefObject<UseAiChatOptions['onToolRiskCheck']>;
  preparePendingToolCallRef: MutableRefObject<UseAiChatOptions['preparePendingToolCall']>;
  onToolCallRef: MutableRefObject<UseAiChatOptions['onToolCall']>;
  taskSessionRef: MutableRefObject<AiTaskSession>;
  backgroundMemoryRuntimeRef: MutableRefObject<AiChatBackgroundMemoryRuntime | null>;
  onPushAdoptionItemsRef?: MutableRefObject<
    ((items: import('../../ai/vertical/adoptionQueue').AdoptionItem[]) => void) | undefined
  >;
  allowDestructiveToolCalls: boolean;
  hasPersistedExecutionForRequest: (requestId: string) => Promise<boolean>;
  writeToolDecisionAuditLog: (
    assistantMessageId: string,
    oldValue: string,
    newValue: string,
    source: 'human' | 'ai' | 'system',
    requestId?: string,
    metadata?: ToolDecisionAuditMetadata,
  ) => Promise<void>;
  writeToolIntentAuditLog: (
    assistantMessageId: string,
    callName: AiChatToolName,
    assessment: ToolIntentAssessment,
    requestId?: string,
    metadata?: ToolIntentAuditMetadata,
  ) => Promise<void>;
  markExecutedRequestId: (requestId: string) => void;
  bumpMetric: (key: keyof AiInteractionMetrics, delta?: number) => void;
  localToolCallCountRef: MutableRefObject<number>;
}>;
