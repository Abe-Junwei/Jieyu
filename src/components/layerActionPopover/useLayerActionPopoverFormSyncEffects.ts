import { useEffect } from 'react';
import { getDb, layerTranscriptionTreeParentId } from '../../db';
import { getLayerLabelParts } from '../../utils/transcriptionFormatters';
import { normalizeLanguageInputAssetId } from '../../utils/languageInputHostState';
import {
  computeCreateTranslationHostSeed,
  deriveEditingTranslationLinkState,
} from './layerActionPopoverFormDerivations';
import type { LayerActionPopoverProps } from './LayerActionPopoverTypes';
import type { LayerActionPopoverFormState } from './useLayerActionPopoverFormState';

/**
 * Side-effect synchronization for layer popover form state.
 * Split from `useLayerActionPopoverFormState` to keep reactive-hook counts within repo limits.
 */
export function useLayerActionPopoverFormSyncEffects(
  props: LayerActionPopoverProps,
  form: LayerActionPopoverFormState,
) {
  const { action, layerId, deletableLayers, layerLinks = [] } = props;

  const {
    locale,
    formInitializationKey,
    contextualParentLayerId,
    independentParentLayers,
    isEditMetadataAction,
    editingLayer,
    editingLanguageSeed,
    defaultLanguageSeed,
    normalizedDefaultOrthographyId,
    lastInitializedFormKeyRef,
    pendingDefaultOrthographyIdRef,
    resolvedLanguageId,
    orthographyId,
    orthographyPicker,
    baselineLanguageSeed,
    translationHostIds,
    needsTranscriptionDependentParent,
    autoTranscriptionParentLayer,
    selectedParentLayerId,
    isEditingTranslationLayer,
    setDeleteLayerId,
    setCreateFailureMessage,
    setConstraint,
    setSelectedParentLayerId,
    setLanguageInput,
    setOrthographyId,
    setDialect,
    setVernacular,
    setAlias,
    setModality,
    setBridgeId,
    setParticipantId,
    setDataCategory,
    setDelimiter,
    setSortOrderInput,
    setEditingTierSnapshot,
    setAccessRights,
    setIsDefaultLayer,
    setTranslationHostIds,
    setPreferredTranslationHostId,
    setTranslationLinkType,
  } = form;

  useEffect(() => {
    if (layerId) setDeleteLayerId(layerId);
  }, [layerId, setDeleteLayerId]);

  useEffect(() => {
    if (lastInitializedFormKeyRef.current === formInitializationKey) {
      return;
    }
    lastInitializedFormKeyRef.current = formInitializationKey;
    setCreateFailureMessage('');
    setConstraint('symbolic_association');
    setSelectedParentLayerId(contextualParentLayerId);
    if (action === 'delete') {
      pendingDefaultOrthographyIdRef.current = '';
      return;
    }
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
      setParticipantId('');
      setDataCategory('');
      setDelimiter('');
      setSortOrderInput(
        editingLayer?.sortOrder !== undefined ? String(editingLayer.sortOrder) : '',
      );
      setEditingTierSnapshot({
        participantId: '',
        dataCategory: '',
        delimiter: '',
        sortOrderInput: editingLayer?.sortOrder !== undefined ? String(editingLayer.sortOrder) : '',
      });
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
      return;
    }
    pendingDefaultOrthographyIdRef.current = normalizedDefaultOrthographyId;
    setLanguageInput(defaultLanguageSeed);
    setOrthographyId(normalizedDefaultOrthographyId);
    setDialect('');
    setVernacular('');
    setAlias('');
    setModality('text');
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
    setBridgeId('');
    setParticipantId('');
    setDataCategory('');
    setDelimiter('');
    setSortOrderInput('');
    setEditingTierSnapshot({
      participantId: '',
      dataCategory: '',
      delimiter: '',
      sortOrderInput: '',
    });
    setAccessRights('open');
    setIsDefaultLayer(false);
    setTranslationLinkType('free');
  }, [
    action,
    contextualParentLayerId,
    defaultLanguageSeed,
    deletableLayers,
    editingLanguageSeed,
    editingLayer,
    formInitializationKey,
    independentParentLayers,
    isEditMetadataAction,
    lastInitializedFormKeyRef,
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
    setEditingTierSnapshot,
    setIsDefaultLayer,
    setLanguageInput,
    setModality,
    setOrthographyId,
    setParticipantId,
    setPreferredTranslationHostId,
    setSelectedParentLayerId,
    setSortOrderInput,
    setTranslationHostIds,
    setTranslationLinkType,
    setVernacular,
  ]);

  useEffect(() => {
    if (!isEditMetadataAction || !editingLayer?.id) return;
    let cancelled = false;
    void (async () => {
      const db = await getDb();
      const tier = await db.dexie.tier_definitions.get(editingLayer.id);
      if (cancelled) return;
      const nextSnapshot = {
        participantId: tier?.participantId ?? '',
        dataCategory: tier?.dataCategory ?? '',
        delimiter: tier?.delimiter ?? '',
        sortOrderInput:
          tier?.sortOrder !== undefined
            ? String(tier.sortOrder)
            : editingLayer.sortOrder !== undefined
              ? String(editingLayer.sortOrder)
              : '',
      };
      setParticipantId(nextSnapshot.participantId);
      setDataCategory(nextSnapshot.dataCategory);
      setDelimiter(nextSnapshot.delimiter);
      setSortOrderInput(nextSnapshot.sortOrderInput);
      setEditingTierSnapshot(nextSnapshot);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    editingLayer?.id,
    editingLayer?.sortOrder,
    isEditMetadataAction,
    setDataCategory,
    setDelimiter,
    setEditingTierSnapshot,
    setParticipantId,
    setSortOrderInput,
  ]);

  useEffect(() => {
    const pendingDefaultOrthographyId = pendingDefaultOrthographyIdRef.current.trim();
    if (!pendingDefaultOrthographyId) return;
    if (
      resolvedLanguageId !== normalizeLanguageInputAssetId(baselineLanguageSeed) ||
      orthographyPicker.isCreating
    ) {
      return;
    }
    if (orthographyId === pendingDefaultOrthographyId) {
      pendingDefaultOrthographyIdRef.current = '';
      return;
    }
    if (
      orthographyPicker.orthographies.some(
        (orthography) => orthography.id === pendingDefaultOrthographyId,
      )
    ) {
      setOrthographyId(pendingDefaultOrthographyId);
      pendingDefaultOrthographyIdRef.current = '';
      return;
    }
    if (orthographyPicker.orthographies.length > 0) {
      pendingDefaultOrthographyIdRef.current = '';
    }
  }, [
    baselineLanguageSeed,
    orthographyId,
    orthographyPicker.isCreating,
    orthographyPicker.orthographies,
    pendingDefaultOrthographyIdRef,
    resolvedLanguageId,
    setOrthographyId,
  ]);

  useEffect(() => {
    if (action !== 'create-translation' && !isEditingTranslationLayer) return;
    setPreferredTranslationHostId((pref) => {
      if (translationHostIds.length === 0) return '';
      if (pref && translationHostIds.includes(pref)) return pref;
      return translationHostIds[0]!;
    });
  }, [action, isEditingTranslationLayer, setPreferredTranslationHostId, translationHostIds]);

  useEffect(() => {
    if (!needsTranscriptionDependentParent) {
      if (selectedParentLayerId) setSelectedParentLayerId('');
      return;
    }
    if (autoTranscriptionParentLayer) {
      if (selectedParentLayerId !== autoTranscriptionParentLayer.id) {
        setSelectedParentLayerId(autoTranscriptionParentLayer.id);
      }
      return;
    }
    if (
      selectedParentLayerId &&
      independentParentLayers.some((layer) => layer.id === selectedParentLayerId)
    ) {
      return;
    }
    if (selectedParentLayerId) setSelectedParentLayerId('');
  }, [
    autoTranscriptionParentLayer,
    independentParentLayers,
    needsTranscriptionDependentParent,
    selectedParentLayerId,
    setSelectedParentLayerId,
  ]);
}
