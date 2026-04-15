/**
 * EmbeddingContext - 嵌入任务状态 Context
 *
 * 作为 AiPanelContext 的下游选择器：从 aiPanelContextValue 中提取 embedding 相关字段，
 * 供 AiEmbeddingCard 等组件使用。待 AiEmbeddingCard 完全迁移后，AiPanelContext
 * 中的 embedding 字段可移除。
 *
 * 使用方式：
 * - 将 <EmbeddingProvider value={embeddingContextValue}> 放在 TranscriptionPage 中
 * - embeddingContextValue 由 TranscriptionPage 的 useState/useMemo 状态派生
 * - AiEmbeddingCard 通过 useEmbeddingContext() 读取
 */

import { createContext, useContext } from 'react';
import type { EmbeddingProviderKind } from '../ai/embeddings/EmbeddingProvider';
import type { EmbeddingProviderCreateConfig } from '../ai/embeddings/EmbeddingProvider';
import type { UtteranceDocType } from '../db';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface EmbeddingContextValue {
  selectedUnit: UtteranceDocType | null;
  aiEmbeddingBusy: boolean;
  aiEmbeddingProgressLabel: string | null;
  aiEmbeddingLastResult: {
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
  aiEmbeddingTasks: Array<{
    id: string;
    taskType: 'transcribe' | 'gloss' | 'translate' | 'embed' | 'detect_language';
    status: 'pending' | 'running' | 'done' | 'failed';
    updatedAt: string;
    modelId?: string;
    errorMessage?: string;
  }>;
  aiEmbeddingMatches: Array<{
    utteranceId: string;
    score: number;
    label: string;
    text: string;
  }>;
  aiEmbeddingLastError: string | null;
  aiEmbeddingWarning: string | null;
  aiEmbeddingBuildStartedAt: number | null;
  embeddingProviderKind: EmbeddingProviderKind;
  embeddingProviderConfig: EmbeddingProviderCreateConfig | undefined;
  onSetEmbeddingProviderKind: ((kind: EmbeddingProviderKind) => void) | undefined;
  onTestEmbeddingProvider: (() => Promise<{ available: boolean; error?: string }>) | undefined;
  onBuildUtteranceEmbeddings: (() => Promise<void>) | undefined;
  onBuildNotesEmbeddings: (() => Promise<void>) | undefined;
  onBuildPdfEmbeddings: (() => Promise<void>) | undefined;
  onFindSimilarUtterances: (() => Promise<void>) | undefined;
  onRefreshEmbeddingTasks: (() => Promise<void>) | undefined;
  onJumpToEmbeddingMatch: ((utteranceId: string) => void) | undefined;
  onJumpToCitation: ((
    citationType: 'utterance' | 'note' | 'pdf' | 'schema',
    refId: string,
    citation?: { snippet?: string },
  ) => Promise<void> | void) | undefined;
  onCancelAiTask: ((taskId: string) => Promise<void>) | undefined;
  onRetryAiTask: ((taskId: string) => Promise<void>) | undefined;
}

export const DEFAULT_EMBEDDING_CONTEXT_VALUE: EmbeddingContextValue = {
  selectedUnit: null,
  aiEmbeddingBusy: false,
  aiEmbeddingProgressLabel: null,
  aiEmbeddingLastResult: null,
  aiEmbeddingTasks: [],
  aiEmbeddingMatches: [],
  aiEmbeddingLastError: null,
  aiEmbeddingWarning: null,
  aiEmbeddingBuildStartedAt: null,
  embeddingProviderKind: 'local',
  embeddingProviderConfig: undefined,
  onSetEmbeddingProviderKind: undefined,
  onTestEmbeddingProvider: undefined,
  onBuildUtteranceEmbeddings: undefined,
  onBuildNotesEmbeddings: undefined,
  onBuildPdfEmbeddings: undefined,
  onFindSimilarUtterances: undefined,
  onRefreshEmbeddingTasks: undefined,
  onJumpToEmbeddingMatch: undefined,
  onJumpToCitation: undefined,
  onCancelAiTask: undefined,
  onRetryAiTask: undefined,
};

// ── Context ───────────────────────────────────────────────────────────────────

const EmbeddingContext = createContext<EmbeddingContextValue | null>(null);

export function useEmbeddingContext(): EmbeddingContextValue {
  const ctx = useContext(EmbeddingContext);
  if (!ctx) {
    throw new Error('useEmbeddingContext must be used within <EmbeddingProvider>');
  }
  return ctx;
}

interface EmbeddingProviderProps {
  children: React.ReactNode;
  value: EmbeddingContextValue;
}

export function EmbeddingProvider({ children, value }: EmbeddingProviderProps) {
  return (
    <EmbeddingContext.Provider value={value}>
      {children}
    </EmbeddingContext.Provider>
  );
}
