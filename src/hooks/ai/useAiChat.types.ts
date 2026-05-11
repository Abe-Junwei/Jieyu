/**
 * useAiChat 类型入口：再导出 ai/chat 领域类型，避免业务从 hooks 与 ai/chat 双源分叉。
 */
import type { AiChatSettings } from '../../ai/providers/providerCatalog';
import type {
  AiConnectionTestStatus,
  AiContextDebugSnapshot,
  AiInteractionMetrics,
  AiSessionMemory,
  AiTaskSession,
  AiToolDecisionMode,
  PendingAiToolCall,
  UiChatMessage,
} from '../../ai/chat/chatDomain.types';

export * from '../../ai/chat/chatDomain.types';

export interface UseAiChatReturn {
  messages: UiChatMessage[];
  isStreaming: boolean;
  lastError: string | null;
  conversationId: string | null;
  send: (userText: string) => Promise<void>;
  stop: () => void;
  clear: () => void;
  testConnection: () => Promise<void>;
  enabled: boolean;
  toolDecisionMode: AiToolDecisionMode;
  isBootstrapping: boolean;
  providerLabel: string;
  settings: AiChatSettings;
  updateSettings: (patch: Partial<AiChatSettings>) => void;
  connectionTestStatus: AiConnectionTestStatus;
  connectionTestMessage: string | null;
  contextDebugSnapshot: AiContextDebugSnapshot | null;
  pendingToolCall: PendingAiToolCall | null;
  taskSession: AiTaskSession;
  metrics: AiInteractionMetrics;
  sessionMemory: AiSessionMemory;
  confirmPendingToolCall: () => Promise<void>;
  cancelPendingToolCall: () => Promise<void>;
  dismissPendingAgentLoopCheckpoint: () => Promise<void>;
  clearPendingAgentLoopCheckpointIfTaskIdMatches: (taskId: string) => void;
  trackRecommendationEvent: (
    event: import('../../ai/chat/chatDomain.types').AiRecommendationEvent,
  ) => void;
  setActiveSourceSetId: (id: string | null) => void;
  toggleMessagePinned: (messageId: string) => void;
  deactivateSessionDirective: (directiveId: string) => void;
  pruneSessionDirectivesBySourceMessage: (sourceMessageId: string) => void;
}
