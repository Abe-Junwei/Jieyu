import type { LayerUnitDocType, MediaItemDocType } from '../types/jieyuDbDocTypes';
import type { SearchableItem } from './searchReplaceUtils';
import { isAuxiliaryRecordingMediaRow, isMediaItemPlaceholderRow } from './mediaItemTimelineKind';

export type AudioImportDisposition =
  | { kind: 'simple' }
  | { kind: 'choose'; replaceMediaId: string; replaceLabel: string };

export function computeAudioImportDisposition(input: {
  activeTextId: string | null | undefined;
  mediaItems: MediaItemDocType[];
  selectedTimelineMedia: MediaItemDocType | null | undefined;
}): AudioImportDisposition {
  const { activeTextId, mediaItems, selectedTimelineMedia } = input;
  if (activeTextId == null || activeTextId === '') return { kind: 'simple' };
  const projectMedia = mediaItems.filter((m) => m.textId === activeTextId);
  const hasAcoustic = projectMedia.some(
    (m) => !isMediaItemPlaceholderRow(m) && !isAuxiliaryRecordingMediaRow(m),
  );
  if (!hasAcoustic) return { kind: 'simple' };
  const replaceTarget =
    (selectedTimelineMedia != null && projectMedia.some((m) => m.id === selectedTimelineMedia.id)
      ? selectedTimelineMedia
      : projectMedia.find(
          (m) => !isMediaItemPlaceholderRow(m) && !isAuxiliaryRecordingMediaRow(m),
        )) ?? null;
  if (!replaceTarget) return { kind: 'simple' };
  return {
    kind: 'choose',
    replaceMediaId: replaceTarget.id,
    replaceLabel: replaceTarget.filename,
  };
}

type TranscriptionLayerLite = {
  id: string;
  languageId?: string;
  orthographyId?: string;
};

type TranslationLayerLite = {
  id: string;
  languageId?: string;
  orthographyId?: string;
};

export function buildProjectMediaSearchableItems(input: {
  transcriptionLayers: readonly TranscriptionLayerLite[];
  translationLayers: readonly TranslationLayerLite[];
  unitsOnCurrentMedia: readonly LayerUnitDocType[];
  getUnitTextForLayer: (unit: LayerUnitDocType, layerId?: string) => string;
  translationTextByLayer: ReadonlyMap<string, ReadonlyMap<string, { text?: string }>>;
}): SearchableItem[] {
  const {
    transcriptionLayers,
    translationLayers,
    unitsOnCurrentMedia,
    getUnitTextForLayer,
    translationTextByLayer,
  } = input;
  const items: SearchableItem[] = [];

  if (transcriptionLayers.length === 0) {
    for (const unit of unitsOnCurrentMedia) {
      items.push({
        unitId: unit.id,
        layerKind: 'transcription',
        text: getUnitTextForLayer(unit),
      });
    }
  } else {
    for (const layer of transcriptionLayers) {
      for (const unit of unitsOnCurrentMedia) {
        const text = getUnitTextForLayer(unit, layer.id);
        if (text !== '') {
          items.push({
            unitId: unit.id,
            layerId: layer.id,
            layerKind: 'transcription',
            ...(layer.languageId !== undefined && layer.languageId !== ''
              ? { languageId: layer.languageId }
              : {}),
            ...(layer.orthographyId !== undefined && layer.orthographyId !== ''
              ? { orthographyId: layer.orthographyId }
              : {}),
            text,
          });
        }
      }
    }
  }

  for (const layer of translationLayers) {
    const layerMap = translationTextByLayer.get(layer.id);
    if (!layerMap) continue;
    for (const unit of unitsOnCurrentMedia) {
      const translation = layerMap.get(unit.id);
      const translationText = translation?.text;
      if (translationText !== undefined && translationText !== '') {
        items.push({
          unitId: unit.id,
          layerId: layer.id,
          layerKind: 'translation',
          ...(layer.languageId !== undefined && layer.languageId !== ''
            ? { languageId: layer.languageId }
            : {}),
          ...(layer.orthographyId !== undefined && layer.orthographyId !== ''
            ? { orthographyId: layer.orthographyId }
            : {}),
          text: translationText,
        });
      }
    }
  }
  return items;
}
