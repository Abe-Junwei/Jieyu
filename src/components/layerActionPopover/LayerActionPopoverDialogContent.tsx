import { memo } from 'react';
import { OrthographyBuilderPanel } from '../OrthographyBuilderPanel';
import { PanelChip } from '../ui';
import { LayerActionPopoverCreateContent } from './LayerActionPopoverCreateContent';
import { LayerActionPopoverDeleteContent } from './LayerActionPopoverDeleteContent';
import { LayerActionPopoverEditMetadataContent } from './LayerActionPopoverEditMetadataContent';
import type { LayerActionPopoverProps } from './LayerActionPopoverTypes';
import type { LayerActionPopoverFormState } from './useLayerActionPopoverFormState';
import type { LayerActionPopoverCreateGuardBundle } from './layerActionPopoverCreateGuardDerivations';
import type { LayerActionType } from '../layerActionPopoverHelpers';

export type LayerActionPopoverDialogContentProps = {
  action: LayerActionType;
  isEditMetadataAction: boolean;
  deletableLayers: LayerActionPopoverProps['deletableLayers'];
  form: LayerActionPopoverFormState;
  guards: LayerActionPopoverCreateGuardBundle;
  label: string;
  toggleTranslationHost: (hostId: string, checked: boolean) => void;
};

export const LayerActionPopoverDialogContent = memo(function LayerActionPopoverDialogContent({
  action,
  isEditMetadataAction,
  deletableLayers,
  form,
  guards,
  label,
  toggleTranslationHost,
}: LayerActionPopoverDialogContentProps) {
  const {
    actionMessages,
    deleteConfirm,
    deleteLayerId,
    setDeleteLayerId,
    fieldIdPrefix,
    locale,
    languageOptions,
    displayedLanguage,
    editingLayer,
    languageInput,
    setLanguageInput,
    resolveLanguageDisplayName,
    customLanguageError,
    isLoading,
    orthographyPicker,
    resolvedLanguageId,
    orthographyId,
    groupedOrthographyOptions,
    selectedOrthography,
    selectedOrthographyBadge,
    orthographySelectionError,
    dialect,
    setDialect,
    vernacular,
    setVernacular,
    alias,
    setAlias,
    modality,
    setModality,
    isEditingTranscriptionLayer,
    constraint,
    setConstraint,
    independentParentLayers,
    selectedParentLayerId,
    setSelectedParentLayerId,
    autoTranscriptionParentLayer,
    isEditingTranslationLayer,
    translationHostIds,
    preferredTranslationHostId,
    setPreferredTranslationHostId,
    autoTranslationHostLayer,
    translationLinkType,
    setTranslationLinkType,
    participantId,
    setParticipantId,
    dataCategory,
    setDataCategory,
    sortOrderInput,
    setSortOrderInput,
    delimiter,
    setDelimiter,
    bridgeId,
    setBridgeId,
    accessRights,
    setAccessRights,
    isDefaultLayer,
    setIsDefaultLayer,
    createFailureMessage,
  } = form;

  const deleteLayerFieldId = `${fieldIdPrefix}-delete-layer`;
  const summaryMeta = (
    <div className="panel-meta">
      <PanelChip>{actionMessages.deleteLayer}</PanelChip>
      <PanelChip variant="danger">{deletableLayers.length}</PanelChip>
    </div>
  );

  if (action === 'delete') {
    return (
      <LayerActionPopoverDeleteContent
        actionMessages={actionMessages}
        deleteConfirm={deleteConfirm}
        deleteLayerFieldId={deleteLayerFieldId}
        deleteLayerId={deleteLayerId}
        setDeleteLayerId={setDeleteLayerId}
        deletableLayers={deletableLayers}
        summaryMeta={summaryMeta}
      />
    );
  }

  if (isEditMetadataAction) {
    return (
      <LayerActionPopoverEditMetadataContent
        locale={locale}
        actionMessages={actionMessages}
        editingLayer={editingLayer}
        languageInput={languageInput}
        setLanguageInput={setLanguageInput}
        resolveLanguageDisplayName={resolveLanguageDisplayName}
        customLanguageError={customLanguageError}
        isLoading={isLoading}
        orthographyPicker={orthographyPicker}
        fieldIdPrefix={fieldIdPrefix}
        resolvedLanguageId={resolvedLanguageId}
        orthographyId={orthographyId}
        groupedOrthographyOptions={groupedOrthographyOptions}
        selectedOrthography={selectedOrthography}
        selectedOrthographyBadge={selectedOrthographyBadge}
        orthographySelectionError={orthographySelectionError}
        dialect={dialect}
        setDialect={setDialect}
        vernacular={vernacular}
        setVernacular={setVernacular}
        alias={alias}
        setAlias={setAlias}
        modality={modality}
        setModality={setModality}
        isEditingTranscriptionLayer={isEditingTranscriptionLayer}
        constraint={constraint}
        setConstraint={setConstraint}
        independentParentLayers={independentParentLayers}
        selectedParentLayerId={selectedParentLayerId}
        setSelectedParentLayerId={setSelectedParentLayerId}
        autoTranscriptionParentLayer={autoTranscriptionParentLayer}
        isEditingTranslationLayer={isEditingTranslationLayer}
        translationHostIds={translationHostIds}
        toggleTranslationHost={toggleTranslationHost}
        preferredTranslationHostId={preferredTranslationHostId}
        setPreferredTranslationHostId={setPreferredTranslationHostId}
        autoTranslationHostLayer={autoTranslationHostLayer}
        translationLinkType={translationLinkType}
        setTranslationLinkType={setTranslationLinkType}
        participantId={participantId}
        setParticipantId={setParticipantId}
        dataCategory={dataCategory}
        setDataCategory={setDataCategory}
        sortOrderInput={sortOrderInput}
        setSortOrderInput={setSortOrderInput}
        delimiter={delimiter}
        setDelimiter={setDelimiter}
        bridgeId={bridgeId}
        setBridgeId={setBridgeId}
        accessRights={accessRights}
        setAccessRights={setAccessRights}
        isDefaultLayer={isDefaultLayer}
        setIsDefaultLayer={setIsDefaultLayer}
        createFailureMessage={createFailureMessage}
      />
    );
  }

  if (orthographyPicker.isCreating) {
    return (
      <OrthographyBuilderPanel
        picker={orthographyPicker}
        languageOptions={languageOptions}
        compact
        hideActions
        sourceLanguagePlaceholder={actionMessages.sourceLanguagePlaceholder}
        sourceLanguageCodePlaceholder={actionMessages.sourceLanguageCodePlaceholder}
        contextLines={[
          label,
          actionMessages.orthographyContextTargetLanguage(displayedLanguage),
          actionMessages.orthographyContextLayerType(
            action === 'create-translation'
              ? actionMessages.translationLayerType
              : actionMessages.transcriptionLayerType,
          ),
        ]}
      />
    );
  }

  return (
    <LayerActionPopoverCreateContent
      locale={locale}
      actionMessages={actionMessages}
      action={action}
      languageInput={languageInput}
      setLanguageInput={setLanguageInput}
      resolveLanguageDisplayName={resolveLanguageDisplayName}
      customLanguageError={customLanguageError}
      isLoading={isLoading}
      orthographyPicker={orthographyPicker}
      fieldIdPrefix={fieldIdPrefix}
      resolvedLanguageId={resolvedLanguageId}
      orthographyId={orthographyId}
      groupedOrthographyOptions={groupedOrthographyOptions}
      selectedOrthography={selectedOrthography}
      selectedOrthographyBadge={selectedOrthographyBadge}
      orthographySelectionError={orthographySelectionError}
      dialect={dialect}
      setDialect={setDialect}
      vernacular={vernacular}
      setVernacular={setVernacular}
      alias={alias}
      setAlias={setAlias}
      modality={modality}
      setModality={setModality}
      independentParentLayers={independentParentLayers}
      translationHostIds={translationHostIds}
      toggleTranslationHost={toggleTranslationHost}
      preferredTranslationHostId={preferredTranslationHostId}
      setPreferredTranslationHostId={setPreferredTranslationHostId}
      autoTranslationHostLayer={autoTranslationHostLayer}
      showConstraintSelector={guards.showConstraintSelector}
      constraint={constraint}
      setConstraint={setConstraint}
      symbolicConstraintGuard={guards.symbolicConstraintGuard}
      independentConstraintGuard={guards.independentConstraintGuard}
      selectedParentLayerId={selectedParentLayerId}
      setSelectedParentLayerId={setSelectedParentLayerId}
      autoTranscriptionParentLayer={autoTranscriptionParentLayer}
      showCreateFailure={guards.showCreateFailure}
      createFailureMessage={createFailureMessage}
      translationCreateDisabledReason={guards.translationCreateDisabledReason}
      transcriptionCreateDisabledReason={guards.transcriptionCreateDisabledReason}
      hasValidLanguage={guards.hasValidLanguage}
      createLanguageRequiredText={guards.createLanguageRequiredText}
    />
  );
});
