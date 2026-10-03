import { loadAnnotationWorkspace } from '../annotationWorkspaceController.data';
import { buildAnnotationIgtRows } from './annotationIgtRows';
import {
  annotationTextByLayer,
  pickAnnotationLayerText,
  pickAnnotationTranslationText,
  resolveAnnotationTranslationLayerId,
} from './annotationTranslationText';

type AnnotationWorkspaceData = Awaited<ReturnType<typeof loadAnnotationWorkspace>>;

export function deriveAnnotationWorkspace(input: {
  data: AnnotationWorkspaceData | undefined;
  textId: string;
  mediaId: string;
  urlUnitId: string;
  urlLayerId: string;
  chosenTranslationLayerId: string | null;
  focusedUnitId: string;
}) {
  const contents = input.data?.contents ?? [];
  const translationLayers = input.data?.translationLayers ?? [];
  const transcriptionLayers = input.data?.transcriptionLayers ?? [];
  const literalLayerId = input.data?.literalLayerId ?? '';
  const choice = resolveAnnotationTranslationLayerId({
    layers: translationLayers,
    storedId: input.chosenTranslationLayerId ?? input.data?.translationLayerId ?? '',
    urlLayerId: input.chosenTranslationLayerId === null ? input.urlLayerId : '',
    literalLayerId,
  });
  const activeTranslationLayerId = choice.id;
  const translations = pickAnnotationTranslationText({
    contents,
    translationLayerIds: activeTranslationLayerId.length > 0 ? [activeTranslationLayerId] : [],
  });
  const surfaces = pickAnnotationLayerText({
    contents,
    layerIds: input.data?.transcriptionLayerIds ?? [],
  });
  const rows = buildAnnotationIgtRows({
    units: input.data?.units ?? [],
    tokens: input.data?.tokens ?? [],
    textId: input.textId,
    mediaId: input.mediaId,
    translations,
    surfaces,
    languageId: input.data?.languageId ?? '',
    ...(input.data?.speakerNames ? { speakerNames: input.data.speakerNames } : {}),
  });
  const unitIds = rows.map((row) => row.id);
  const focusedUnitId =
    input.focusedUnitId.length > 0 && unitIds.includes(input.focusedUnitId)
      ? input.focusedUnitId
      : input.urlUnitId.length > 0 && unitIds.includes(input.urlUnitId)
        ? input.urlUnitId
        : (unitIds[0] ?? '');
  return {
    rows,
    unitIds,
    focusedUnitId,
    unitCount: rows.length,
    languageId: input.data?.languageId ?? '',
    translationLayers: translationLayers.filter((layer) => layer.id !== literalLayerId),
    transcriptionLayers,
    projectLanguages: input.data?.projectLanguages ?? {
      objectLanguageIds: [],
      workingLanguageIds: [],
    },
    glossAbbreviations: input.data?.glossAbbreviations ?? null,
    posCategories: input.data?.posCategories ?? null,
    textByLayer: Object.fromEntries(
      [
        ...annotationTextByLayer({
          contents,
          layerIds: [
            ...transcriptionLayers.map((layer) => layer.id),
            ...translationLayers.map((layer) => layer.id),
          ],
        }),
      ].map(([layerId, byUnit]) => [layerId, Object.fromEntries(byUnit)]),
    ),
    activeTranslationLayerId,
    persistTranslationLayer: choice.persist,
  };
}
