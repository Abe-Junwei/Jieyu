import { createContext, useContext, useMemo, useState } from 'react';
import type { UtteranceDocType } from '../db';
import type { AiPanelCardKey, AiPanelMode, AiPanelTask } from '../components/AiAnalysisPanel';

export type AiPanelContextValue = {
  // ── Database / session stats ──
  dbName: string;
  utteranceCount: number;
  translationLayerCount: number;
  aiConfidenceAvg: number | null;
  // ── Selection ──
  selectedUtterance: UtteranceDocType | null;
  selectedRowMeta: { rowNumber: number; start: number; end: number } | null;
  selectedAiWarning: boolean;
  lexemeMatches: Array<{ id: string; lemma: Record<string, string> }>;
  // ── Lexeme/Token editing callbacks ──
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
  // ── AI Panel mode / mode ──
  aiPanelMode?: AiPanelMode;
  aiCurrentTask?: AiPanelTask;
  aiVisibleCards?: Record<AiPanelCardKey, boolean>;
  selectedTranslationGapCount?: number;
  onJumpToTranslationGap?: () => void;
  onChangeAiPanelMode?: (mode: AiPanelMode) => void;
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
  aiPanelMode: 'auto',
  selectedTranslationGapCount: 0,
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
