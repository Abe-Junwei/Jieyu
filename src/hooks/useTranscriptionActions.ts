import { getDb } from '../db';
import type {
  AnchorDocType,
  LayerLinkDocType,
  MediaItemDocType,
  LayerDocType,
  UtteranceDocType,
  UtteranceTextDocType,
} from '../db';
import type { TimingUndoState } from '../utils/selectionUtils';
import type { SaveState, SnapGuide, TimelineUnit } from './transcriptionTypes';
import { useTranscriptionLayerActions } from './useTranscriptionLayerActions';
import { useTranscriptionUtteranceActions } from './useTranscriptionUtteranceActions';

type Params = {
  defaultTranscriptionLayerId: string | undefined;
  layerById: Map<string, LayerDocType>;
  layers: LayerDocType[];
  layerLinks: LayerLinkDocType[];
  layerToDeleteId: string;
  selectedLayerId: string;
  selectedUtteranceMedia: MediaItemDocType | undefined;
  activeUtteranceUnitId: string;
  translations: UtteranceTextDocType[];
  utterancesRef: React.MutableRefObject<UtteranceDocType[]>;
  utterancesOnCurrentMediaRef: React.MutableRefObject<UtteranceDocType[]>;
  getUtteranceTextForLayer: (utterance: UtteranceDocType, layerId?: string) => string;
  timingGestureRef: React.MutableRefObject<{ active: boolean; utteranceId: string | null }>;
  timingUndoRef: React.MutableRefObject<TimingUndoState | null>;
  pushUndo: (label: string) => void;
  rollbackUndo?: () => Promise<void>;
  createAnchor: (db: Awaited<ReturnType<typeof getDb>>, mediaId: string, time: number) => Promise<AnchorDocType>;
  updateAnchorTime: (db: Awaited<ReturnType<typeof getDb>>, anchorId: string, newTime: number) => Promise<void>;
  pruneOrphanAnchors: (db: Awaited<ReturnType<typeof getDb>>, removedUtteranceIds: Set<string>) => Promise<void>;
  setSaveState: React.Dispatch<React.SetStateAction<SaveState>>;
  setLayerCreateMessage: React.Dispatch<React.SetStateAction<string>>;
  setLayers: React.Dispatch<React.SetStateAction<LayerDocType[]>>;
  setLayerLinks: React.Dispatch<React.SetStateAction<LayerLinkDocType[]>>;
  setLayerToDeleteId: React.Dispatch<React.SetStateAction<string>>;
  setShowLayerManager: React.Dispatch<React.SetStateAction<boolean>>;
  setSelectedLayerId: React.Dispatch<React.SetStateAction<string>>;
  setSelectedMediaId: React.Dispatch<React.SetStateAction<string>>;
  setSnapGuide: React.Dispatch<React.SetStateAction<SnapGuide>>;
  setMediaItems: React.Dispatch<React.SetStateAction<MediaItemDocType[]>>;
  setTranslations: React.Dispatch<React.SetStateAction<UtteranceTextDocType[]>>;
  setUtterances: React.Dispatch<React.SetStateAction<UtteranceDocType[]>>;
  setUtteranceDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setSelectedUtteranceIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setSelectedTimelineUnit?: React.Dispatch<React.SetStateAction<TimelineUnit | null>>;
  allowOverlapInTranscription?: boolean;
};

export function useTranscriptionActions({
  defaultTranscriptionLayerId,
  layerById,
  layers,
  layerLinks,
  layerToDeleteId,
  selectedLayerId,
  selectedUtteranceMedia,
  activeUtteranceUnitId,
  translations,
  utterancesRef,
  utterancesOnCurrentMediaRef,
  getUtteranceTextForLayer,
  timingGestureRef,
  timingUndoRef,
  pushUndo,
  rollbackUndo,
  createAnchor,
  updateAnchorTime,
  pruneOrphanAnchors,
  setSaveState,
  setLayerCreateMessage,
  setLayers,
  setLayerLinks,
  setLayerToDeleteId,
  setShowLayerManager,
  setSelectedLayerId,
  setSelectedMediaId,
  setSnapGuide,
  setMediaItems,
  setTranslations,
  setUtterances,
  setUtteranceDrafts,
  setSelectedUtteranceIds,
  setSelectedTimelineUnit,
  allowOverlapInTranscription = false,
}: Params) {
  const {
    saveVoiceTranslation,
    deleteVoiceTranslation,
    saveUtteranceText,
    saveUtteranceTiming,
    saveTextTranslationForUtterance,
    createNextUtterance,
    createUtteranceFromSelection,
    deleteUtterance,
    mergeWithPrevious,
    mergeWithNext,
    splitUtterance,
    deleteSelectedUtterances,
    offsetSelectedTimes,
    scaleSelectedTimes,
    splitByRegex,
    mergeSelectedUtterances,
  } = useTranscriptionUtteranceActions({
    defaultTranscriptionLayerId,
    layerById,
    selectedUtteranceMedia,
    activeUtteranceUnitId,
    translations,
    utterancesRef,
    utterancesOnCurrentMediaRef,
    getUtteranceTextForLayer,
    timingGestureRef,
    timingUndoRef,
    pushUndo,
    ...(rollbackUndo ? { rollbackUndo } : {}),
    createAnchor,
    updateAnchorTime,
    pruneOrphanAnchors,
    setSaveState,
    setSnapGuide,
    setMediaItems,
    setTranslations,
    setUtterances,
    setUtteranceDrafts,
    setSelectedUtteranceIds,
    ...(setSelectedTimelineUnit ? { setSelectedTimelineUnit } : {}),
    allowOverlapInTranscription,
  });

  const {
    createLayer,
    deleteLayer,
    deleteLayerWithoutConfirm,
    checkLayerHasContent,
    toggleLayerLink,
    addMediaItem,
    reorderLayers,
  } = useTranscriptionLayerActions({
    layers,
    layerLinks,
    layerToDeleteId,
    selectedLayerId,
    utterancesRef,
    pushUndo,
    setLayerCreateMessage,
    setSaveState,
    setLayers,
    setLayerLinks,
    setLayerToDeleteId,
    setShowLayerManager,
    setSelectedLayerId,
    setSelectedMediaId,
    setMediaItems,

    ...(setSelectedTimelineUnit ? { setSelectedTimelineUnit } : {}),
    setTranslations,
    setUtterances,
  });

  return {
    saveVoiceTranslation,
    deleteVoiceTranslation,
    saveUtteranceText,
    saveUtteranceTiming,
    saveTextTranslationForUtterance,
    createNextUtterance,
    createUtteranceFromSelection,
    deleteUtterance,
    mergeWithPrevious,
    mergeWithNext,
    splitUtterance,
    deleteSelectedUtterances,
    offsetSelectedTimes,
    scaleSelectedTimes,
    splitByRegex,
    mergeSelectedUtterances,
    createLayer,
    deleteLayer,
    deleteLayerWithoutConfirm,
    checkLayerHasContent,
    toggleLayerLink,
    addMediaItem,
    reorderLayers,
  };
}
