import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { getLayerMetadataAppService } from '../app/LayerMetadataAppService';
import type {
  LayerDocType,
  LayerLinkDocType,
  TierDefinitionDocType,
} from '../types/jieyuDbDocTypes';
import { stripForbiddenTranslationParentLayerId } from '../app/jieyuDbPageAccess';
import type { LayerMetadataUpdateInput } from '../types/layerMetadata';
import { getLayerLabelParts, newId } from '../utils/transcriptionFormatters';
import { nextLayerNameForAlias } from '../utils/layerAliasName';

type UseTranscriptionLayerMetadataControllerInput = {
  layers: LayerDocType[];
  layerLinks: LayerLinkDocType[];
  setLayerCreateMessage: Dispatch<SetStateAction<string>>;
  setLayers: Dispatch<SetStateAction<LayerDocType[]>>;
  setLayerLinks: Dispatch<SetStateAction<LayerLinkDocType[]>>;
};

function trimOptionalText(value: string | undefined): string {
  return (value ?? '').trim();
}

export function useTranscriptionLayerMetadataController(
  input: UseTranscriptionLayerMetadataControllerInput,
) {
  const layerMetadataAppService = getLayerMetadataAppService();

  const updateLayerMetadata = useCallback(
    async (layerId: string, updates: LayerMetadataUpdateInput): Promise<boolean> => {
      const targetLayer = input.layers.find((layer) => layer.id === layerId);
      if (!targetLayer) return false;

      const transcriptionLayerById = new Map(
        input.layers
          .filter((layer) => layer.layerType === 'transcription')
          .map((layer) => [layer.id, layer] as const),
      );

      const shouldUpdateTranslationLinks =
        targetLayer.layerType === 'translation' && updates.hostTranscriptionLayerIds !== undefined;
      const normalizedHostTranscriptionLayerIds = shouldUpdateTranslationLinks
        ? (() => {
            const next: string[] = [];
            const seen = new Set<string>();
            for (const rawId of updates.hostTranscriptionLayerIds ?? []) {
              const id = rawId.trim();
              if (!id || seen.has(id) || !transcriptionLayerById.has(id)) continue;
              seen.add(id);
              next.push(id);
            }
            return next;
          })()
        : [];

      if (shouldUpdateTranslationLinks && normalizedHostTranscriptionLayerIds.length === 0) {
        input.setLayerCreateMessage('更新层元信息失败：翻译层至少需要一个宿主转写层。');
        return false;
      }

      const nextDialect = trimOptionalText(updates.dialect);
      const nextVernacular = trimOptionalText(updates.vernacular);
      const nextAlias = trimOptionalText(updates.alias);
      const nextLanguageId = trimOptionalText(updates.languageId);
      const nextOrthographyId = trimOptionalText(updates.orthographyId);
      const nextBridgeId = trimOptionalText(updates.bridgeId);
      const nextParticipantId = trimOptionalText(updates.participantId);
      const nextDataCategory = trimOptionalText(updates.dataCategory);
      const nextDelimiter = updates.delimiter ?? '';
      const nextParentLayerId = trimOptionalText(updates.parentLayerId);
      // 只有别名真的改了才动名称，且不写入界面语言的固定文字（JY-18）
      // Only touch the name when the alias really changed, without fixed UI-language text (JY-18)
      const nextName =
        updates.alias === undefined
          ? null
          : nextLayerNameForAlias(
              targetLayer.name,
              getLayerLabelParts(targetLayer).alias,
              nextAlias,
            );
      let updatedLayer: LayerDocType = {
        ...targetLayer,
        ...(nextName !== null ? { name: nextName } : {}),
        updatedAt: new Date().toISOString(),
      } as LayerDocType;

      if (nextLanguageId) {
        updatedLayer.languageId = nextLanguageId;
      }

      if (updates.modality !== undefined) {
        updatedLayer.modality = updates.modality;
        updatedLayer.acceptsAudio = updates.modality !== 'text';
      }

      if (updates.constraint !== undefined) {
        updatedLayer.constraint = updates.constraint;
      }

      if (updates.accessRights !== undefined) {
        updatedLayer.accessRights = updates.accessRights;
      }

      if (updates.isDefault !== undefined) {
        updatedLayer.isDefault = updates.isDefault;
      }

      if (updates.sortOrder !== undefined) {
        updatedLayer.sortOrder = updates.sortOrder;
      }

      if (updates.orthographyId !== undefined) {
        if (nextOrthographyId) {
          updatedLayer.orthographyId = nextOrthographyId;
        } else {
          delete updatedLayer.orthographyId;
        }
      }

      if (updates.bridgeId !== undefined) {
        if (nextBridgeId) {
          updatedLayer.bridgeId = nextBridgeId;
        } else {
          delete updatedLayer.bridgeId;
        }
      }

      if (nextDialect) {
        updatedLayer.dialect = nextDialect;
      } else {
        delete updatedLayer.dialect;
      }
      if (nextVernacular) {
        updatedLayer.vernacular = nextVernacular;
      } else {
        delete updatedLayer.vernacular;
      }

      if (updatedLayer.layerType === 'transcription' && updates.parentLayerId !== undefined) {
        if (nextParentLayerId && updatedLayer.constraint !== 'independent_boundary') {
          updatedLayer.parentLayerId = nextParentLayerId;
        } else {
          delete updatedLayer.parentLayerId;
        }
      }

      if (updatedLayer.layerType === 'translation') {
        updatedLayer = stripForbiddenTranslationParentLayerId(updatedLayer);
      }

      const resolvedPreferredHostTranscriptionLayerId =
        updates.preferredHostTranscriptionLayerId &&
        normalizedHostTranscriptionLayerIds.includes(updates.preferredHostTranscriptionLayerId)
          ? updates.preferredHostTranscriptionLayerId
          : (normalizedHostTranscriptionLayerIds[0] ?? '');
      const replacementLinks: LayerLinkDocType[] | null =
        shouldUpdateTranslationLinks && updatedLayer.layerType === 'translation'
          ? (() => {
              const existingLayerLinks = input.layerLinks.filter(
                (link) => link.layerId === layerId,
              );
              const existingPreferredLink =
                existingLayerLinks.find((link) => link.isPreferred) ?? existingLayerLinks[0];
              const resolvedLinkType =
                updates.linkType ?? existingPreferredLink?.linkType ?? 'free';
              const now = new Date().toISOString();
              return normalizedHostTranscriptionLayerIds
                .map((hostTranscriptionLayerId) =>
                  transcriptionLayerById.get(hostTranscriptionLayerId),
                )
                .filter((hostLayer): hostLayer is LayerDocType & { layerType: 'transcription' } =>
                  Boolean(hostLayer && hostLayer.layerType === 'transcription'),
                )
                .map((hostLayer) => ({
                  id: newId('link'),
                  transcriptionLayerKey: hostLayer.key,
                  hostTranscriptionLayerId: hostLayer.id,
                  layerId,
                  linkType: resolvedLinkType,
                  isPreferred: hostLayer.id === resolvedPreferredHostTranscriptionLayerId,
                  createdAt: now,
                }));
            })()
          : null;

      const currentTranslationLinks =
        replacementLinks !== null
          ? replacementLinks.map((link) => ({
              hostId: link.hostTranscriptionLayerId,
              isPreferred: link.isPreferred,
            }))
          : input.layerLinks
              .filter((link) => link.layerId === updatedLayer.id)
              .map((link) => ({
                hostId: link.hostTranscriptionLayerId,
                isPreferred: link.isPreferred,
              }));
      const preferredTierParentId =
        updatedLayer.layerType === 'translation'
          ? replacementLinks !== null
            ? resolvedPreferredHostTranscriptionLayerId
            : (currentTranslationLinks.find((link) => link.isPreferred)?.hostId ??
              currentTranslationLinks[0]?.hostId ??
              '')
          : nextParentLayerId;
      const extraParentTierIds =
        updatedLayer.layerType === 'translation'
          ? currentTranslationLinks
              .map((link) => link.hostId)
              .filter((hostId) => hostId && hostId !== preferredTierParentId)
          : [];

      const patchTier = (tier: TierDefinitionDocType): TierDefinitionDocType => {
        const nextTier = {
          ...tier,
          ...(preferredTierParentId ? { parentTierId: preferredTierParentId } : {}),
          ...(extraParentTierIds.length > 0 ? { extraParentTierIds } : {}),
          ...(updates.sortOrder !== undefined ? { sortOrder: updates.sortOrder } : {}),
          updatedAt: new Date().toISOString(),
        };
        if (!preferredTierParentId) delete nextTier.parentTierId;
        if (extraParentTierIds.length === 0) delete nextTier.extraParentTierIds;
        if (updates.participantId !== undefined) {
          if (nextParticipantId) nextTier.participantId = nextParticipantId;
          else delete nextTier.participantId;
        }
        if (updates.dataCategory !== undefined) {
          if (nextDataCategory) nextTier.dataCategory = nextDataCategory;
          else delete nextTier.dataCategory;
        }
        if (updates.delimiter !== undefined) {
          if (nextDelimiter) nextTier.delimiter = nextDelimiter;
          else delete nextTier.delimiter;
        }
        return nextTier;
      };

      try {
        // 层、链接、层定义一个事务（JY-18）| Layer, links and tier in one transaction (JY-18)
        await layerMetadataAppService.applyMetadataUpdate({
          layer: updatedLayer,
          replaceLinks: replacementLinks,
          patchTier,
        });

        if (replacementLinks !== null) {
          input.setLayerLinks((prev) => [
            ...prev.filter((link) => link.layerId !== layerId),
            ...replacementLinks,
          ]);
        }

        input.setLayers((prev) =>
          prev.map((layer) => (layer.id === updatedLayer.id ? updatedLayer : layer)),
        );
        input.setLayerCreateMessage('');
        return true;
      } catch (error) {
        input.setLayerCreateMessage(error instanceof Error ? error.message : '更新层元信息失败');
        return false;
      }
    },
    [input, layerMetadataAppService],
  );

  return {
    updateLayerMetadata,
  };
}
