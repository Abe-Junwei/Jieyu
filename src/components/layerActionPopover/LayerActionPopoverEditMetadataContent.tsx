import React from 'react';
import { MaterialSymbol } from '../ui/MaterialSymbol';
import { JIEYU_MATERIAL_INLINE } from '../../utils/jieyuMaterialIcon';
import { LanguageIsoInput, type LanguageIsoInputValue } from '../LanguageIsoInput';
import { FormField, PanelButton, PanelFeedback, PanelNote, PanelSection } from '../ui';
import {
  formatOrthographyOptionLabel,
  groupOrthographiesForSelect,
  ORTHOGRAPHY_CREATE_SENTINEL,
  type UseOrthographyPickerResult,
} from '../../hooks/useOrthographyPicker';
import { getOrthographyCatalogGroupLabel } from '../../i18n/messages';
import { readAnyMultiLangLabel } from '../../utils/multiLangLabels';
import { getOrthographyCatalogBadgeInfo } from '../orthographyCatalogUi';
import type { Locale } from '../../i18n';
import type { ResolveLanguageDisplayName } from '../../utils/languageDisplayNameResolver';
import type { LayerConstraint, LayerDocType, LayerLinkDocType, OrthographyDocType } from '../../db';
import { formatParentLayerOptionLabel } from '../layerActionPopoverHelpers';
import type { LayerActionPopoverMessages } from '../../i18n/messages';

interface LayerActionPopoverEditMetadataContentProps {
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

  const orthographyFieldId = `${fieldIdPrefix}-orthography`;
  const dialectFieldId = `${fieldIdPrefix}-dialect`;
  const vernacularFieldId = `${fieldIdPrefix}-vernacular`;
  const aliasFieldId = `${fieldIdPrefix}-alias`;
  const modalityFieldId = `${fieldIdPrefix}-modality`;
  const constraintFieldId = `${fieldIdPrefix}-constraint`;
  const accessRightsFieldId = `${fieldIdPrefix}-access-rights`;
  const bridgeIdFieldId = `${fieldIdPrefix}-bridge-id`;
  const participantIdFieldId = `${fieldIdPrefix}-participant-id`;
  const dataCategoryFieldId = `${fieldIdPrefix}-data-category`;
  const delimiterFieldId = `${fieldIdPrefix}-delimiter`;
  const sortOrderFieldId = `${fieldIdPrefix}-sort-order`;
  const translationLinkTypeFieldId = `${fieldIdPrefix}-translation-link-type`;
  const isDefaultFieldId = `${fieldIdPrefix}-is-default`;
  const translationParentLayerFieldId = `${fieldIdPrefix}-translation-parent-layer`;
  const transcriptionParentLayerFieldId = `${fieldIdPrefix}-transcription-parent-layer`;

  return (
    <>
      <PanelSection
        className="layer-action-dialog-section"
        title={actionMessages.metadataCoreSectionTitle}
        description={
          editingLayer
            ? `${actionMessages.metadataTargetLayerLabel}${readAnyMultiLangLabel(editingLayer.name) ?? editingLayer.key}`
            : undefined
        }
      >
        <LanguageIsoInput
          locale={locale}
          value={languageInput}
          onChange={setLanguageInput}
          searchScope="language"
          resolveLanguageDisplayName={resolveLanguageDisplayName}
          nameLabel={actionMessages.languageNameLabel}
          codeLabel={actionMessages.languageCodeLabel}
          namePlaceholder={actionMessages.selectLanguage}
          codePlaceholder={actionMessages.customLanguageCodePlaceholder}
          error={customLanguageError}
          disabled={isLoading || orthographyPicker.submitting}
          controlInputClassName="layer-action-dialog-input"
          languageAssetIdField={{
            id: `${fieldIdPrefix}-language-asset-id`,
            label: actionMessages.languageAssetIdLabel,
            value: languageInput.languageAssetId ?? '',
            placeholder: actionMessages.languageAssetIdPlaceholder,
            onChange: (value) => {
              setLanguageInput((prev) => ({ ...prev, languageAssetId: value }));
            },
            disabled: isLoading || orthographyPicker.submitting,
          }}
        />
        {resolvedLanguageId && (
          <div className="layer-action-dialog-field-group">
            <FormField htmlFor={orthographyFieldId} label={actionMessages.orthographyFieldLabel}>
              <div className="layer-action-dialog-select-with-btn">
                <select
                  id={orthographyFieldId}
                  className="input panel-input layer-action-dialog-input"
                  value={orthographyId}
                  onChange={(e) => orthographyPicker.handleSelectionChange(e.target.value)}
                >
                  {orthographyPicker.orthographies.length === 0 && (
                    <option value="">{actionMessages.useDefaultScript}</option>
                  )}
                  {groupedOrthographyOptions.map((group) => (
                    <optgroup
                      key={group.key}
                      label={getOrthographyCatalogGroupLabel(locale, group.key)}
                    >
                      {group.orthographies.map((orthography) => (
                        <option key={orthography.id} value={orthography.id}>
                          {formatOrthographyOptionLabel(orthography, locale)}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <PanelButton
                  variant="ghost"
                  className="layer-action-dialog-inline-btn"
                  onClick={() =>
                    orthographyPicker.handleSelectionChange(ORTHOGRAPHY_CREATE_SENTINEL)
                  }
                  title={actionMessages.createOrthography}
                >
                  <MaterialSymbol name="add" className={JIEYU_MATERIAL_INLINE} />
                  <span>{actionMessages.newOrthographyButton}</span>
                </PanelButton>
              </div>
            </FormField>
            {orthographyPicker.orthographies.length === 0 && (
              <PanelNote className="layer-action-dialog-meta-note">
                {actionMessages.orthographyHint}
              </PanelNote>
            )}
            {selectedOrthography && selectedOrthographyBadge && (
              <PanelNote className="layer-action-dialog-meta-note dialog-hint-inline">
                <span>{formatOrthographyOptionLabel(selectedOrthography, locale)}</span>
                <span className={selectedOrthographyBadge.className}>
                  {selectedOrthographyBadge.label}
                </span>
              </PanelNote>
            )}
            {orthographyPicker.error && (
              <PanelFeedback level="error">{orthographyPicker.error}</PanelFeedback>
            )}
            {orthographySelectionError && (
              <PanelFeedback level="error">{orthographySelectionError}</PanelFeedback>
            )}
          </div>
        )}
        <div className="layer-action-dialog-triple-row">
          <FormField htmlFor={dialectFieldId} label={actionMessages.dialectPlaceholder}>
            <input
              id={dialectFieldId}
              className="input panel-input layer-action-dialog-input"
              placeholder={actionMessages.dialectPlaceholder}
              value={dialect}
              onChange={(e) => setDialect(e.target.value)}
            />
          </FormField>
          <FormField htmlFor={vernacularFieldId} label={actionMessages.vernacularPlaceholder}>
            <input
              id={vernacularFieldId}
              className="input panel-input layer-action-dialog-input"
              placeholder={actionMessages.vernacularPlaceholder}
              value={vernacular}
              onChange={(e) => setVernacular(e.target.value)}
            />
          </FormField>
          <FormField htmlFor={aliasFieldId} label={actionMessages.aliasShortPlaceholder}>
            <input
              id={aliasFieldId}
              className="input panel-input layer-action-dialog-input"
              placeholder={actionMessages.aliasHint}
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
            />
          </FormField>
        </div>
        <FormField htmlFor={modalityFieldId} label={actionMessages.modalityLabel}>
          <select
            id={modalityFieldId}
            className="input panel-input layer-action-dialog-input"
            value={modality}
            onChange={(e) => setModality(e.target.value as 'text' | 'audio' | 'mixed')}
          >
            <option value="text">{actionMessages.modalityText}</option>
            <option value="audio">{actionMessages.modalityAudio}</option>
            <option value="mixed">{actionMessages.modalityMixed}</option>
          </select>
        </FormField>
      </PanelSection>

      {isEditingTranscriptionLayer && (
        <PanelSection
          className="layer-action-dialog-section"
          title={actionMessages.metadataStructureSectionTitle}
        >
          <FormField htmlFor={constraintFieldId} label={actionMessages.constraintLegend}>
            <select
              id={constraintFieldId}
              className="input panel-input layer-action-dialog-input"
              value={constraint}
              onChange={(e) => setConstraint(e.target.value as LayerConstraint)}
            >
              <option value="symbolic_association">{actionMessages.dependentConstraint}</option>
              <option value="independent_boundary">{actionMessages.independentConstraint}</option>
            </select>
          </FormField>
          {constraint === 'symbolic_association' && independentParentLayers.length > 1 && (
            <FormField
              htmlFor={transcriptionParentLayerFieldId}
              label={actionMessages.selectParentLayer}
            >
              <select
                id={transcriptionParentLayerFieldId}
                className="input panel-input layer-action-dialog-input"
                value={selectedParentLayerId}
                onChange={(e) => setSelectedParentLayerId(e.target.value)}
              >
                <option value="">{actionMessages.selectParentLayer}</option>
                {independentParentLayers.map((layer) => (
                  <option key={layer.id} value={layer.id}>
                    {formatParentLayerOptionLabel(layer)}
                  </option>
                ))}
              </select>
            </FormField>
          )}
          {constraint === 'symbolic_association' && autoTranscriptionParentLayer && (
            <PanelNote className="layer-action-dialog-meta-note layer-action-dialog-auto-linked-hint">
              {actionMessages.autoLinkedParent(
                formatParentLayerOptionLabel(autoTranscriptionParentLayer),
              )}
            </PanelNote>
          )}
        </PanelSection>
      )}

      {isEditingTranslationLayer && (
        <PanelSection
          className="layer-action-dialog-section"
          title={actionMessages.metadataStructureSectionTitle}
        >
          <div className="dialog-field">
            <div className="dialog-field-label" id={`${translationParentLayerFieldId}-legend`}>
              {actionMessages.translationHostLayersLabel}
            </div>
            <div
              className="layer-action-dialog-translation-host-list"
              role="group"
              aria-labelledby={`${translationParentLayerFieldId}-legend`}
            >
              {independentParentLayers.map((layer) => (
                <label
                  key={layer.id}
                  className="panel-checkbox layer-action-dialog-checkbox-option"
                >
                  <input
                    id={`${translationParentLayerFieldId}-${layer.id}`}
                    type="checkbox"
                    checked={translationHostIds.includes(layer.id)}
                    onChange={(event) => toggleTranslationHost(layer.id, event.target.checked)}
                  />
                  <span>{formatParentLayerOptionLabel(layer)}</span>
                </label>
              ))}
            </div>
            {translationHostIds.length > 1 && (
              <fieldset className="panel-fieldset layer-action-dialog-fieldset layer-action-dialog-translation-preferred-hosts">
                <legend className="layer-action-dialog-fieldset-legend">
                  {actionMessages.translationPreferredHostLabel}
                </legend>
                {translationHostIds.map((hostId) => {
                  const layer = independentParentLayers.find((item) => item.id === hostId);
                  if (!layer) return null;
                  return (
                    <label key={hostId} className="panel-radio layer-action-dialog-radio-option">
                      <input
                        type="radio"
                        name={`${fieldIdPrefix}-trl-preferred-host`}
                        checked={preferredTranslationHostId === hostId}
                        onChange={() => setPreferredTranslationHostId(hostId)}
                      />
                      <span>{formatParentLayerOptionLabel(layer)}</span>
                    </label>
                  );
                })}
              </fieldset>
            )}
            {autoTranslationHostLayer && (
              <PanelNote className="layer-action-dialog-meta-note layer-action-dialog-auto-linked-hint">
                {actionMessages.autoLinkedParent(
                  formatParentLayerOptionLabel(autoTranslationHostLayer),
                )}
              </PanelNote>
            )}
          </div>
          <FormField
            htmlFor={translationLinkTypeFieldId}
            label={actionMessages.translationLinkTypeLabel}
          >
            <select
              id={translationLinkTypeFieldId}
              className="input panel-input layer-action-dialog-input"
              value={translationLinkType}
              onChange={(e) =>
                setTranslationLinkType(e.target.value as LayerLinkDocType['linkType'])
              }
            >
              <option value="direct">{actionMessages.translationLinkTypeDirect}</option>
              <option value="free">{actionMessages.translationLinkTypeFree}</option>
              <option value="literal">{actionMessages.translationLinkTypeLiteral}</option>
              <option value="pedagogical">{actionMessages.translationLinkTypePedagogical}</option>
            </select>
          </FormField>
        </PanelSection>
      )}

      <PanelSection
        className="layer-action-dialog-section"
        title={actionMessages.metadataInteropSectionTitle}
      >
        <div className="layer-action-dialog-triple-row">
          <FormField htmlFor={participantIdFieldId} label={actionMessages.participantIdLabel}>
            <input
              id={participantIdFieldId}
              className="input panel-input layer-action-dialog-input"
              placeholder={actionMessages.participantIdPlaceholder}
              value={participantId}
              onChange={(e) => setParticipantId(e.target.value)}
            />
          </FormField>
          <FormField htmlFor={dataCategoryFieldId} label={actionMessages.dataCategoryLabel}>
            <input
              id={dataCategoryFieldId}
              className="input panel-input layer-action-dialog-input"
              placeholder={actionMessages.dataCategoryPlaceholder}
              value={dataCategory}
              onChange={(e) => setDataCategory(e.target.value)}
            />
          </FormField>
          <FormField htmlFor={sortOrderFieldId} label={actionMessages.sortOrderLabel}>
            <input
              id={sortOrderFieldId}
              type="number"
              min="0"
              step="1"
              className="input panel-input layer-action-dialog-input"
              placeholder={actionMessages.sortOrderPlaceholder}
              value={sortOrderInput}
              onChange={(e) => setSortOrderInput(e.target.value)}
            />
          </FormField>
        </div>
        <FormField htmlFor={delimiterFieldId} label={actionMessages.delimiterLabel}>
          <input
            id={delimiterFieldId}
            className="input panel-input layer-action-dialog-input"
            placeholder={actionMessages.delimiterPlaceholder}
            value={delimiter}
            onChange={(e) => setDelimiter(e.target.value)}
          />
        </FormField>
      </PanelSection>

      <PanelSection
        className="layer-action-dialog-section"
        title={actionMessages.metadataGovernanceSectionTitle}
      >
        <FormField htmlFor={bridgeIdFieldId} label={actionMessages.bridgeIdLabel}>
          <input
            id={bridgeIdFieldId}
            className="input panel-input layer-action-dialog-input"
            placeholder={actionMessages.bridgeIdPlaceholder}
            value={bridgeId}
            onChange={(e) => setBridgeId(e.target.value)}
          />
        </FormField>
        <FormField htmlFor={accessRightsFieldId} label={actionMessages.accessRightsLabel}>
          <select
            id={accessRightsFieldId}
            className="input panel-input layer-action-dialog-input"
            value={accessRights}
            onChange={(e) =>
              setAccessRights(e.target.value as 'open' | 'restricted' | 'confidential')
            }
          >
            <option value="open">{actionMessages.accessRightsOpen}</option>
            <option value="restricted">{actionMessages.accessRightsRestricted}</option>
            <option value="confidential">{actionMessages.accessRightsConfidential}</option>
          </select>
        </FormField>
        <label
          className="panel-checkbox layer-action-dialog-checkbox-option"
          htmlFor={isDefaultFieldId}
        >
          <input
            id={isDefaultFieldId}
            type="checkbox"
            checked={isDefaultLayer}
            onChange={(e) => setIsDefaultLayer(e.target.checked)}
          />
          <span>{actionMessages.isDefaultLabel}</span>
        </label>
      </PanelSection>

      {createFailureMessage.trim().length > 0 ? (
        <PanelFeedback role="alert" aria-live="assertive" level="error">
          {createFailureMessage}
        </PanelFeedback>
      ) : null}
    </>
  );
}
