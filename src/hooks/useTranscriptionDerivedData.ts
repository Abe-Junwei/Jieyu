import { useCallback, useMemo } from 'react';
import type {
  MediaItemDocType,
  LayerDocType,
  UtteranceDocType,
  UtteranceTextDocType,
} from '../db';
import type { TimelineUnit } from './transcriptionTypes';

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
  const sortLayersByOrder = useCallback((items: LayerDocType[]) => (
    [...items].sort((a, b) => {
      const ao = a.sortOrder ?? 0;
      const bo = b.sortOrder ?? 0;
      if (ao !== bo) return ao - bo;
      return a.id.localeCompare(b.id);
    })
  ), []);

  const translationLayers = useMemo(
    () => sortLayersByOrder(layers.filter((item) => item.layerType === 'translation')),
    [layers, sortLayersByOrder],
  );

  const transcriptionLayers = useMemo(
    () => sortLayersByOrder(layers.filter((item) => item.layerType === 'transcription')),
    [layers, sortLayersByOrder],
  );

  const layerRailRows = useMemo(
    () => [...layers].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [layers],
  );

  const deletableLayers = layers;

  const layerPendingDelete = useMemo(
    () => layers.find((item) => item.id === layerToDeleteId),
    [layerToDeleteId, layers],
  );

  const effectiveSelectedUtteranceId = selectedTimelineUnit?.kind === 'utterance'
    ? selectedTimelineUnit.unitId
    : '';

  const selectedUtterance = useMemo(
    () => utterances.find((item) => item.id === effectiveSelectedUtteranceId),
    [effectiveSelectedUtteranceId, utterances],
  );

  const selectedUtteranceMedia = useMemo(() => {
    const targetId = selectedUtterance?.mediaId ?? selectedMediaId;
    if (targetId) {
      return mediaItems.find((item) => item.id === targetId);
    }
    // No longer fallback to mediaItems[0], allow no-media state
    return undefined;
  }, [mediaItems, selectedMediaId, selectedUtterance?.mediaId]);

  const utterancesSorted = useMemo(() => {
    return [...utterances].sort((a, b) => a.startTime - b.startTime);
  }, [utterances]);

  const utterancesOnCurrentMedia = useMemo(() => {
    if (selectedUtteranceMedia?.id) {
      return utterancesSorted.filter((item) => item.mediaId === selectedUtteranceMedia.id);
    }
    const loadedMediaIds = new Set(mediaItems.map((m) => m.id));
    return utterancesSorted.filter((item) => !item.mediaId || !loadedMediaIds.has(item.mediaId));
  }, [selectedUtteranceMedia?.id, utterancesSorted, mediaItems]);

  const visibleUtterances = useMemo(() => {
    return utterancesOnCurrentMedia;
  }, [utterancesOnCurrentMedia]);

  const aiConfidenceAvg = useMemo(() => {
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
  }, [translations, utterances]);

  const translationTextByLayer = useMemo(() => {
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
  }, [translations]);

  const layerById = useMemo(() => {
    const map = new Map<string, LayerDocType>();
    layers.forEach((layer) => {
      map.set(layer.id, layer);
    });
    return map;
  }, [layers]);

  const defaultTranscriptionLayerId = useMemo(() => {
    const explicitDefault = transcriptionLayers.find((layer) => layer.isDefault);
    if (explicitDefault) return explicitDefault.id;
    return transcriptionLayers[0]?.id;
  }, [transcriptionLayers]);

  const getUtteranceTextForLayer = useCallback((utterance: UtteranceDocType, layerId?: string) => {
    const resolvedLayerId = layerId ?? defaultTranscriptionLayerId;
    if (resolvedLayerId) {
      const fromLayer = translationTextByLayer.get(resolvedLayerId)?.get(utterance.id)?.text;
      if (fromLayer !== undefined) return fromLayer;
    }
    // Fallback: read from the embedded cache for the default transcription layer
    return utterance.transcription?.default ?? '';
  }, [defaultTranscriptionLayerId, translationTextByLayer]);

  const selectedRowMeta = useMemo(() => {
    if (!effectiveSelectedUtteranceId) return null;
    const index = utterancesOnCurrentMedia.findIndex((item) => item.id === effectiveSelectedUtteranceId);
    if (index < 0) return null;
    const row = utterancesOnCurrentMedia[index];
    if (!row) return null;
    return {
      rowNumber: index + 1,
      start: row.startTime,
      end: row.endTime,
    };
  }, [effectiveSelectedUtteranceId, utterancesOnCurrentMedia]);

  return {
    translationLayers,
    transcriptionLayers,
    layerRailRows,
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