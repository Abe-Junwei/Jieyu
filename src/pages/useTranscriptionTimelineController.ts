import { useMemo, type Dispatch, type MutableRefObject, type ReactNode, type SetStateAction } from 'react';
import type { LayerDocType, LayerUnitDocType, LayerUnitContentDocType, LayerUnitContentViewDocType } from '../db';
import type { TranscriptionEditorContextValue } from '../contexts/TranscriptionEditorContext';
import type { LayerCreateInput } from '../hooks/transcriptionTypes';
import { formatSidePaneLayerLabel } from '../utils/transcriptionFormatters';

interface RulerViewLike {
  start: number;
  end: number;
}

interface SearchableTranslationLike extends LayerUnitContentViewDocType {}

interface UseTranscriptionTimelineControllerInput {
  activeSpeakerFilterKey: string;
  unitsOnCurrentMedia: LayerUnitDocType[];
  getUnitSpeakerKey: (unit: LayerUnitDocType) => string;
  rulerView: RulerViewLike | null;
  playerDuration: number;
  translations: SearchableTranslationLike[];
  selectedBatchUnits: LayerUnitDocType[];
  transcriptionLayers: LayerDocType[];
  selectedLayerId: string | null;
  getUnitTextForLayer: (unit: LayerUnitDocType, layerId?: string) => string;
  unitDrafts: TranscriptionEditorContextValue['unitDrafts'];
  setUnitDrafts: Dispatch<SetStateAction<TranscriptionEditorContextValue['unitDrafts']>>;
  translationDrafts: TranscriptionEditorContextValue['translationDrafts'];
  setTranslationDrafts: Dispatch<SetStateAction<TranscriptionEditorContextValue['translationDrafts']>>;
  translationTextByLayer: TranscriptionEditorContextValue['translationTextByLayer'];
  focusedTranslationDraftKeyRef: MutableRefObject<string | null>;
  scheduleAutoSave: TranscriptionEditorContextValue['scheduleAutoSave'];
  clearAutoSaveTimer: TranscriptionEditorContextValue['clearAutoSaveTimer'];
  saveUnitText: TranscriptionEditorContextValue['saveUnitText'];
  saveUnitLayerText: TranscriptionEditorContextValue['saveUnitLayerText'];
  renderLaneLabel: (layer: LayerDocType) => ReactNode;
  createLayer: (
    layerType: 'transcription' | 'translation',
    input: LayerCreateInput,
    modality?: 'text' | 'audio' | 'mixed',
  ) => Promise<boolean>;
  updateLayerMetadata?: TranscriptionEditorContextValue['updateLayerMetadata'];
  deleteLayer: TranscriptionEditorContextValue['deleteLayer'];
  deleteLayerWithoutConfirm: TranscriptionEditorContextValue['deleteLayerWithoutConfirm'];
  checkLayerHasContent: TranscriptionEditorContextValue['checkLayerHasContent'];
}

interface UseTranscriptionTimelineControllerResult {
  filteredUnitsOnCurrentMedia: LayerUnitDocType[];
  timelineRenderUnits: LayerUnitDocType[];
  translationAudioByLayer: Map<string, Map<string, LayerUnitContentDocType>>;
  selectedBatchUnitTextById: Record<string, string>;
  batchPreviewLayerOptions: Array<{ id: string; label: string }>;
  batchPreviewTextByLayerId: Record<string, Record<string, string>>;
  defaultBatchPreviewLayerId: string | undefined;
  editorContextValue: TranscriptionEditorContextValue;
}

export function useTranscriptionTimelineController(
  input: UseTranscriptionTimelineControllerInput,
): UseTranscriptionTimelineControllerResult {
  const filteredUnitsOnCurrentMedia = useMemo(() => {
    if (input.activeSpeakerFilterKey === 'all') return input.unitsOnCurrentMedia;
    return input.unitsOnCurrentMedia.filter(
      (unit) => input.getUnitSpeakerKey(unit) === input.activeSpeakerFilterKey,
    );
  }, [input.activeSpeakerFilterKey, input.getUnitSpeakerKey, input.unitsOnCurrentMedia]);

  /** 视窗裁剪：减少轨上单元数量；长列表 DOM 级虚拟化见 `@tanstack/react-virtual` 路线图（TranscriptionTimelineHorizontalMediaLanes）。 */
  const timelineRenderUnits = useMemo(() => {
    if (!input.rulerView || input.playerDuration <= 0) {
      return filteredUnitsOnCurrentMedia;
    }
    const viewSpan = Math.max(0, input.rulerView.end - input.rulerView.start);
    const buffer = Math.max(1, viewSpan * 0.45);
    const left = Math.max(0, input.rulerView.start - buffer);
    const right = Math.min(input.playerDuration, input.rulerView.end + buffer);
    return filteredUnitsOnCurrentMedia.filter(
      (unit) => unit.endTime >= left && unit.startTime <= right,
    );
  }, [filteredUnitsOnCurrentMedia, input.playerDuration, input.rulerView]);

  const translationAudioByLayer = useMemo(() => {
    const outer = new Map<string, Map<string, LayerUnitContentDocType>>();

    input.translations
      .filter((item) => typeof item.translationAudioMediaId === 'string' && item.translationAudioMediaId.trim().length > 0)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .forEach((item) => {
        const layerId = item.layerId?.trim();
        const unitId = item.unitId?.trim();
        if (!layerId || !unitId) return;
        if (!outer.has(layerId)) {
          outer.set(layerId, new Map());
        }
        const inner = outer.get(layerId)!;
        if (!inner.has(unitId)) {
          inner.set(unitId, item);
        }
      });

    return outer;
  }, [input.translations]);

  const selectedBatchUnitTextById = useMemo(() => {
    const next: Record<string, string> = {};
    for (const unit of input.selectedBatchUnits) {
      next[unit.id] = input.getUnitTextForLayer(unit) || '';
    }
    return next;
  }, [input.getUnitTextForLayer, input.selectedBatchUnits]);

  const batchPreviewLayerOptions = useMemo(
    () => input.transcriptionLayers.map((layer) => ({
      id: layer.id,
      label: formatSidePaneLayerLabel(layer),
    })),
    [input.transcriptionLayers],
  );

  const batchPreviewTextByLayerId = useMemo(() => {
    const next: Record<string, Record<string, string>> = {};
    for (const layer of input.transcriptionLayers) {
      const layerMap: Record<string, string> = {};
      for (const unit of input.unitsOnCurrentMedia) {
        layerMap[unit.id] = input.getUnitTextForLayer(unit, layer.id) || '';
      }
      next[layer.id] = layerMap;
    }
    return next;
  }, [input.getUnitTextForLayer, input.transcriptionLayers, input.unitsOnCurrentMedia]);

  const defaultBatchPreviewLayerId = useMemo(() => {
    if (input.transcriptionLayers.some((layer) => layer.id === input.selectedLayerId)) {
      return input.selectedLayerId ?? undefined;
    }
    return input.transcriptionLayers[0]?.id;
  }, [input.selectedLayerId, input.transcriptionLayers]);

  const editorContextValue = useMemo<TranscriptionEditorContextValue>(() => ({
    unitDrafts: input.unitDrafts,
    setUnitDrafts: input.setUnitDrafts,
    translationDrafts: input.translationDrafts,
    setTranslationDrafts: input.setTranslationDrafts,
    translationTextByLayer: input.translationTextByLayer,
    focusedTranslationDraftKeyRef: input.focusedTranslationDraftKeyRef,
    scheduleAutoSave: input.scheduleAutoSave,
    clearAutoSaveTimer: input.clearAutoSaveTimer,
    saveUnitText: input.saveUnitText,
    saveUnitLayerText: input.saveUnitLayerText,
    getUnitTextForLayer: input.getUnitTextForLayer,
    renderLaneLabel: input.renderLaneLabel,
    createLayer: input.createLayer,
    ...(input.updateLayerMetadata ? { updateLayerMetadata: input.updateLayerMetadata } : {}),
    deleteLayer: input.deleteLayer,
    deleteLayerWithoutConfirm: input.deleteLayerWithoutConfirm,
    checkLayerHasContent: input.checkLayerHasContent,
  }), [
    input.checkLayerHasContent,
    input.clearAutoSaveTimer,
    input.createLayer,
    input.deleteLayer,
    input.deleteLayerWithoutConfirm,
    input.focusedTranslationDraftKeyRef,
    input.getUnitTextForLayer,
    input.renderLaneLabel,
    input.updateLayerMetadata,
    input.saveUnitLayerText,
    input.saveUnitText,
    input.scheduleAutoSave,
    input.setTranslationDrafts,
    input.setUnitDrafts,
    input.translationDrafts,
    input.translationTextByLayer,
    input.unitDrafts,
  ]);

  return {
    filteredUnitsOnCurrentMedia,
    timelineRenderUnits,
    translationAudioByLayer,
    selectedBatchUnitTextById,
    batchPreviewLayerOptions,
    batchPreviewTextByLayerId,
    defaultBatchPreviewLayerId,
    editorContextValue,
  };
}