import type { LayerDocType, LayerLinkDocType } from '../../db';
import { layerTranscriptionTreeParentId } from '../../db';
import { listIndependentBoundaryTranscriptionLayers } from '../../services/LayerConstraintService';
import {
  buildTranscriptionIdByKeyMap,
  getPreferredHostTranscriptionLayerIdForTranslation,
  getHostTranscriptionLayerIdsForTranslation,
} from '../../utils/translationHostLinkQuery';
import type { LayerActionType } from '../layerActionPopoverHelpers';

export function computeIndependentParentLayers(deletableLayers: LayerDocType[]): LayerDocType[] {
  return listIndependentBoundaryTranscriptionLayers(deletableLayers);
}

export function computeContextualParentLayerId(input: {
  layerId: string | undefined;
  deletableLayers: LayerDocType[];
  layerLinks: ReadonlyArray<
    Pick<
      LayerLinkDocType,
      'layerId' | 'transcriptionLayerKey' | 'hostTranscriptionLayerId' | 'isPreferred' | 'linkType'
    >
  >;
  independentParentLayers: LayerDocType[];
}): string {
  const { layerId, deletableLayers, layerLinks, independentParentLayers } = input;
  if (!layerId) return '';
  const clickedLayer = deletableLayers.find((layer) => layer.id === layerId);
  if (!clickedLayer) return '';
  if (independentParentLayers.some((layer) => layer.id === clickedLayer.id)) {
    return clickedLayer.id;
  }
  if (clickedLayer.layerType === 'translation') {
    if (layerLinks.length === 0) return '';
    const transcriptionLayers = deletableLayers.filter((l) => l.layerType === 'transcription');
    const tidByKey = buildTranscriptionIdByKeyMap(transcriptionLayers);
    const preferredHostId = getPreferredHostTranscriptionLayerIdForTranslation(
      clickedLayer.id,
      layerLinks,
      tidByKey,
    );
    if (preferredHostId && independentParentLayers.some((layer) => layer.id === preferredHostId)) {
      return preferredHostId;
    }
    return '';
  }
  const parentLayerId = layerTranscriptionTreeParentId(clickedLayer)?.trim() ?? '';
  if (parentLayerId && independentParentLayers.some((layer) => layer.id === parentLayerId)) {
    return parentLayerId;
  }
  return '';
}

export function buildFormInitializationKey(input: {
  action: LayerActionType;
  layerId: string | undefined;
  contextualParentLayerId: string;
  defaultLanguageId?: string;
  normalizedDefaultOrthographyId: string;
}): string {
  const {
    action,
    layerId,
    contextualParentLayerId,
    defaultLanguageId,
    normalizedDefaultOrthographyId,
  } = input;
  return `${action}::${layerId ?? ''}::${contextualParentLayerId}::${defaultLanguageId?.trim().toLowerCase() ?? ''}::${normalizedDefaultOrthographyId}`;
}

/** Initial translation host ids when opening create-translation (non-edit-metadata path). */
export function computeCreateTranslationHostSeed(
  independentParentLayers: LayerDocType[],
  contextualParentLayerId: string,
): { translationHostIds: string[]; preferredTranslationHostId: string } {
  if (independentParentLayers.length === 1) {
    const onlyId = independentParentLayers[0]!.id;
    return { translationHostIds: [onlyId], preferredTranslationHostId: onlyId };
  }
  const seed =
    contextualParentLayerId &&
    independentParentLayers.some((layer) => layer.id === contextualParentLayerId)
      ? [contextualParentLayerId]
      : [];
  return { translationHostIds: seed, preferredTranslationHostId: seed[0] ?? '' };
}

export function deriveEditingTranslationLinkState(input: {
  editingLayer: LayerDocType | undefined;
  deletableLayers: LayerDocType[];
  layerLinks: ReadonlyArray<
    Pick<
      LayerLinkDocType,
      'layerId' | 'transcriptionLayerKey' | 'hostTranscriptionLayerId' | 'isPreferred' | 'linkType'
    >
  >;
}): {
  editingTranslationHostIds: string[];
  editingPreferredHostId: string;
  editingPreferredLinkType: LayerLinkDocType['linkType'];
} {
  const { editingLayer, deletableLayers, layerLinks } = input;
  const transcriptionIdByKey = buildTranscriptionIdByKeyMap(
    deletableLayers.filter((layer) => layer.layerType === 'transcription'),
  );
  const editingTranslationHostIds =
    editingLayer?.layerType === 'translation'
      ? getHostTranscriptionLayerIdsForTranslation(
          editingLayer.id,
          layerLinks,
          transcriptionIdByKey,
        )
      : [];
  const editingPreferredHostId =
    editingLayer?.layerType === 'translation'
      ? (getPreferredHostTranscriptionLayerIdForTranslation(
          editingLayer.id,
          layerLinks,
          transcriptionIdByKey,
        ) ??
        editingTranslationHostIds[0] ??
        '')
      : '';
  const editingPreferredLinkType =
    editingLayer?.layerType === 'translation'
      ? (layerLinks.find((link) => link.layerId === editingLayer.id && link.isPreferred)
          ?.linkType ??
        layerLinks.find((link) => link.layerId === editingLayer.id)?.linkType ??
        'free')
      : 'free';
  return { editingTranslationHostIds, editingPreferredHostId, editingPreferredLinkType };
}
