import { getDb } from '../db';
import type { AnchorDocType, LayerLinkDocType, MediaItemDocType, LayerDocType, LayerUnitDocType, LayerUnitContentDocType } from '../db';
import type { TimingUndoState } from '../utils/selectionUtils';
import type { SaveState, SnapGuide, TimelineUnit } from './transcriptionTypes';
import { useTranscriptionLayerActions } from './useTranscriptionLayerActions';
import { useTranscriptionUnitActions } from './useTranscriptionUnitActions';

type Params = {
  defaultTranscriptionLayerId: string | undefined;
  layerById: Map<string, LayerDocType>;
  layers: LayerDocType[];
  layerLinks: LayerLinkDocType[];
  layerToDeleteId: string;
  selectedLayerId: string;
  selectedUnitMedia: MediaItemDocType | undefined;
  activeUnitId: string;
  translations: LayerUnitContentDocType[];
  unitsRef: React.MutableRefObject<LayerUnitDocType[]>;
  unitsOnCurrentMediaRef: React.MutableRefObject<LayerUnitDocType[]>;
  getUnitTextForLayer: (unit: LayerUnitDocType, layerId?: string) => string;
  timingGestureRef: React.MutableRefObject<{ active: boolean; unitId: string | null }>;
  timingUndoRef: React.MutableRefObject<TimingUndoState | null>;
  pushUndo: (label: string) => void;
  rollbackUndo?: () => Promise<void>;
  createAnchor: (db: Awaited<ReturnType<typeof getDb>>, mediaId: string, time: number) => Promise<AnchorDocType>;
  updateAnchorTime: (db: Awaited<ReturnType<typeof getDb>>, anchorId: string, newTime: number) => Promise<void>;
  pruneOrphanAnchors: (db: Awaited<ReturnType<typeof getDb>>, removedUnitIds: Set<string>) => Promise<void>;
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
  setTranslations: React.Dispatch<React.SetStateAction<LayerUnitContentDocType[]>>;
  setUnits: React.Dispatch<React.SetStateAction<LayerUnitDocType[]>>;
  setUnitDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setSelectedUnitIds: React.Dispatch<React.SetStateAction<Set<string>>>;
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
  selectedUnitMedia,
  activeUnitId,
  translations,
  unitsRef,
  unitsOnCurrentMediaRef,
  getUnitTextForLayer,
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
  setUnits,
  setUnitDrafts,
  setSelectedUnitIds,
  setSelectedTimelineUnit,
  allowOverlapInTranscription = false,
}: Params) {
  const {
    saveVoiceTranslation,
    deleteVoiceTranslation,
    saveUnitText,
    saveUnitSelfCertainty,
    saveUnitTiming,
    saveUnitLayerText,
    createAdjacentUnit,
    createUnitFromSelection,
    deleteUnit,
    mergeWithPrevious,
    mergeWithNext,
    splitUnit,
    deleteSelectedUnits,
    offsetSelectedTimes,
    scaleSelectedTimes,
    splitByRegex,
    mergeSelectedUnits,
  } = useTranscriptionUnitActions({
    defaultTranscriptionLayerId,
    layerById,
    selectedUnitMedia,
    activeUnitId,
    translations,
    unitsRef,
    unitsOnCurrentMediaRef,
    getUnitTextForLayer,
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
    setUnits,
    setUnitDrafts,
    setSelectedUnitIds,
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
    unitsRef,
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
    setSelectedUnitIds,

    ...(setSelectedTimelineUnit ? { setSelectedTimelineUnit } : {}),
    setTranslations,
    setUnits,
  });

  return {
    saveVoiceTranslation,
    deleteVoiceTranslation,
    saveUnitText,
    saveUnitSelfCertainty,
    saveUnitTiming,
    saveUnitLayerText,
    createAdjacentUnit,
    createUnitFromSelection,
    deleteUnit,
    mergeWithPrevious,
    mergeWithNext,
    splitUnit,
    deleteSelectedUnits,
    offsetSelectedTimes,
    scaleSelectedTimes,
    splitByRegex,
    mergeSelectedUnits,
    createLayer,
    deleteLayer,
    deleteLayerWithoutConfirm,
    checkLayerHasContent,
    toggleLayerLink,
    addMediaItem,
    reorderLayers,
  };
}
