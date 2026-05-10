import { useCallback } from 'react';
import type { LayerMetadataUpdateInput } from '../../types/layerMetadata';
import type { LayerActionPopoverProps } from './LayerActionPopoverTypes';
import type { LayerActionPopoverFormState } from './useLayerActionPopoverFormState';

export function useLayerActionPopoverHandleSaveMetadata(
  props: LayerActionPopoverProps,
  form: LayerActionPopoverFormState,
) {
  const { layerId, updateLayerMetadata, onClose } = props;

  const {
    actionMessages,
    resolvedLanguageId,
    customLanguageError,
    orthographySelectionError,
    orthographyId,
    dialect,
    vernacular,
    alias,
    modality,
    constraint,
    independentParentLayers,
    translationHostIds,
    preferredTranslationHostId,
    resolvedTranscriptionParentLayerId,
    isEditingTranslationLayer,
    isEditingTranscriptionLayer,
    isEditMetadataAction,
    translationLinkType,
    sortOrderInput,
    bridgeId,
    participantId,
    dataCategory,
    delimiter,
    accessRights,
    isDefaultLayer,
    setCreateFailureMessage,
    setIsLoading,
  } = form;

  const handleSaveMetadata = useCallback(async () => {
    if (!isEditMetadataAction || !layerId || !updateLayerMetadata) return;
    if (!resolvedLanguageId) {
      setCreateFailureMessage(actionMessages.metadataLanguageRequired);
      return;
    }
    if (customLanguageError) {
      setCreateFailureMessage(customLanguageError);
      return;
    }
    if (orthographySelectionError) {
      setCreateFailureMessage(orthographySelectionError);
      return;
    }
    if (isEditingTranslationLayer && translationHostIds.length === 0) {
      setCreateFailureMessage(actionMessages.translationHostLayersRequired);
      return;
    }
    if (
      isEditingTranscriptionLayer &&
      constraint === 'symbolic_association' &&
      independentParentLayers.length > 1 &&
      !resolvedTranscriptionParentLayerId
    ) {
      setCreateFailureMessage(actionMessages.transcriptionParentRequired);
      return;
    }

    const parsedSortOrder = sortOrderInput.trim();
    const normalizedSortOrder = parsedSortOrder.length > 0 ? Number(parsedSortOrder) : null;
    if (
      normalizedSortOrder !== null &&
      (!Number.isInteger(normalizedSortOrder) || normalizedSortOrder < 0)
    ) {
      setCreateFailureMessage(actionMessages.sortOrderInvalid);
      return;
    }

    setCreateFailureMessage('');
    setIsLoading(true);
    try {
      const metadataInput: LayerMetadataUpdateInput = {
        languageId: resolvedLanguageId,
        orthographyId: orthographyId.trim(),
        dialect: dialect.trim(),
        vernacular: vernacular.trim(),
        alias: alias.trim(),
        modality,
        bridgeId: bridgeId.trim(),
        participantId: participantId.trim(),
        dataCategory: dataCategory.trim(),
        delimiter: delimiter,
        ...(normalizedSortOrder !== null ? { sortOrder: normalizedSortOrder } : {}),
        accessRights,
        isDefault: isDefaultLayer,
        ...(isEditingTranscriptionLayer
          ? {
              constraint,
              parentLayerId:
                constraint === 'symbolic_association' ? resolvedTranscriptionParentLayerId : '',
            }
          : {}),
        ...(isEditingTranslationLayer
          ? {
              hostTranscriptionLayerIds: translationHostIds,
              preferredHostTranscriptionLayerId: preferredTranslationHostId,
              linkType: translationLinkType,
            }
          : {}),
      };
      const success = await updateLayerMetadata(layerId, {
        ...metadataInput,
      });
      if (success) {
        onClose();
        return;
      }
      setCreateFailureMessage(actionMessages.genericActionFailed);
    } catch (error) {
      setCreateFailureMessage(
        error instanceof Error ? error.message : actionMessages.genericActionFailed,
      );
    } finally {
      setIsLoading(false);
    }
  }, [
    accessRights,
    actionMessages.genericActionFailed,
    actionMessages.metadataLanguageRequired,
    actionMessages.translationHostLayersRequired,
    actionMessages.transcriptionParentRequired,
    alias,
    bridgeId,
    constraint,
    customLanguageError,
    dataCategory,
    delimiter,
    dialect,
    independentParentLayers.length,
    isDefaultLayer,
    isEditMetadataAction,
    isEditingTranscriptionLayer,
    isEditingTranslationLayer,
    layerId,
    modality,
    onClose,
    orthographyId,
    orthographySelectionError,
    preferredTranslationHostId,
    participantId,
    resolvedLanguageId,
    resolvedTranscriptionParentLayerId,
    sortOrderInput,
    actionMessages.sortOrderInvalid,
    translationHostIds,
    translationLinkType,
    updateLayerMetadata,
    vernacular,
    setCreateFailureMessage,
    setIsLoading,
  ]);

  return { handleSaveMetadata };
}
