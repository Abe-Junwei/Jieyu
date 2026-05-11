import React from 'react';
import { MaterialSymbol } from '../ui/MaterialSymbol';
import { JIEYU_MATERIAL_INLINE } from '../../utils/jieyuMaterialIcon';
import { LanguageIsoInput, type LanguageIsoInputValue } from '../LanguageIsoInput';
import { FormField, PanelButton, PanelFeedback, PanelFeedbackStack, PanelNote } from '../ui';
import {
  formatOrthographyOptionLabel,
  groupOrthographiesForSelect,
  ORTHOGRAPHY_CREATE_SENTINEL,
  type UseOrthographyPickerResult,
} from '../../hooks/orthography/useOrthographyPicker';
import { getOrthographyCatalogGroupLabel } from '../../i18n/messages';
import { getOrthographyCatalogBadgeInfo } from '../orthographyCatalogUi';
import type { Locale } from '../../i18n';
import type { ResolveLanguageDisplayName } from '../../utils/languageDisplayNameResolver';
import type { LayerConstraint, LayerDocType, OrthographyDocType } from '../../db';
import { formatParentLayerOptionLabel, type LayerActionType } from '../layerActionPopoverHelpers';
import type { LayerActionPopoverMessages } from '../../i18n/messages';

interface LayerActionPopoverCreateContentProps {
  locale: Locale;
  actionMessages: LayerActionPopoverMessages;
  action: LayerActionType;
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
  independentParentLayers: LayerDocType[];
  translationHostIds: string[];
  toggleTranslationHost: (hostId: string, checked: boolean) => void;
  preferredTranslationHostId: string;
  setPreferredTranslationHostId: (v: string) => void;
  autoTranslationHostLayer: LayerDocType | undefined;
  showConstraintSelector: boolean;
  constraint: LayerConstraint;
  setConstraint: (v: LayerConstraint) => void;
  symbolicConstraintGuard: { allowed: boolean };
  independentConstraintGuard: { allowed: boolean };
  selectedParentLayerId: string;
  setSelectedParentLayerId: (v: string) => void;
  autoTranscriptionParentLayer: LayerDocType | undefined;
  showCreateFailure: boolean;
  createFailureMessage: string;
  translationCreateDisabledReason: string;
  transcriptionCreateDisabledReason: string;
  hasValidLanguage: boolean;
  createLanguageRequiredText: string;
}

export function LayerActionPopoverCreateContent(props: LayerActionPopoverCreateContentProps) {
  const {
    locale,
    actionMessages,
    action,
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
    independentParentLayers,
    translationHostIds,
    toggleTranslationHost,
    preferredTranslationHostId,
    setPreferredTranslationHostId,
    autoTranslationHostLayer,
    showConstraintSelector,
    constraint,
    setConstraint,
    symbolicConstraintGuard,
    independentConstraintGuard,
    selectedParentLayerId,
    setSelectedParentLayerId,
    autoTranscriptionParentLayer,
    showCreateFailure,
    createFailureMessage,
    translationCreateDisabledReason,
    transcriptionCreateDisabledReason,
    hasValidLanguage,
    createLanguageRequiredText,
  } = props;

  const orthographyFieldId = `${fieldIdPrefix}-orthography`;
  const dialectFieldId = `${fieldIdPrefix}-dialect`;
  const vernacularFieldId = `${fieldIdPrefix}-vernacular`;
  const aliasFieldId = `${fieldIdPrefix}-alias`;
  const modalityFieldId = `${fieldIdPrefix}-modality`;
  const translationParentLayerFieldId = `${fieldIdPrefix}-translation-parent-layer`;
  const transcriptionParentLayerFieldId = `${fieldIdPrefix}-transcription-parent-layer`;

  return (
    <>
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
      {(action === 'create-translation' || action === 'create-transcription') && (
        <div className="layer-action-dialog-field-group">
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
          <PanelNote className="layer-action-dialog-meta-note">
            {actionMessages.translationBoundarySource}
          </PanelNote>
          {action === 'create-translation' && independentParentLayers.length > 1 && (
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
            </div>
          )}
          {action === 'create-translation' && autoTranslationHostLayer && (
            <PanelNote className="layer-action-dialog-meta-note layer-action-dialog-auto-linked-hint">
              {actionMessages.autoLinkedParent(
                formatParentLayerOptionLabel(autoTranslationHostLayer),
              )}
            </PanelNote>
          )}
        </div>
      )}
      {action === 'create-transcription' && showConstraintSelector && (
        <div className="layer-action-dialog-field-group">
          <fieldset className="panel-fieldset layer-action-dialog-fieldset">
            <legend className="layer-action-dialog-fieldset-legend">
              {actionMessages.constraintLegend}
            </legend>
            <label className="panel-radio layer-action-dialog-radio-option">
              <input
                type="radio"
                name={`${fieldIdPrefix}-constraint`}
                value="symbolic_association"
                checked={constraint === 'symbolic_association'}
                disabled={!symbolicConstraintGuard.allowed}
                onChange={(e) => setConstraint(e.target.value as LayerConstraint)}
              />
              <span>{actionMessages.dependentConstraint}</span>
            </label>
            <label className="panel-radio layer-action-dialog-radio-option">
              <input
                type="radio"
                name={`${fieldIdPrefix}-constraint`}
                value="independent_boundary"
                checked={constraint === 'independent_boundary'}
                disabled={!independentConstraintGuard.allowed}
                onChange={(e) => setConstraint(e.target.value as LayerConstraint)}
              />
              <span>{actionMessages.independentConstraint}</span>
            </label>
          </fieldset>
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
        </div>
      )}
      {showCreateFailure && (
        <PanelFeedback role="alert" aria-live="assertive" level="error">
          {actionMessages.createFailedPrefix}
          {createFailureMessage}
        </PanelFeedback>
      )}
      {(translationCreateDisabledReason ||
        transcriptionCreateDisabledReason ||
        !hasValidLanguage) && (
        <PanelFeedbackStack>
          {translationCreateDisabledReason && (
            <PanelFeedback level="error">
              {actionMessages.currentRestrictionTranslation}
              {translationCreateDisabledReason}
            </PanelFeedback>
          )}
          {transcriptionCreateDisabledReason && (
            <PanelFeedback level="error">
              {actionMessages.currentRestrictionTranscription}
              {transcriptionCreateDisabledReason}
            </PanelFeedback>
          )}
          {!hasValidLanguage && (
            <PanelFeedback level="info">{createLanguageRequiredText}</PanelFeedback>
          )}
        </PanelFeedbackStack>
      )}
    </>
  );
}
