import { getDb } from '../../app/jieyuDbPageAccess';
import { LinguisticService } from '../../app/languageAssetPageAccess';
import {
  canCreateLayer,
  createLayerLink,
  getLayerCreateGuard,
  LayerTierUnifiedService,
  listIndependentBoundaryTranscriptionLayers,
} from '../../app/transcriptionServicesPageAccess';
import type { LayerDocType } from '../../types/jieyuDbDocTypes';
import { isKnownIso639_3Code } from '../../utils/langMapping';
import { newId } from '../../utils/transcriptionFormatters';
import { transcriptionHostInput, withTranscriptionHost } from './transcriptionLayerHost';

const LITERAL_ALIAS = 'literal';

function normalizeLanguageId(languageId: string): string {
  return languageId.trim().toLowerCase();
}

function pickLiteralLanguageId(
  layers: readonly LayerDocType[],
  workingLanguageIds: readonly string[],
): string {
  const transcriptionLanguages = new Set(
    layers
      .filter((layer) => layer.layerType === 'transcription')
      .map((layer) => normalizeLanguageId(layer.languageId))
      .filter((languageId) => languageId.length > 0),
  );
  const candidates = [
    ...workingLanguageIds,
    ...layers.filter((layer) => layer.layerType === 'translation').map((layer) => layer.languageId),
    'eng',
    'zho',
  ];
  for (const candidate of candidates) {
    const languageId = normalizeLanguageId(candidate);
    if (!isKnownIso639_3Code(languageId)) continue;
    if (transcriptionLanguages.has(languageId)) continue;
    return languageId;
  }
  return '';
}

export async function ensureAnnotationLiteralLayer(input: {
  textId: string;
  workingLanguageIds: readonly string[];
  literalLayerId: string;
}): Promise<string | null> {
  const textId = input.textId.trim();
  if (textId.length === 0) return null;
  const layers = await LinguisticService.layers.listByTextId(textId);
  const bound = input.literalLayerId.trim();
  if (
    bound.length > 0 &&
    layers.some((layer) => layer.id === bound && layer.layerType === 'translation')
  ) {
    return bound;
  }
  const languageId = pickLiteralLanguageId(layers, input.workingLanguageIds);
  if (languageId.length === 0) return null;
  return createAnnotationTextLayer({
    textId,
    layerType: 'translation',
    languageId,
    name: 'Literal',
    alias: LITERAL_ALIAS,
  });
}

export async function createAnnotationTextLayer(input: {
  textId: string;
  layerType: 'transcription' | 'translation';
  languageId: string;
  name?: string;
  alias?: string;
}): Promise<string | null> {
  const textId = input.textId.trim();
  const languageId = normalizeLanguageId(input.languageId);
  if (textId.length === 0 || !isKnownIso639_3Code(languageId)) return null;
  const layers = await LinguisticService.layers.listByTextId(textId);
  const hosts = listIndependentBoundaryTranscriptionLayers(layers);
  const host = hosts[0];
  const rootTranscription =
    input.layerType === 'transcription' &&
    !layers.some((layer) => layer.layerType === 'transcription');
  if (!rootTranscription && host === undefined) return null;
  const needsAlias = layers.some(
    (layer) =>
      layer.layerType === input.layerType &&
      normalizeLanguageId(layer.languageId) === languageId &&
      (layer.modality ?? 'text') === 'text',
  );
  const sameTypeCount = layers.filter((layer) => layer.layerType === input.layerType).length;
  const requestedAlias = input.alias?.trim() ?? '';
  const alias = needsAlias
    ? requestedAlias.length > 0
      ? requestedAlias
      : `${languageId}-${sameTypeCount + 1}`
    : '';
  const guard = getLayerCreateGuard(layers, input.layerType, {
    languageId,
    alias,
    modality: 'text',
    constraint: rootTranscription ? 'independent_boundary' : 'symbolic_association',
    ...(input.layerType === 'transcription' && host !== undefined && !rootTranscription
      ? transcriptionHostInput(host.id)
      : {}),
    ...(input.layerType === 'translation' && host !== undefined
      ? {
          hostTranscriptionLayerIds: [host.id],
          preferredHostTranscriptionLayerId: host.id,
        }
      : {}),
    hasSupportedParent: host !== undefined,
  });
  const createCheck = canCreateLayer(layers, input.layerType);
  if (!guard.allowed || !createCheck.allowed) return null;

  const now = new Date().toISOString();
  const id = newId('layer');
  const prefix = input.layerType === 'transcription' ? 'trc' : 'trl';
  const requestedName = input.name?.trim() ?? '';
  const layerName = requestedName.length > 0 ? requestedName : languageId;
  const drafted: LayerDocType =
    input.layerType === 'transcription'
      ? {
          id,
          textId,
          key: `${prefix}_${languageId}_${id.slice(-5)}`,
          name: { eng: layerName },
          layerType: 'transcription',
          languageId,
          modality: 'text',
          acceptsAudio: false,
          constraint: rootTranscription ? 'independent_boundary' : 'symbolic_association',
          sortOrder: sameTypeCount,
          createdAt: now,
          updatedAt: now,
        }
      : {
          id,
          textId,
          key: `${prefix}_${languageId}_${id.slice(-5)}`,
          name: { eng: layerName },
          layerType: 'translation',
          languageId,
          modality: 'text',
          acceptsAudio: false,
          constraint: 'symbolic_association',
          sortOrder: sameTypeCount,
          createdAt: now,
          updatedAt: now,
        };
  const layer =
    input.layerType === 'transcription' && host !== undefined && !rootTranscription
      ? withTranscriptionHost(drafted, host.id)
      : drafted;
  await LayerTierUnifiedService.createLayer(layer);
  if (input.layerType === 'translation' && host !== undefined) {
    const database = await getDb();
    await database.collections.layer_links.insert({
      ...createLayerLink({
        id: newId('link'),
        transcriptionLayerKey: host.key,
        hostTranscriptionLayerId: host.id,
        linkedTranslationLayerId: id,
        createdAt: now,
      }),
      isPreferred: true,
    });
  }
  return id;
}
