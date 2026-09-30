import { LinguisticService } from '../app/languageAssetPageAccess';
import {
  annotationTranscriptionLanguageId,
  projectAnnotationLaneUnits,
} from './annotation/annotationLaneUnitProjection';
import { annotationLayerLabel } from './annotation/annotationTranslationText';
import {
  buildLeipzigAbbreviationSeed,
  buildUdPosCategorySeed,
  readAnnotationAbbreviations,
  readAnnotationPosCategories,
} from '../app/languageAssetPageAccess';
import {
  EMPTY_PROJECT_LANGUAGE_LISTS,
  readProjectLanguageLists,
  type ProjectLanguageLists,
} from '../utils/projectLanguageLists';
import { readAnnotationDocumentLayout } from './annotation/annotationDocumentLayoutStore';

export async function loadAnnotationWorkspace(textId: string, mediaId: string) {
  const [units, layers, speakers] = await Promise.all([
    LinguisticService.units.listByTextId(textId),
    LinguisticService.layers.listByTextId(textId),
    LinguisticService.speakers.listForProject(textId),
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
  let projectLanguages: ProjectLanguageLists = EMPTY_PROJECT_LANGUAGE_LISTS;
  let glossAbbreviations: string[] | null = null;
  let posCategories: string[] | null = null;
  let literalLayerId = '';
  let translationLayerId = '';
  const readText = LinguisticService.timeline?.getTextById;
  if (readText) {
    const text = await readText(textId);
    const documentLayout = readAnnotationDocumentLayout(text?.metadata);
    literalLayerId = documentLayout.literalLayerId;
    translationLayerId = documentLayout.translationLayerId;
    projectLanguages = readProjectLanguageLists(text?.metadata);
    glossAbbreviations = (
      readAnnotationAbbreviations(text?.metadata) ?? buildLeipzigAbbreviationSeed()
    ).map((row) => row.abbreviation);
    posCategories = (readAnnotationPosCategories(text?.metadata) ?? buildUdPosCategorySeed()).map(
      (row) => row.abbreviation,
    );
  }
  return {
    units: laneUnits,
    tokens,
    contents,
    translationLayers,
    transcriptionLayers,
    projectLanguages,
    glossAbbreviations,
    posCategories,
    speakerNames,
    transcriptionLayerIds,
    literalLayerId,
    translationLayerId,
    languageId: annotationTranscriptionLanguageId(layers),
  };
}
