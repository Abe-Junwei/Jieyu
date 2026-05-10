import { useCallback } from 'react';
import { getLayerCreateGuard } from '../../services/LayerConstraintService';
import type { LayerActionPopoverProps } from './LayerActionPopoverTypes';
import type { LayerActionPopoverFormState } from './useLayerActionPopoverFormState';
import { resolveCreateFailureText, getCreateFallbackMessage } from '../layerActionPopoverHelpers';

export function useLayerActionPopoverHandleCreate(
  props: LayerActionPopoverProps,
  form: LayerActionPopoverFormState,
) {
  const { action, deletableLayers, layerCreateMessage, createLayer, onClose } = props;

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
    setCreateFailureMessage,
    setIsLoading,
  } = form;

  const handleCreate = useCallback(async () => {
    const resolvedLang = resolvedLanguageId;
    if (!resolvedLang) return;
    if (customLanguageError) {
      setCreateFailureMessage(customLanguageError);
      return;
    }
    if (orthographySelectionError) {
      setCreateFailureMessage(orthographySelectionError);
      return;
    }
    const existingTranscriptionCount = deletableLayers.filter(
      (layer) => layer.layerType === 'transcription',
    ).length;
    const canConfigureTranscriptionConstraint =
      action === 'create-transcription' && existingTranscriptionCount > 0;
    const resolvedConstraint =
      action === 'create-translation'
        ? 'symbolic_association'
        : canConfigureTranscriptionConstraint
          ? constraint
          : undefined;
    const createLayerType = action === 'create-transcription' ? 'transcription' : 'translation';
    const hasSupportedParent = independentParentLayers.length > 0;
    const preferredTranslationHostForPayload =
      preferredTranslationHostId && translationHostIds.includes(preferredTranslationHostId)
        ? preferredTranslationHostId
        : translationHostIds[0];
    const immediateGuard = getLayerCreateGuard(deletableLayers, createLayerType, {
      languageId: resolvedLang,
      alias,
      modality,
      ...(resolvedConstraint ? { constraint: resolvedConstraint } : {}),
      ...(createLayerType === 'transcription' && resolvedTranscriptionParentLayerId
        ? { parentLayerId: resolvedTranscriptionParentLayerId }
        : {}),
      ...(createLayerType === 'translation' && translationHostIds.length > 0
        ? {
            hostTranscriptionLayerIds: translationHostIds,
            ...(preferredTranslationHostForPayload
              ? { preferredHostTranscriptionLayerId: preferredTranslationHostForPayload }
              : {}),
          }
        : {}),
      hasSupportedParent,
    });
    setCreateFailureMessage('');
    setIsLoading(true);
    try {
      const translationHostConfig =
        createLayerType === 'translation' && translationHostIds.length > 0
          ? {
              hostTranscriptionLayerIds: translationHostIds,
              ...(preferredTranslationHostForPayload
                ? { preferredHostTranscriptionLayerId: preferredTranslationHostForPayload }
                : {}),
            }
          : {};
      const success = await createLayer(
        createLayerType,
        {
          languageId: resolvedLang,
          ...(orthographyId ? { orthographyId } : {}),
          ...(dialect.trim() ? { dialect: dialect.trim() } : {}),
          ...(vernacular.trim() ? { vernacular: vernacular.trim() } : {}),
          ...(alias.trim() ? { alias: alias.trim() } : {}),
          ...(resolvedConstraint ? { constraint: resolvedConstraint } : {}),
          ...translationHostConfig,
          ...(createLayerType === 'transcription' && resolvedTranscriptionParentLayerId
            ? { parentLayerId: resolvedTranscriptionParentLayerId }
            : {}),
        },
        action === 'create-translation' || action === 'create-transcription' ? modality : undefined,
      );
      if (success) {
        onClose();
        return;
      }
      setCreateFailureMessage(
        resolveCreateFailureText(
          immediateGuard.reason ?? layerCreateMessage,
          getCreateFallbackMessage(action, actionMessages),
          actionMessages.createFailedPrefix,
          actionMessages.createdPrefix,
        ),
      );
    } catch (error) {
      setCreateFailureMessage(
        resolveCreateFailureText(
          error instanceof Error ? error.message : '',
          getCreateFallbackMessage(action, actionMessages),
          actionMessages.createFailedPrefix,
          actionMessages.createdPrefix,
        ),
      );
    } finally {
      setIsLoading(false);
    }
  }, [
    resolvedLanguageId,
    customLanguageError,
    orthographySelectionError,
    orthographyId,
    dialect,
    vernacular,
    alias,
    modality,
    constraint,
    action,
    createLayer,
    deletableLayers,
    independentParentLayers.length,
    layerCreateMessage,
    onClose,
    preferredTranslationHostId,
    resolvedTranscriptionParentLayerId,
    translationHostIds,
    actionMessages,
    setCreateFailureMessage,
    setIsLoading,
  ]);

  return { handleCreate };
}
