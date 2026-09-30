import { useCallback, useMemo } from 'react';
import type {
  MediaItemDocType,
  LayerDocType,
  LayerUnitDocType,
  LayerUnitContentDocType,
} from '../../db';
import { layerTextLookupUnitId } from '../../utils/recordingScopeUnitId';
import { pickDefaultTranscriptionText } from '../../utils/transcriptionFormatters';
import { isUnboundTimelineMedia } from './timelineUnitView';
import { isUnitTimelineUnit, type TimelineUnit } from './transcriptionTypes';

function sortLayersByOrder(items: LayerDocType[]) {
  return [...items].sort((a, b) => {
    const ao = a.sortOrder ?? 0;
    const bo = b.sortOrder ?? 0;
    if (ao !== bo) return ao - bo;
    return a.id.localeCompare(b.id);
  });
}

function buildTranslationTextByLayer(translations: LayerUnitContentDocType[]) {
  const outer = new Map<string, Map<string, LayerUnitContentDocType>>();

  translations
    .filter((item) => (item.modality === 'text' || item.modality === 'mixed') && Boolean(item.text))
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
}

function computeAiConfidenceAvg(
  units: LayerUnitDocType[],
  translations: LayerUnitContentDocType[],
) {
  const values: number[] = [];
  units.forEach((item) => {
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
  units: LayerUnitDocType[];
  translations: LayerUnitContentDocType[];
  /** Media ids that hold this recording's sentences but are not the open item. */
  recordedMediaIds?: readonly string[];
};

export function useTranscriptionDerivedData({
  layers,
  layerToDeleteId,
  selectedTimelineUnit,
  selectedMediaId,
  mediaItems,
  units,
  translations,
  recordedMediaIds = [],
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

  const effectiveSelectedUnitId = isUnitTimelineUnit(selectedTimelineUnit)
    ? selectedTimelineUnit.unitId
    : '';

  const selectedUnit = useMemo(
    () => units.find((item) => item.id === effectiveSelectedUnitId),
    [effectiveSelectedUnitId, units],
  );

  const { selectedUnitMedia, unitsOnCurrentMedia, selectedRowMeta } = useMemo(() => {
    const selectedUnitMedia = selectedMediaId
      ? mediaItems.find((item) => item.id === selectedMediaId)
      : undefined;
    const unitsSorted = [...units].sort((a, b) => a.startTime - b.startTime);
    const loadedMediaIds = new Set(mediaItems.map((item) => item.id));
    const recordedMediaIdSet = new Set(recordedMediaIds);
    const unitsOnCurrentMedia = selectedUnitMedia?.id
      ? unitsSorted.filter((item) => {
          const mediaId = item.mediaId ?? '';
          return (
            mediaId === selectedUnitMedia.id ||
            isUnboundTimelineMedia(mediaId) ||
            recordedMediaIdSet.has(mediaId)
          );
        })
      : selectedMediaId.length > 0 && loadedMediaIds.size > 0
        ? unitsSorted.filter((item) => !item.mediaId || loadedMediaIds.has(item.mediaId ?? ''))
        : unitsSorted.filter((item) => !item.mediaId || !loadedMediaIds.has(item.mediaId));

    if (!effectiveSelectedUnitId) {
      return {
        selectedUnitMedia,
        unitsOnCurrentMedia,
        selectedRowMeta: null,
      };
    }

    const index = unitsOnCurrentMedia.findIndex((item) => item.id === effectiveSelectedUnitId);
    const row = index >= 0 ? unitsOnCurrentMedia[index] : undefined;

    return {
      selectedUnitMedia,
      unitsOnCurrentMedia,
      selectedRowMeta: row
        ? {
            rowNumber: index + 1,
            start: row.startTime,
            end: row.endTime,
          }
        : null,
    };
  }, [effectiveSelectedUnitId, mediaItems, recordedMediaIds, selectedMediaId, units]);

  const visibleUnits = unitsOnCurrentMedia;

  const aiConfidenceAvg = useMemo(
    () => computeAiConfidenceAvg(units, translations),
    [translations, units],
  );

  const translationTextByLayer = useMemo(
    () => buildTranslationTextByLayer(translations),
    [translations],
  );

  const getUnitTextForLayer = useCallback(
    (unit: LayerUnitDocType, layerId?: string) => {
      const resolvedLayerId = layerId ?? defaultTranscriptionLayerId;
      const readLayer = (id: string | undefined): string => {
        if (!id) return '';
        const lookupId = layerTextLookupUnitId(unit);
        const fromLayer =
          translationTextByLayer.get(id)?.get(lookupId)?.text ??
          (lookupId !== unit.id ? translationTextByLayer.get(id)?.get(unit.id)?.text : undefined);
        return typeof fromLayer === 'string' ? fromLayer.trim() : '';
      };
      const direct = readLayer(resolvedLayerId);
      if (direct.length > 0) return direct;
      const onTranscriptionLayer =
        resolvedLayerId !== undefined &&
        transcriptionLayers.some((layer) => layer.id === resolvedLayerId);
      if (onTranscriptionLayer) {
        for (const layer of transcriptionLayers) {
          if (layer.id === resolvedLayerId) continue;
          const next = readLayer(layer.id);
          if (next.length > 0) return next;
        }
      }
      return pickDefaultTranscriptionText(unit.transcription);
    },
    [defaultTranscriptionLayerId, transcriptionLayers, translationTextByLayer],
  );

  return {
    orderedLayers,
    translationLayers,
    transcriptionLayers,
    sidePaneRows,
    deletableLayers,
    layerPendingDelete,
    selectedUnit,
    selectedUnitMedia,
    unitsOnCurrentMedia,
    visibleUnits,
    aiConfidenceAvg,
    translationTextByLayer,
    layerById,
    defaultTranscriptionLayerId,
    getUnitTextForLayer,
    selectedRowMeta,
  };
}
