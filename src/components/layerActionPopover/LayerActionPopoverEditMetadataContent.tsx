import React from 'react';
import { PanelFeedback } from '../ui';
import type { LanguageIsoInputValue } from '../LanguageIsoInput';
import {
  groupOrthographiesForSelect,
  type UseOrthographyPickerResult,
} from '../../hooks/useOrthographyPicker';
import { getOrthographyCatalogBadgeInfo } from '../orthographyCatalogUi';
import type { Locale } from '../../i18n';
import type { ResolveLanguageDisplayName } from '../../utils/languageDisplayNameResolver';
import type { LayerConstraint, LayerDocType, LayerLinkDocType, OrthographyDocType } from '../../db';
import type { LayerActionPopoverMessages } from '../../i18n/messages';
import { buildLayerActionPopoverEditMetadataFieldIds } from './layerActionPopoverEditMetadataFieldIds';
import { LayerActionPopoverEditMetadataCoreSection } from './LayerActionPopoverEditMetadataCoreSection';
import { LayerActionPopoverEditMetadataTranscriptionStructureSection } from './LayerActionPopoverEditMetadataTranscriptionStructureSection';
import { LayerActionPopoverEditMetadataTranslationStructureSection } from './LayerActionPopoverEditMetadataTranslationStructureSection';
import { LayerActionPopoverEditMetadataInteropSection } from './LayerActionPopoverEditMetadataInteropSection';
import { LayerActionPopoverEditMetadataGovernanceSection } from './LayerActionPopoverEditMetadataGovernanceSection';

export interface LayerActionPopoverEditMetadataContentProps {
  locale: Locale;
  actionMessages: LayerActionPopoverMessages;
  editingLayer: LayerDocType | undefined;
  languageInput: LanguageIsoInputValue;
  setLanguageInput: React.Dispatch<React.SetStateAction<LanguageIsoInputValue>>;
  resolveLanguageDisplayName: ResolveLanguageDisplayName;
  customLanguageError: string;
  isLoading: boolean;
  orthographyPicker: Pick<
    UseOrthographyPickerResult,
    'submitting' | 'handleSelectionChange' | 'orthographies' | 'error'
  >;
  fieldIdPrefix: string;
  resolvedLanguageId: string;
  orthographyId: string;
  groupedOrthographyOptions: ReturnType<typeof groupOrthographiesForSelect>;
  selectedOrthography: OrthographyDocType | undefined;
  selectedOrthographyBadge: ReturnType<typeof getOrthographyCatalogBadgeInfo> | null;
  orthographySelectionError: string;
  dialect: string;
  setDialect: (v: string) => void;
  vernacular: string;
  setVernacular: (v: string) => void;
  alias: string;
  setAlias: (v: string) => void;
  modality: 'text' | 'audio' | 'mixed';
  setModality: (v: 'text' | 'audio' | 'mixed') => void;
  isEditingTranscriptionLayer: boolean;
  constraint: LayerConstraint;
  setConstraint: (v: LayerConstraint) => void;
  independentParentLayers: LayerDocType[];
  selectedParentLayerId: string;
  setSelectedParentLayerId: (v: string) => void;
  autoTranscriptionParentLayer: LayerDocType | undefined;
  isEditingTranslationLayer: boolean;
  translationHostIds: string[];
  toggleTranslationHost: (hostId: string, checked: boolean) => void;
  preferredTranslationHostId: string;
  setPreferredTranslationHostId: (v: string) => void;
  autoTranslationHostLayer: LayerDocType | undefined;
  translationLinkType: LayerLinkDocType['linkType'];
  setTranslationLinkType: (v: LayerLinkDocType['linkType']) => void;
  participantId: string;
  setParticipantId: (v: string) => void;
  dataCategory: string;
  setDataCategory: (v: string) => void;
  sortOrderInput: string;
  setSortOrderInput: (v: string) => void;
  delimiter: string;
  setDelimiter: (v: string) => void;
  bridgeId: string;
  setBridgeId: (v: string) => void;
  accessRights: 'open' | 'restricted' | 'confidential';
  setAccessRights: (v: 'open' | 'restricted' | 'confidential') => void;
  isDefaultLayer: boolean;
  setIsDefaultLayer: (v: boolean) => void;
  createFailureMessage: string;
}

export function LayerActionPopoverEditMetadataContent(
  props: LayerActionPopoverEditMetadataContentProps,
) {
  const {
    locale,
    actionMessages,
    editingLayer,
    languageInput,
    setLanguageInput,
    resolveLanguageDisplayName,
    customLanguageError,
    isLoading,
    orthographyPicker,
    fieldIdPrefix,
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
    toggleTranslationHost,
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
  } = props;

  const fieldIds = buildLayerActionPopoverEditMetadataFieldIds(fieldIdPrefix);

  return (
    <>
      <LayerActionPopoverEditMetadataCoreSection
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
        fieldIds={fieldIds}
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
      />

      {isEditingTranscriptionLayer && (
        <LayerActionPopoverEditMetadataTranscriptionStructureSection
          actionMessages={actionMessages}
          fieldIds={fieldIds}
          constraint={constraint}
          setConstraint={setConstraint}
          independentParentLayers={independentParentLayers}
          selectedParentLayerId={selectedParentLayerId}
          setSelectedParentLayerId={setSelectedParentLayerId}
          autoTranscriptionParentLayer={autoTranscriptionParentLayer}
        />
      )}

      {isEditingTranslationLayer && (
        <LayerActionPopoverEditMetadataTranslationStructureSection
          actionMessages={actionMessages}
          fieldIdPrefix={fieldIdPrefix}
          fieldIds={fieldIds}
          independentParentLayers={independentParentLayers}
          translationHostIds={translationHostIds}
          toggleTranslationHost={toggleTranslationHost}
          preferredTranslationHostId={preferredTranslationHostId}
          setPreferredTranslationHostId={setPreferredTranslationHostId}
          autoTranslationHostLayer={autoTranslationHostLayer}
          translationLinkType={translationLinkType}
          setTranslationLinkType={setTranslationLinkType}
        />
      )}

      <LayerActionPopoverEditMetadataInteropSection
        actionMessages={actionMessages}
        fieldIds={fieldIds}
        participantId={participantId}
        setParticipantId={setParticipantId}
        dataCategory={dataCategory}
        setDataCategory={setDataCategory}
        sortOrderInput={sortOrderInput}
        setSortOrderInput={setSortOrderInput}
        delimiter={delimiter}
        setDelimiter={setDelimiter}
      />

      <LayerActionPopoverEditMetadataGovernanceSection
        actionMessages={actionMessages}
        fieldIds={fieldIds}
        bridgeId={bridgeId}
        setBridgeId={setBridgeId}
        accessRights={accessRights}
        setAccessRights={setAccessRights}
        isDefaultLayer={isDefaultLayer}
        setIsDefaultLayer={setIsDefaultLayer}
      />

      {createFailureMessage.trim().length > 0 ? (
        <PanelFeedback role="alert" aria-live="assertive" level="error">
          {createFailureMessage}
        </PanelFeedback>
      ) : null}
    </>
  );
}
