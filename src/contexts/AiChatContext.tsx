/**
 * AiChatContext - AI Chat + Lexeme + Observer 状态 Context
 *
 * 从 AiPanelContext 提取 chat/lexeme/observer 相关字段，独立的 Provider + state。
 * 消费者: AiAssistantHubContext (chat/lexeme/observer 字段部分)
 */

import { createContext, useContext } from 'react';
import type { TimelineUnitView } from '../hooks/timelineUnitView';
import type { AiChatSettings } from '../ai/providers/providerCatalog';
import type { ProjectStage } from '../ai/ProjectObserver';
import type { AiConnectionTestStatus, AiContextDebugSnapshot, AiInteractionMetrics, AiSessionMemory, AiTaskSession, PendingAiToolCall, UiChatMessage } from '../hooks/useAiChat';
import type { AiRecommendationEvent } from '../hooks/useAiChat.types';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface AiChatContextValue {
  currentPage?: 'transcription' | 'glossing' | 'settings' | 'other';
  selectedUnit: TimelineUnitView | null;
  selectedRowMeta: { rowNumber: number; start: number; end: number } | null;
  selectedUnitKind?: 'unit' | 'segment' | null;
  selectedLayerType?: 'transcription' | 'translation';
  selectedText?: string | null;
  selectedTimeRangeLabel?: string | null;
  lexemeMatches: Array<{ id: string; lemma: Record<string, string> }>;
  // Chat
  aiChatEnabled: boolean;
  aiProviderLabel: string | undefined;
  aiChatSettings: AiChatSettings | undefined;
  aiMessages: UiChatMessage[] | undefined;
  aiIsStreaming: boolean | undefined;
  aiLastError: string | null | undefined;
  aiConnectionTestStatus: AiConnectionTestStatus;
  aiConnectionTestMessage: string | null | undefined;
  aiContextDebugSnapshot: AiContextDebugSnapshot | null | undefined;
  aiPendingToolCall: PendingAiToolCall | null | undefined;
  aiTaskSession: AiTaskSession | null | undefined;
  aiInteractionMetrics: AiInteractionMetrics | null | undefined;
  aiSessionMemory: AiSessionMemory | null | undefined;
  aiToolDecisionLogs: Array<{
    id: string;
    toolName: string;
    decision: string;
    reason?: string;
    reasonLabelEn?: string;
    reasonLabelZh?: string;
    requestId?: string;
    timestamp: string;
    source?: 'human' | 'ai' | 'system';
    executed?: boolean;
    durationMs?: number;
    message?: string;
  }>;
  // Observer
  observerStage: ProjectStage;
  observerRecommendations: Array<{
    actionType?: 'jump' | 'batch_pos' | 'risk_review';
    targetUnitId?: string;
    targetForm?: string;
    targetPos?: string;
    targetConfidence?: number;
    [key: string]: unknown;
  }>;
  // Callbacks
  onUpdateAiChatSettings: ((patch: Partial<AiChatSettings>) => void) | undefined;
  onTestAiConnection: (() => Promise<void>) | undefined;
  onSendAiMessage: ((text: string) => Promise<void>) | undefined;
  onStopAiMessage: (() => void) | undefined;
  onClearAiMessages: (() => void) | undefined;
  onToggleAiMessagePin: ((messageId: string) => void) | undefined;
  onDeactivateAiSessionDirective: ((directiveId: string) => void) | undefined;
  onPruneAiSessionDirectivesBySourceMessage: ((sourceMessageId: string) => void) | undefined;
  onConfirmPendingToolCall: (() => Promise<void>) | undefined;
  onCancelPendingToolCall: (() => Promise<void>) | undefined;
  onDismissPendingAgentLoopCheckpoint: (() => Promise<void>) | undefined;
  onTrackAiRecommendationEvent: ((event: AiRecommendationEvent) => void) | undefined;
  onJumpToCitation: ((
    citationType: 'unit' | 'note' | 'pdf' | 'schema',
    refId: string,
    citation?: { snippet?: string },
  ) => Promise<void> | void) | undefined;
  /** Current timeline read-model epoch (transcription workspace); for pending destructive tool UX. */
  timelineReadModelEpoch?: number;
}

export const DEFAULT_AI_CHAT_CONTEXT_VALUE: AiChatContextValue = {
  currentPage: 'other',
  selectedUnit: null,
  selectedRowMeta: null,
  selectedUnitKind: null,
  selectedText: '',
  selectedTimeRangeLabel: null,
  lexemeMatches: [],
  aiChatEnabled: false,
  aiProviderLabel: undefined,
  aiChatSettings: undefined,
  aiMessages: undefined,
  aiIsStreaming: undefined,
  aiLastError: undefined,
  aiConnectionTestStatus: 'idle',
  aiConnectionTestMessage: undefined,
  aiContextDebugSnapshot: undefined,
  aiPendingToolCall: undefined,
  aiTaskSession: undefined,
  aiInteractionMetrics: undefined,
  aiSessionMemory: undefined,
  aiToolDecisionLogs: [],
  observerStage: 'collecting' as const,
  observerRecommendations: [],
  onUpdateAiChatSettings: undefined,
  onTestAiConnection: undefined,
  onSendAiMessage: undefined,
  onStopAiMessage: undefined,
  onClearAiMessages: undefined,
  onToggleAiMessagePin: undefined,
  onDeactivateAiSessionDirective: undefined,
  onPruneAiSessionDirectivesBySourceMessage: undefined,
  onConfirmPendingToolCall: undefined,
  onCancelPendingToolCall: undefined,
  onDismissPendingAgentLoopCheckpoint: undefined,
  onTrackAiRecommendationEvent: undefined,
  onJumpToCitation: undefined,
};

// ── Context ───────────────────────────────────────────────────────────────────

const AiChatContext = createContext<AiChatContextValue | null>(null);

export function useAiChatContext(): AiChatContextValue {
  const ctx = useContext(AiChatContext);
  if (!ctx) {
    throw new Error('useAiChatContext must be used within <AiChatProvider>');
  }
  return ctx;
}

interface AiChatProviderProps {
  children: React.ReactNode;
  value: AiChatContextValue;
}

export function AiChatProvider({ children, value }: AiChatProviderProps) {
  return (
    <AiChatContext.Provider value={value}>
      {children}
    </AiChatContext.Provider>
  );
}
