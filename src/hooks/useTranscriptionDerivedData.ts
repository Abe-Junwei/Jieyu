import { useCallback, useMemo } from 'react';
import type {
  MediaItemDocType,
  LayerDocType,
  UtteranceDocType,
  UtteranceTextDocType,
} from '../db';
import { isUtteranceTimelineUnit, type TimelineUnit } from './transcriptionTypes';

function sortLayersByOrder(items: LayerDocType[]) {
  return [...items].sort((a, b) => {
    const ao = a.sortOrder ?? 0;
    const bo = b.sortOrder ?? 0;
    if (ao !== bo) return ao - bo;
    return a.id.localeCompare(b.id);
  });
}

function buildTranslationTextByLayer(translations: UtteranceTextDocType[]) {
  const outer = new Map<string, Map<string, UtteranceTextDocType>>();

  translations
    .filter(
      (item) =>
        (item.modality === 'text' || item.modality === 'mixed') &&
        Boolean(item.text),
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .forEach((item) => {
      const layerId = item.layerId;
      if (!outer.has(layerId)) {
        outer.set(layerId, new Map());
      }
      const inner = outer.get(layerId)!;
      if (!inner.has(item.utteranceId)) {
        inner.set(item.utteranceId, item);
      }
    });

  return outer;
}

function computeAiConfidenceAvg(
  utterances: UtteranceDocType[],
  translations: UtteranceTextDocType[],
) {
  const values: number[] = [];
  utterances.forEach((item) => {
    if (typeof item.ai_metadata?.confidence === 'number') {
      values.push(item.ai_metadata.confidence);
    }
  });
  translations.forEach((item) => {
    if (item.sourceType === 'ai' && typeof item.ai_metadata?.confidence === 'number') {
      values.push(item.ai_metadata.confidence);
    }
  });

  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

type Params = {
  layers: LayerDocType[];
  layerToDeleteId: string;
  selectedTimelineUnit?: TimelineUnit | null;
  selectedMediaId: string;
  mediaItems: MediaItemDocType[];
  utterances: UtteranceDocType[];
  translations: UtteranceTextDocType[];
};

export function useTranscriptionDerivedData({
  layers,
  layerToDeleteId,
  selectedTimelineUnit,
  selectedMediaId,
  mediaItems,
  utterances,
  translations,
}: Params) {
  const {
    orderedLayers,
    translationLayers,
    transcriptionLayers,
    layerPendingDelete,
    layerById,
    defaultTranscriptionLayerId,
  } = useMemo(() => {
    const orderedLayers = sortLayersByOrder(layers);
    const translationLayers = orderedLayers.filter((item) => item.layerType === 'translation');
    const transcriptionLayers = orderedLayers.filter((item) => item.layerType === 'transcription');
    const layerById = new Map<string, LayerDocType>();
    orderedLayers.forEach((layer) => {
      layerById.set(layer.id, layer);
    });
    const explicitDefault = transcriptionLayers.find((layer) => layer.isDefault);

    return {
      orderedLayers,
      translationLayers,
      transcriptionLayers,
      layerPendingDelete: orderedLayers.find((item) => item.id === layerToDeleteId),
      layerById,
      defaultTranscriptionLayerId: explicitDefault?.id ?? transcriptionLayers[0]?.id,
    };
  }, [layerToDeleteId, layers]);

  const sidePaneRows = orderedLayers;

  const deletableLayers = layers;

  const effectiveSelectedUtteranceId = isUtteranceTimelineUnit(selectedTimelineUnit)
    ? selectedTimelineUnit.unitId
    : '';

  const selectedUtterance = useMemo(
    () => utterances.find((item) => item.id === effectiveSelectedUtteranceId),
    [effectiveSelectedUtteranceId, utterances],
  );

  const {
    selectedUtteranceMedia,
    utterancesOnCurrentMedia,
    selectedRowMeta,
  } = useMemo(() => {
    const selectedUtteranceMedia = selectedMediaId
      ? mediaItems.find((item) => item.id === selectedMediaId)
      : undefined;
    const utterancesSorted = [...utterances].sort((a, b) => a.startTime - b.startTime);
    const utterancesOnCurrentMedia = selectedUtteranceMedia?.id
      ? utterancesSorted.filter((item) => item.mediaId === selectedUtteranceMedia.id)
      : (() => {
        const loadedMediaIds = new Set(mediaItems.map((m) => m.id));
        return utterancesSorted.filter((item) => !item.mediaId || !loadedMediaIds.has(item.mediaId));
      })();

    if (!effectiveSelectedUtteranceId) {
      return {
        selectedUtteranceMedia,
        utterancesOnCurrentMedia,
        selectedRowMeta: null,
      };
    }

    const index = utterancesOnCurrentMedia.findIndex((item) => item.id === effectiveSelectedUtteranceId);
    const row = index >= 0 ? utterancesOnCurrentMedia[index] : undefined;

    return {
      selectedUtteranceMedia,
      utterancesOnCurrentMedia,
      selectedRowMeta: row
        ? {
          rowNumber: index + 1,
          start: row.startTime,
          end: row.endTime,
        }
        : null,
    };
  }, [effectiveSelectedUtteranceId, mediaItems, selectedMediaId, utterances]);

  const visibleUtterances = utterancesOnCurrentMedia;

  const aiConfidenceAvg = useMemo(
    () => computeAiConfidenceAvg(utterances, translations),
    [translations, utterances],
  );

  const translationTextByLayer = useMemo(
    () => buildTranslationTextByLayer(translations),
    [translations],
  );

  const getUtteranceTextForLayer = useCallback((utterance: UtteranceDocType, layerId?: string) => {
    const resolvedLayerId = layerId ?? defaultTranscriptionLayerId;
    if (resolvedLayerId) {
      const fromLayer = translationTextByLayer.get(resolvedLayerId)?.get(utterance.id)?.text;
      if (fromLayer !== undefined) return fromLayer;
    }
    // Fallback: read from the embedded cache for the default transcription layer
    return utterance.transcription?.default ?? '';
  }, [defaultTranscriptionLayerId, translationTextByLayer]);

  return {
    orderedLayers,
    translationLayers,
    transcriptionLayers,
    sidePaneRows,
    deletableLayers,
    layerPendingDelete,
    selectedUtterance,
    selectedUtteranceMedia,
    utterancesOnCurrentMedia,
    visibleUtterances,
    aiConfidenceAvg,
    translationTextByLayer,
    layerById,
    defaultTranscriptionLayerId,
    getUtteranceTextForLayer,
    selectedRowMeta,
  };
}