import type { Dispatch, SetStateAction } from 'react';
import type { LayerDocType, UtteranceDocType } from '../db';
import type { TimelineUnitView } from '../hooks/timelineUnitView';
import type { AiPanelContextValue } from '../contexts/AiPanelContext';
import type { SaveState, TimelineUnit } from '../hooks/transcriptionTypes';
import type { AiChatSettings } from '../hooks/useAiChat';
import type { VoiceAgentMode } from '../hooks/useVoiceAgent';
import type { VoiceIntent, VoiceSession } from '../services/IntentRouter';
import type { DictationPipelineCallbacks, QuickDictationConfig } from '../services/SpeechAnnotationPipeline';

interface SelectedRowMetaLike {
  rowNumber: number;
  start: number;
  end: number;
}

interface ReadyStateLike {
  phase: string;
  dbName?: string;
  unitCount?: number;
  translationLayerCount?: number;
}

export interface UseTranscriptionAssistantControllerInput {
  state: ReadyStateLike;
  unitsLength: number;
  translationLayersLength: number;
  aiConfidenceAvg: number | null;
  selectedPrimaryUnitView: TimelineUnitView | null;
  /** Backing utterance row for voice dictation / persistence (derived from timeline selection). */
  selectedTimelineOwnerUnit: UtteranceDocType | null;
  selectedTimelineRowMeta: SelectedRowMetaLike | null;
  selectedAiWarning: boolean;
  lexemeMatches: AiPanelContextValue['lexemeMatches'];
  handleOpenWordNote: AiPanelContextValue['onOpenWordNote'];
  handleOpenMorphemeNote: AiPanelContextValue['onOpenMorphemeNote'];
  handleUpdateTokenPos: AiPanelContextValue['onUpdateTokenPos'];
  handleBatchUpdateTokenPosByForm: AiPanelContextValue['onBatchUpdateTokenPosByForm'];
  aiPanelMode: NonNullable<AiPanelContextValue['aiPanelMode']>;
  setAiPanelMode: Dispatch<SetStateAction<NonNullable<AiPanelContextValue['aiPanelMode']>>>;
  aiCurrentTask: AiPanelContextValue['aiCurrentTask'];
  aiVisibleCards: AiPanelContextValue['aiVisibleCards'];
  selectedTranslationGapCount: number;
  vadCacheStatus?: AiPanelContextValue['vadCacheStatus'];
  acousticRuntimeStatus?: AiPanelContextValue['acousticRuntimeStatus'];
  acousticSummary?: AiPanelContextValue['acousticSummary'];
  acousticInspector?: AiPanelContextValue['acousticInspector'];
  pinnedInspector?: AiPanelContextValue['pinnedInspector'];
  selectedHotspotTimeSec?: AiPanelContextValue['selectedHotspotTimeSec'];
  acousticDetail?: AiPanelContextValue['acousticDetail'];
  acousticDetailFullMedia?: AiPanelContextValue['acousticDetailFullMedia'];
  acousticBatchDetails?: AiPanelContextValue['acousticBatchDetails'];
  acousticBatchSelectionCount?: AiPanelContextValue['acousticBatchSelectionCount'];
  acousticBatchDroppedSelectionRanges?: AiPanelContextValue['acousticBatchDroppedSelectionRanges'];
  acousticCalibrationStatus?: AiPanelContextValue['acousticCalibrationStatus'];
  handleJumpToTranslationGap: NonNullable<AiPanelContextValue['onJumpToTranslationGap']>;
  handleJumpToAcousticHotspot?: AiPanelContextValue['onJumpToAcousticHotspot'];
  handlePinInspector?: AiPanelContextValue['onPinInspector'];
  handleClearPinnedInspector?: AiPanelContextValue['onClearPinnedInspector'];
  handleSelectHotspot?: AiPanelContextValue['onSelectHotspot'];
  handleChangeAcousticConfig?: AiPanelContextValue['onChangeAcousticConfig'];
  handleResetAcousticConfig?: AiPanelContextValue['onResetAcousticConfig'];
  handleChangeAcousticProvider?: AiPanelContextValue['onChangeAcousticProvider'];
  handleRefreshAcousticProviderState?: AiPanelContextValue['onRefreshAcousticProviderState'];
  acousticConfigOverride?: AiPanelContextValue['acousticConfigOverride'];
  acousticProviderPreference?: AiPanelContextValue['acousticProviderPreference'];
  acousticProviderState?: AiPanelContextValue['acousticProviderState'];
  setAiPanelContext: Dispatch<SetStateAction<AiPanelContextValue>>;
  selectedTimelineUnit: TimelineUnit | null;
  saveSegmentContentForLayer: (segmentId: string, layerId: string, value: string) => Promise<void>;
  selectedLayerId: string | null;
  defaultTranscriptionLayerId?: string;
  translationLayers: LayerDocType[];
  layers: LayerDocType[];
  utterancesOnCurrentMedia: UtteranceDocType[];
  getUtteranceTextForLayer: (utterance: UtteranceDocType, layerId?: string) => string;
  saveUtteranceText: (utteranceId: string, text: string, layerId?: string) => Promise<void>;
  saveTextTranslationForUtterance: (utteranceId: string, text: string, layerId: string) => Promise<void>;
  setSaveState: (state: SaveState) => void;
  nextUtteranceIdForVoiceDictation?: string;
  selectUnit: (utteranceId: string) => void;
  aiChatEnabled: boolean;
  aiChatSettings: AiChatSettings;
  pushUndo: (label: string) => void;
  setUtterances: Dispatch<SetStateAction<UtteranceDocType[]>>;
}

export interface UseTranscriptionAssistantControllerResult {
  aiPanelContextValue: AiPanelContextValue;
  handleResolveVoiceIntentWithLlm: (input: {
    text: string;
    mode: VoiceAgentMode;
    session: VoiceSession;
  }) => Promise<VoiceIntent | null>;
  handleVoiceDictation: (text: string) => void;
  voiceDictationPipeline?: {
    callbacks: DictationPipelineCallbacks;
    config?: QuickDictationConfig;
  };
  handleVoiceAnalysisResult: (utteranceId: string | null, analysisText: string) => Promise<{ ok: boolean; message: string }>;
}
