import { useCallback } from 'react';
import { layerTranscriptionTreeParentId } from '../../db';
import { getLayerLabelParts } from '../../utils/transcriptionFormatters';
import type { LayerActionPopoverProps } from './LayerActionPopoverTypes';
import type { LayerActionPopoverFormState } from './useLayerActionPopoverFormState';
import {
  computeCreateTranslationHostSeed,
  deriveEditingTranslationLinkState,
} from './layerActionPopoverFormDerivations';

export function useLayerActionPopoverHandleResetForm(
  props: LayerActionPopoverProps,
  form: LayerActionPopoverFormState,
) {
  const { action, deletableLayers, layerLinks = [] } = props;

  const {
    locale,
    isEditMetadataAction,
    editingLayer,
    editingTierSnapshot,
    editingLanguageSeed,
    defaultLanguageSeed,
    normalizedDefaultOrthographyId,
    contextualParentLayerId,
    independentParentLayers,
    pendingDefaultOrthographyIdRef,
    setLanguageInput,
    setOrthographyId,
    setDialect,
    setVernacular,
    setAlias,
    setModality,
    setConstraint,
    setBridgeId,
    setParticipantId,
    setDataCategory,
    setDelimiter,
    setSortOrderInput,
    setAccessRights,
    setIsDefaultLayer,
    setSelectedParentLayerId,
    setTranslationHostIds,
    setPreferredTranslationHostId,
    setTranslationLinkType,
    setCreateFailureMessage,
  } = form;

  const handleResetForm = useCallback(() => {
    if (isEditMetadataAction) {
      const { editingTranslationHostIds, editingPreferredHostId, editingPreferredLinkType } =
        deriveEditingTranslationLinkState({
          editingLayer,
          deletableLayers,
          layerLinks,
        });
      pendingDefaultOrthographyIdRef.current = editingLayer?.orthographyId?.trim() ?? '';
      setLanguageInput(editingLanguageSeed);
      setOrthographyId(editingLayer?.orthographyId?.trim() ?? '');
      setDialect(editingLayer?.dialect ?? '');
      setVernacular(editingLayer?.vernacular ?? '');
      setAlias(editingLayer ? getLayerLabelParts(editingLayer, locale).alias : '');
      setModality(editingLayer?.modality ?? 'text');
      setConstraint(
        editingLayer?.constraint ??
          (editingLayer?.layerType === 'translation'
            ? 'symbolic_association'
            : 'independent_boundary'),
      );
      setBridgeId(editingLayer?.bridgeId ?? '');
      setParticipantId(editingTierSnapshot.participantId);
      setDataCategory(editingTierSnapshot.dataCategory);
      setDelimiter(editingTierSnapshot.delimiter);
      setSortOrderInput(editingTierSnapshot.sortOrderInput);
      setAccessRights(editingLayer?.accessRights ?? 'open');
      setIsDefaultLayer(Boolean(editingLayer?.isDefault));
      setSelectedParentLayerId(
        editingLayer?.layerType === 'transcription'
          ? (layerTranscriptionTreeParentId(editingLayer) ?? '')
          : '',
      );
      setTranslationHostIds(editingTranslationHostIds);
      setPreferredTranslationHostId(editingPreferredHostId);
      setTranslationLinkType(editingPreferredLinkType);
      setCreateFailureMessage('');
      return;
    }
    pendingDefaultOrthographyIdRef.current = normalizedDefaultOrthographyId;
    setLanguageInput(defaultLanguageSeed);
    setOrthographyId(normalizedDefaultOrthographyId);
    setDialect('');
    setVernacular('');
    setAlias('');
    setModality('text');
    setConstraint('symbolic_association');
    setBridgeId('');
    setParticipantId('');
    setDataCategory('');
    setDelimiter('');
    setSortOrderInput('');
    setAccessRights('open');
    setIsDefaultLayer(false);
    setSelectedParentLayerId(contextualParentLayerId);
    if (action === 'create-translation') {
      const seed = computeCreateTranslationHostSeed(
        independentParentLayers,
        contextualParentLayerId,
      );
      setTranslationHostIds(seed.translationHostIds);
      setPreferredTranslationHostId(seed.preferredTranslationHostId);
    } else {
      setTranslationHostIds([]);
      setPreferredTranslationHostId('');
    }
    setTranslationLinkType('free');
    setCreateFailureMessage('');
  }, [
    action,
    contextualParentLayerId,
    defaultLanguageSeed,
    deletableLayers,
    editingLanguageSeed,
    editingLayer,
    editingTierSnapshot,
    independentParentLayers,
    isEditMetadataAction,
    layerLinks,
    locale,
    normalizedDefaultOrthographyId,
    pendingDefaultOrthographyIdRef,
    setAccessRights,
    setAlias,
    setBridgeId,
    setConstraint,
    setCreateFailureMessage,
    setDataCategory,
    setDelimiter,
    setDialect,
    setIsDefaultLayer,
    setLanguageInput,
    setModality,
    setOrthographyId,
    setParticipantId,
    setPreferredTranslationHostId,
    setSelectedParentLayerId,
    setSortOrderInput,
    setTranslationLinkType,
    setTranslationHostIds,
    setVernacular,
  ]);

  return { handleResetForm };
}
