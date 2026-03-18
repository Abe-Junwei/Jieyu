import { createContext, useContext, useMemo, useState } from 'react';
import type { UtteranceDocType } from '../../db';
import type { AiConnectionTestStatus, AiContextDebugSnapshot, PendingAiToolCall, UiChatMessage } from '../hooks/useAiChat';
import type { AiChatSettings } from '../ai/providers/providerCatalog';
import type { ProjectStage, Recommendation } from '../ai/ProjectObserver';
import type { AiPanelCardKey, AiPanelMode, AiPanelTask } from '../components/AiAnalysisPanel';

type ActionableRecommendation = Recommendation & {
  actionType?: 'jump' | 'batch_pos' | 'risk_review';
  targetUtteranceId?: string;
  targetForm?: string;
  targetPos?: string;
  targetConfidence?: number;
};

export type AiPanelContextValue = {
  dbName: string;
  utteranceCount: number;
  translationLayerCount: number;
  aiConfidenceAvg: number | null;
  selectedUtterance: UtteranceDocType | null;
  selectedRowMeta: { rowNumber: number; start: number; end: number } | null;
  selectedAiWarning: boolean;
  lexemeMatches: Array<{ id: string; lemma: Record<string, string> }>;
  onOpenWordNote?: (utteranceId: string, wordId: string, event: React.MouseEvent<HTMLButtonElement>) => void;
  onOpenMorphemeNote?: (
    utteranceId: string,
    wordId: string,
    morphemeId: string,
    event: React.MouseEvent<HTMLButtonElement>,
  ) => void;
  onUpdateTokenPos?: (tokenId: string, pos: string | null) => Promise<void> | void;
  onBatchUpdateTokenPosByForm?: (
    utteranceId: string,
    form: string,
    pos: string | null,
  ) => Promise<number> | number;
  aiChatEnabled?: boolean;
  aiProviderLabel?: string;
  aiChatSettings?: AiChatSettings;
  aiMessages?: UiChatMessage[];
  aiIsStreaming?: boolean;
  aiLastError?: string | null;
  aiConnectionTestStatus?: AiConnectionTestStatus;
  aiConnectionTestMessage?: string | null;
  aiContextDebugSnapshot?: AiContextDebugSnapshot | null;
  aiPendingToolCall?: PendingAiToolCall | null;
  aiToolDecisionLogs?: Array<{
    id: string;
    toolName: string;
    decision: string;
    timestamp: string;
  }>;
  onUpdateAiChatSettings?: (patch: Partial<AiChatSettings>) => void;
  onTestAiConnection?: () => Promise<void>;
  onSendAiMessage?: (text: string) => Promise<void>;
  onStopAiMessage?: () => void;
  onClearAiMessages?: () => void;
  onConfirmPendingToolCall?: () => Promise<void>;
  onCancelPendingToolCall?: () => Promise<void>;
  aiPanelMode?: AiPanelMode;
  aiCurrentTask?: AiPanelTask;
  aiVisibleCards?: Record<AiPanelCardKey, boolean>;
  selectedTranslationGapCount?: number;
  onJumpToTranslationGap?: () => void;
  onChangeAiPanelMode?: (mode: AiPanelMode) => void;
  observerStage?: ProjectStage;
  observerRecommendations?: ActionableRecommendation[];
  onExecuteRecommendation?: (item: ActionableRecommendation) => void;
  aiEmbeddingBusy?: boolean;
  aiEmbeddingProgressLabel?: string | null;
  aiEmbeddingLastResult?: {
    taskId: string;
    total: number;
    generated: number;
    skipped: number;
    modelId: string;
    modelVersion: string;
    completedAt: string;
    elapsedMs?: number;
    averageBatchMs?: number;
  } | null;
  aiEmbeddingTasks?: Array<{
    id: string;
    status: 'pending' | 'running' | 'done' | 'failed';
    updatedAt: string;
    modelId?: string;
    errorMessage?: string;
  }>;
  aiEmbeddingMatches?: Array<{
    utteranceId: string;
    score: number;
    label: string;
    text: string;
  }>;
  aiEmbeddingLastError?: string | null;
  aiEmbeddingWarning?: string | null;
  onBuildUtteranceEmbeddings?: () => Promise<void>;
  onFindSimilarUtterances?: () => Promise<void>;
  onRefreshEmbeddingTasks?: () => Promise<void>;
  onJumpToEmbeddingMatch?: (utteranceId: string) => void;
};

export const DEFAULT_AI_PANEL_CONTEXT_VALUE: AiPanelContextValue = {
  dbName: '',
  utteranceCount: 0,
  translationLayerCount: 0,
  aiConfidenceAvg: null,
  selectedUtterance: null,
  selectedRowMeta: null,
  selectedAiWarning: false,
  lexemeMatches: [],
  aiChatEnabled: false,
  aiMessages: [],
  aiIsStreaming: false,
  aiLastError: null,
  aiConnectionTestStatus: 'idle',
  aiConnectionTestMessage: null,
  aiPendingToolCall: null,
  aiToolDecisionLogs: [],
  aiPanelMode: 'auto',
  selectedTranslationGapCount: 0,
  observerRecommendations: [],
  aiEmbeddingBusy: false,
  aiEmbeddingProgressLabel: null,
  aiEmbeddingLastResult: null,
  aiEmbeddingTasks: [],
  aiEmbeddingMatches: [],
  aiEmbeddingLastError: null,
  aiEmbeddingWarning: null,
};

export const AiPanelContext = createContext<AiPanelContextValue | null>(null);
const AiPanelContextUpdateContext = createContext<React.Dispatch<React.SetStateAction<AiPanelContextValue>> | null>(null);

export function AiPanelProvider({ children }: { children: React.ReactNode }) {
  const [value, setValue] = useState<AiPanelContextValue>(DEFAULT_AI_PANEL_CONTEXT_VALUE);
  const stableValue = useMemo(() => value, [value]);

  return (
    <AiPanelContext.Provider value={stableValue}>
      <AiPanelContextUpdateContext.Provider value={setValue}>
        {children}
      </AiPanelContextUpdateContext.Provider>
    </AiPanelContext.Provider>
  );
}

export function useAiPanelContext(): AiPanelContextValue {
  const value = useContext(AiPanelContext);
  if (!value) {
    throw new Error('useAiPanelContext must be used within AiPanelContext.Provider');
  }
  return value;
}

export function useAiPanelContextUpdater(): React.Dispatch<React.SetStateAction<AiPanelContextValue>> {
  const setValue = useContext(AiPanelContextUpdateContext);
  if (!setValue) {
    throw new Error('useAiPanelContextUpdater must be used within AiPanelProvider');
  }
  return setValue;
}
