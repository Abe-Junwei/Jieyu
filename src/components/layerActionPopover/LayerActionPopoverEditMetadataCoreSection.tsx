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
import type { LayerDocType, OrthographyDocType } from '../../db';
import type { LayerActionPopoverMessages } from '../../i18n/messages';
import type { LayerActionPopoverEditMetadataFieldIds } from './layerActionPopoverEditMetadataFieldIds';

export interface LayerActionPopoverEditMetadataCoreSectionProps {
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
  fieldIds: LayerActionPopoverEditMetadataFieldIds;
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
}

export function LayerActionPopoverEditMetadataCoreSection(
  props: LayerActionPopoverEditMetadataCoreSectionProps,
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
    fieldIds,
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
  } = props;

  return (
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
          <FormField htmlFor={fieldIds.orthography} label={actionMessages.orthographyFieldLabel}>
            <div className="layer-action-dialog-select-with-btn">
              <select
                id={fieldIds.orthography}
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
                onClick={() => orthographyPicker.handleSelectionChange(ORTHOGRAPHY_CREATE_SENTINEL)}
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
        <FormField htmlFor={fieldIds.dialect} label={actionMessages.dialectPlaceholder}>
          <input
            id={fieldIds.dialect}
            className="input panel-input layer-action-dialog-input"
            placeholder={actionMessages.dialectPlaceholder}
            value={dialect}
            onChange={(e) => setDialect(e.target.value)}
          />
        </FormField>
        <FormField htmlFor={fieldIds.vernacular} label={actionMessages.vernacularPlaceholder}>
          <input
            id={fieldIds.vernacular}
            className="input panel-input layer-action-dialog-input"
            placeholder={actionMessages.vernacularPlaceholder}
            value={vernacular}
            onChange={(e) => setVernacular(e.target.value)}
          />
        </FormField>
        <FormField htmlFor={fieldIds.alias} label={actionMessages.aliasShortPlaceholder}>
          <input
            id={fieldIds.alias}
            className="input panel-input layer-action-dialog-input"
            placeholder={actionMessages.aliasHint}
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
          />
        </FormField>
      </div>
      <FormField htmlFor={fieldIds.modality} label={actionMessages.modalityLabel}>
        <select
          id={fieldIds.modality}
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
  );
}
