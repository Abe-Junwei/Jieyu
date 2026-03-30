import { useMemo, type Dispatch, type MutableRefObject, type ReactNode, type SetStateAction } from 'react';
import type { LayerDocType, UtteranceDocType, UtteranceTextDocType } from '../db';
import type { TranscriptionEditorContextValue } from '../contexts/TranscriptionEditorContext';
import type { LayerCreateInput } from '../hooks/transcriptionTypes';
import { formatLayerRailLabel } from '../utils/transcriptionFormatters';

interface RulerViewLike {
  start: number;
  end: number;
}

interface SearchableTranslationLike extends UtteranceTextDocType {
  translationAudioMediaId?: string;
}

interface UseTranscriptionTimelineControllerInput {
  activeSpeakerFilterKey: string;
  utterancesOnCurrentMedia: UtteranceDocType[];
  getUtteranceSpeakerKey: (utterance: UtteranceDocType) => string;
  rulerView: RulerViewLike | null;
  playerDuration: number;
  translations: SearchableTranslationLike[];
  selectedBatchUtterances: UtteranceDocType[];
  transcriptionLayers: LayerDocType[];
  selectedLayerId: string | null;
  getUtteranceTextForLayer: (utterance: UtteranceDocType, layerId?: string) => string;
  utteranceDrafts: TranscriptionEditorContextValue['utteranceDrafts'];
  setUtteranceDrafts: Dispatch<SetStateAction<TranscriptionEditorContextValue['utteranceDrafts']>>;
  translationDrafts: TranscriptionEditorContextValue['translationDrafts'];
  setTranslationDrafts: Dispatch<SetStateAction<TranscriptionEditorContextValue['translationDrafts']>>;
  translationTextByLayer: TranscriptionEditorContextValue['translationTextByLayer'];
  focusedTranslationDraftKeyRef: MutableRefObject<string | null>;
  scheduleAutoSave: TranscriptionEditorContextValue['scheduleAutoSave'];
  clearAutoSaveTimer: TranscriptionEditorContextValue['clearAutoSaveTimer'];
  saveUtteranceText: TranscriptionEditorContextValue['saveUtteranceText'];
  saveTextTranslationForUtterance: TranscriptionEditorContextValue['saveTextTranslationForUtterance'];
  renderLaneLabel: (layer: LayerDocType) => ReactNode;
  createLayer: (
    layerType: 'transcription' | 'translation',
    input: LayerCreateInput,
    modality?: 'text' | 'audio' | 'mixed',
  ) => Promise<boolean>;
  deleteLayer: TranscriptionEditorContextValue['deleteLayer'];
  deleteLayerWithoutConfirm: TranscriptionEditorContextValue['deleteLayerWithoutConfirm'];
  checkLayerHasContent: TranscriptionEditorContextValue['checkLayerHasContent'];
}

interface UseTranscriptionTimelineControllerResult {
  filteredUtterancesOnCurrentMedia: UtteranceDocType[];
  timelineRenderUtterances: UtteranceDocType[];
  translationAudioByLayer: Map<string, Map<string, UtteranceTextDocType>>;
  selectedBatchUtteranceTextById: Record<string, string>;
  batchPreviewLayerOptions: Array<{ id: string; label: string }>;
  batchPreviewTextByLayerId: Record<string, Record<string, string>>;
  defaultBatchPreviewLayerId: string | undefined;
  editorContextValue: TranscriptionEditorContextValue;
}

export function useTranscriptionTimelineController(
  input: UseTranscriptionTimelineControllerInput,
): UseTranscriptionTimelineControllerResult {
  const filteredUtterancesOnCurrentMedia = useMemo(() => {
    if (input.activeSpeakerFilterKey === 'all') return input.utterancesOnCurrentMedia;
    return input.utterancesOnCurrentMedia.filter(
      (utterance) => input.getUtteranceSpeakerKey(utterance) === input.activeSpeakerFilterKey,
    );
  }, [input.activeSpeakerFilterKey, input.getUtteranceSpeakerKey, input.utterancesOnCurrentMedia]);

  const timelineRenderUtterances = useMemo(() => {
    if (!input.rulerView || input.playerDuration <= 0) {
      return filteredUtterancesOnCurrentMedia;
    }
    const viewSpan = Math.max(0, input.rulerView.end - input.rulerView.start);
    const buffer = Math.max(1, viewSpan * 0.45);
    const left = Math.max(0, input.rulerView.start - buffer);
    const right = Math.min(input.playerDuration, input.rulerView.end + buffer);
    return filteredUtterancesOnCurrentMedia.filter(
      (utterance) => utterance.endTime >= left && utterance.startTime <= right,
    );
  }, [filteredUtterancesOnCurrentMedia, input.playerDuration, input.rulerView]);

  const translationAudioByLayer = useMemo(() => {
    const outer = new Map<string, Map<string, UtteranceTextDocType>>();

    input.translations
      .filter((item) => typeof item.translationAudioMediaId === 'string' && item.translationAudioMediaId.trim().length > 0)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .forEach((item) => {
        if (!outer.has(item.layerId)) {
          outer.set(item.layerId, new Map());
        }
        const inner = outer.get(item.layerId)!;
        if (!inner.has(item.utteranceId)) {
          inner.set(item.utteranceId, item);
        }
      });

    return outer;
  }, [input.translations]);

  const selectedBatchUtteranceTextById = useMemo(() => {
    const next: Record<string, string> = {};
    for (const utterance of input.selectedBatchUtterances) {
      next[utterance.id] = input.getUtteranceTextForLayer(utterance) || '';
    }
    return next;
  }, [input.getUtteranceTextForLayer, input.selectedBatchUtterances]);

  const batchPreviewLayerOptions = useMemo(
    () => input.transcriptionLayers.map((layer) => ({
      id: layer.id,
      label: formatLayerRailLabel(layer),
    })),
    [input.transcriptionLayers],
  );

  const batchPreviewTextByLayerId = useMemo(() => {
    const next: Record<string, Record<string, string>> = {};
    for (const layer of input.transcriptionLayers) {
      const layerMap: Record<string, string> = {};
      for (const utterance of input.utterancesOnCurrentMedia) {
        layerMap[utterance.id] = input.getUtteranceTextForLayer(utterance, layer.id) || '';
      }
      next[layer.id] = layerMap;
    }
    return next;
  }, [input.getUtteranceTextForLayer, input.transcriptionLayers, input.utterancesOnCurrentMedia]);

  const defaultBatchPreviewLayerId = useMemo(() => {
    if (input.transcriptionLayers.some((layer) => layer.id === input.selectedLayerId)) {
      return input.selectedLayerId ?? undefined;
    }
    return input.transcriptionLayers[0]?.id;
  }, [input.selectedLayerId, input.transcriptionLayers]);

  const editorContextValue = useMemo<TranscriptionEditorContextValue>(() => ({
    utteranceDrafts: input.utteranceDrafts,
    setUtteranceDrafts: input.setUtteranceDrafts,
    translationDrafts: input.translationDrafts,
    setTranslationDrafts: input.setTranslationDrafts,
    translationTextByLayer: input.translationTextByLayer,
    focusedTranslationDraftKeyRef: input.focusedTranslationDraftKeyRef,
    scheduleAutoSave: input.scheduleAutoSave,
    clearAutoSaveTimer: input.clearAutoSaveTimer,
    saveUtteranceText: input.saveUtteranceText,
    saveTextTranslationForUtterance: input.saveTextTranslationForUtterance,
    getUtteranceTextForLayer: input.getUtteranceTextForLayer,
    renderLaneLabel: input.renderLaneLabel,
    createLayer: input.createLayer,
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
    input.getUtteranceTextForLayer,
    input.renderLaneLabel,
    input.saveTextTranslationForUtterance,
    input.saveUtteranceText,
    input.scheduleAutoSave,
    input.setTranslationDrafts,
    input.setUtteranceDrafts,
    input.translationDrafts,
    input.translationTextByLayer,
    input.utteranceDrafts,
  ]);

  return {
    filteredUtterancesOnCurrentMedia,
    timelineRenderUtterances,
    translationAudioByLayer,
    selectedBatchUtteranceTextById,
    batchPreviewLayerOptions,
    batchPreviewTextByLayerId,
    defaultBatchPreviewLayerId,
    editorContextValue,
  };
}