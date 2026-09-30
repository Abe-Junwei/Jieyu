import { LinguisticService } from '../app/languageAssetPageAccess';
import {
  annotationTranscriptionLanguageId,
  projectAnnotationLaneUnits,
} from './annotation/annotationLaneUnitProjection';
import { annotationLayerLabel } from './annotation/annotationTranslationText';

export async function loadAnnotationWorkspace(textId: string, mediaId: string) {
  const [units, layers, speakers] = await Promise.all([
    LinguisticService.units.listByTextId(textId),
    LinguisticService.layers.listByTextId(textId),
    LinguisticService.speakers.list(),
  ]);
  const laneUnits = projectAnnotationLaneUnits({ units, layers, mediaId });
  const unitIds = laneUnits.map((unit) => unit.id);
  const [tokens, contents] = await Promise.all([
    LinguisticService.units.listTokensByUnitIds(unitIds),
    LinguisticService.timeline.listUnitTextsByUnitIds(unitIds),
  ]);
  const translationLayers = layers
    .filter((layer) => layer.layerType === 'translation')
    .map((layer) => ({
      id: layer.id,
      label: annotationLayerLabel(layer),
      languageId: layer.languageId?.trim() ?? '',
    }));
  const transcriptionLayers = layers
    .filter((layer) => layer.layerType === 'transcription')
    .map((layer) => ({
      id: layer.id,
      label: annotationLayerLabel(layer),
      languageId: layer.languageId?.trim() ?? '',
    }));
  const speakerNames = new Map(
    speakers
      .map((speaker) => [speaker.id, speaker.name.trim()] as const)
      .filter((entry) => entry[1].length > 0),
  );
  const transcriptionLayerIds = layers
    .filter((layer) => layer.layerType === 'transcription')
    .map((layer) => layer.id);
  return {
    units: laneUnits,
    tokens,
    contents,
    translationLayers,
    transcriptionLayers,
    speakerNames,
    transcriptionLayerIds,
    languageId: annotationTranscriptionLanguageId(layers),
  };
}
