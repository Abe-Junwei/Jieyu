import { createContext, useContext, useMemo, useState } from 'react';
import type { UtteranceDocType } from '../db';
import type { AiPanelCardKey, AiPanelMode, AiPanelTask } from '../components/AiAnalysisPanel';
import type { AcousticPromptSummary } from '../pages/TranscriptionPage.aiPromptContext';
import type {
  AcousticBatchSelectionRange,
  AcousticCalibrationStatus,
  AcousticPanelBatchDetail,
  AcousticPanelDetail,
} from '../utils/acousticPanelDetail';
import type { AcousticHotspotKind } from '../utils/acousticOverlayTypes';
import type { ResolvedAcousticProviderState } from '../services/acoustic/acousticProviderContract';

export type VadCacheStatus = {
  state: 'unavailable' | 'missing' | 'warming' | 'ready';
  engine?: 'silero' | 'energy';
  segmentCount?: number;
  progressRatio?: number;
  processedFrames?: number;
  totalFrames?: number;
};

export type AcousticRuntimeStatus = {
  state: 'idle' | 'loading' | 'ready' | 'error';
  phase?: 'analyzing' | 'done';
  progressRatio?: number;
  processedFrames?: number;
  totalFrames?: number;
  errorMessage?: string;
};

export type AcousticInspectorReadout = {
  source: 'waveform' | 'spectrogram';
  timeSec: number;
  frequencyHz?: number | null;
  f0Hz?: number | null;
  intensityDb?: number | null;
  matchedHotspotKind?: AcousticHotspotKind | null;
  matchedHotspotTimeSec?: number | null;
  inSelection?: boolean;
};

export type AiPanelContextValue = {
  // ── Database / session stats ──
  dbName: string;
  unitCount: number;
  translationLayerCount: number;
  aiConfidenceAvg: number | null;
  // ── Selection ──
  selectedUnit: UtteranceDocType | null;
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
  vadCacheStatus?: VadCacheStatus;
  acousticRuntimeStatus?: AcousticRuntimeStatus;
  acousticSummary?: AcousticPromptSummary | null;
  acousticInspector?: AcousticInspectorReadout | null;
  pinnedInspector?: AcousticInspectorReadout | null;
  selectedHotspotTimeSec?: number | null;
  acousticDetail?: AcousticPanelDetail | null;
  acousticDetailFullMedia?: AcousticPanelDetail | null;
  acousticBatchDetails?: AcousticPanelBatchDetail[];
  acousticBatchSelectionCount?: number;
  acousticBatchDroppedSelectionRanges?: AcousticBatchSelectionRange[];
  acousticCalibrationStatus?: AcousticCalibrationStatus;
  acousticProviderPreference?: string | null;
  acousticProviderState?: ResolvedAcousticProviderState | null;
  onJumpToTranslationGap?: () => void;
  onJumpToAcousticHotspot?: (timeSec: number) => void;
  onPinInspector?: () => void;
  onClearPinnedInspector?: () => void;
  onSelectHotspot?: (timeSec: number | null) => void;
  onChangeAiPanelMode?: (mode: AiPanelMode) => void;
  onChangeAcousticConfig?: (
    config: Partial<import('../utils/acousticOverlayTypes').AcousticAnalysisConfig>,
    options?: { replace?: boolean },
  ) => void;
  onResetAcousticConfig?: () => void;
  onChangeAcousticProvider?: (providerId: string | null) => void;
  onRefreshAcousticProviderState?: () => void;
  acousticConfigOverride?: Partial<import('../utils/acousticOverlayTypes').AcousticAnalysisConfig> | null;
};

export const DEFAULT_AI_PANEL_CONTEXT_VALUE: AiPanelContextValue = {
  dbName: '',
  unitCount: 0,
  translationLayerCount: 0,
  aiConfidenceAvg: null,
  selectedUnit: null,
  selectedRowMeta: null,
  selectedAiWarning: false,
  lexemeMatches: [],
  aiPanelMode: 'auto',
  selectedTranslationGapCount: 0,
  acousticRuntimeStatus: { state: 'idle' },
  acousticSummary: null,
  acousticInspector: null,
  pinnedInspector: null,
  selectedHotspotTimeSec: null,
  acousticDetail: null,
  acousticDetailFullMedia: null,
  acousticBatchDetails: [],
  acousticBatchSelectionCount: 0,
  acousticBatchDroppedSelectionRanges: [],
  acousticCalibrationStatus: 'exploratory',
  acousticProviderPreference: null,
  acousticProviderState: null,
  acousticConfigOverride: null,
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
