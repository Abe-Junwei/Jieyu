import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { ChatOrchestrator } from '../ai/ChatOrchestrator';
import { featureFlags } from '../ai/config/featureFlags';
import type { ToolDecisionAuditMetadata, ToolIntentAuditMetadata } from '../ai/chat/toolCallHelpers';
import type { EmbeddingSearchService } from '../ai/embeddings/EmbeddingSearchService';
import type { AiChatSettings } from '../ai/providers/providerCatalog';
import type { Locale } from '../i18n';
import type {
  AiChatToolName,
  AiConnectionTestStatus,
  AiContextDebugSnapshot,
  AiInteractionMetrics,
  AiPromptContext,
  AiSessionMemory,
  AiSystemPersonaKey,
  AiTaskSession,
  AiToolDecisionMode,
  PendingAiToolCall,
  UiChatMessage,
  UseAiChatOptions,
} from './useAiChat.types';
import type { AiChatBackgroundMemoryRuntime } from './useAiChat.backgroundMemory';

/** Tool-intent audit payload shape (mirrors useAiChat.toolAudit local type). */
export type ToolIntentAssessment = {
  decision: 'execute' | 'clarify' | 'ignore' | 'cancel';
  score: number;
  hasExecutionCue: boolean;
  hasActionVerb: boolean;
  hasActionTarget: boolean;
  hasExplicitId: boolean;
  hasMetaQuestion: boolean;
  hasTechnicalDiscussion: boolean;
};

export type RunAiChatSendTurnArgs = Readonly<{
  userText: string;
  featureFlags: typeof featureFlags;
  isStreaming: boolean;
  sessionTokenBudget: number;
  firstChunkTimeoutMs: number;
  outputTokenCap: number;
  outputTokenRetryCap: number;
  allowDestructiveToolCalls: boolean;
  maxContextCharsOverride: number | undefined;
  historyCharBudgetOverride: number | undefined;
  provider: { id: string; label: string };
  orchestrator: ChatOrchestrator;
  ensureConversation: () => Promise<string>;

  setLastError: Dispatch<SetStateAction<string | null>>;
  setMessages: Dispatch<SetStateAction<UiChatMessage[]>>;
  setIsStreaming: Dispatch<SetStateAction<boolean>>;
  setConnectionTestStatus: Dispatch<SetStateAction<AiConnectionTestStatus>>;
  setConnectionTestMessage: Dispatch<SetStateAction<string | null>>;
  setContextDebugSnapshot: Dispatch<SetStateAction<AiContextDebugSnapshot | null>>;
  setMetrics: Dispatch<SetStateAction<AiInteractionMetrics>>;
  setTaskSession: Dispatch<SetStateAction<AiTaskSession>>;
  setPendingToolCall: Dispatch<SetStateAction<PendingAiToolCall | null>>;

  messagesRef: MutableRefObject<UiChatMessage[]>;
  metricsRef: MutableRefObject<AiInteractionMetrics>;
  pendingToolCallRef: MutableRefObject<PendingAiToolCall | null>;
  sessionMemoryRef: MutableRefObject<AiSessionMemory>;
  settingsRef: MutableRefObject<AiChatSettings>;
  toolFeedbackLocaleRef: MutableRefObject<Locale>;
  systemPersonaKeyRef: MutableRefObject<AiSystemPersonaKey>;
  getContextRef: MutableRefObject<(() => AiPromptContext | null) | undefined>;
  embeddingSearchServiceRef: MutableRefObject<EmbeddingSearchService | undefined>;
  ragContextTimeoutMsRef: MutableRefObject<number>;
  toolDecisionModeRef: MutableRefObject<AiToolDecisionMode>;
  onToolRiskCheckRef: MutableRefObject<UseAiChatOptions['onToolRiskCheck']>;
  preparePendingToolCallRef: MutableRefObject<UseAiChatOptions['preparePendingToolCall']>;
  onToolCallRef: MutableRefObject<UseAiChatOptions['onToolCall']>;
  taskSessionRef: MutableRefObject<AiTaskSession>;
  onMessageCompleteRef: MutableRefObject<UseAiChatOptions['onMessageComplete']>;
  abortRef: MutableRefObject<AbortController | null>;
  localToolCallCountRef: MutableRefObject<number>;
  streamPersistIntervalMsRef: MutableRefObject<number>;
  backgroundMemoryRuntimeRef: MutableRefObject<AiChatBackgroundMemoryRuntime | null>;

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
  hasPersistedExecutionForRequest: (requestId: string) => Promise<boolean>;
  markExecutedRequestId: (requestId: string) => void;
  bumpMetric: (key: keyof AiInteractionMetrics, delta?: number) => void;

  resolveAgentLoopResumeCheckpoint: (userText: string) => Promise<NonNullable<AiSessionMemory['pendingAgentLoopCheckpoint']> | null>;
  clearPendingAgentLoopCheckpoint: () => void;
}>;
