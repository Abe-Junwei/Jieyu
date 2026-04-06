import React, { useId, useState, useCallback, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { ChevronLeft, Plus, RotateCcw, X } from 'lucide-react';
import type { LayerCreateInput } from '../hooks/transcriptionTypes';
import type { LayerConstraint, LayerDocType } from '../db';
import { LanguageIsoInput, type LanguageIsoInputValue } from './LanguageIsoInput';
import {
  getLayerCreateGuard,
  listIndependentBoundaryTranscriptionLayers,
} from '../services/LayerConstraintService';
import { getLayerLabelParts } from '../utils/transcriptionFormatters';
import { OrthographyBuilderPanel } from './OrthographyBuilderPanel';
import {
  formatOrthographyOptionLabel,
  groupOrthographiesForSelect,
  ORTHOGRAPHY_CREATE_SENTINEL,
  useOrthographyPicker,
} from '../hooks/useOrthographyPicker';
import { useLanguageCatalogLabelMap } from '../hooks/useLanguageCatalogLabelMap';
import { useLocale } from '../i18n';
import { getOrthographyCatalogGroupLabel, getOrthographyBuilderMessages } from '../i18n/orthographyBuilderMessages';
import { getLayerActionPopoverMessages, type LayerActionPopoverMessages } from '../i18n/layerActionPopoverMessages';
import { getOrthographyCatalogBadgeInfo } from './orthographyCatalogUi';
import { computeAdaptivePanelWidth } from '../utils/panelAdaptiveLayout';
import { useUiFontScaleRuntime } from '../hooks/useUiFontScaleRuntime';
import { useViewportWidth } from '../hooks/useViewportWidth';
import { readAnyMultiLangLabel } from '../utils/multiLangLabels';
import { DialogShell } from './ui/DialogShell';
import { PanelSection } from './ui/PanelSection';
import { PanelSummary } from './ui/PanelSummary';
import {
  buildLanguageInputSeed,
  getDisplayedLanguageInputLabel,
  normalizeLanguageInputAssetId,
} from '../utils/languageInputHostState';
import { escapeRegExp } from '../utils/escapeRegExp';

type LayerActionType = 'create-transcription' | 'create-translation' | 'delete';

interface LayerActionPopoverProps {
  action: LayerActionType;
  layerId: string | undefined;
  deletableLayers: LayerDocType[];
  defaultLanguageId?: string;
  defaultOrthographyId?: string;
  layerCreateMessage?: string;
  createLayer: (
    layerType: 'transcription' | 'translation',
    input: LayerCreateInput,
    modality?: 'text' | 'audio' | 'mixed',
  ) => Promise<boolean>;
  deleteLayer: (layerId: string) => Promise<void>;
  deleteLayerWithoutConfirm?: (layerId: string) => Promise<void>;
  checkLayerHasContent?: (layerId: string) => Promise<number>;
  onClose: () => void;
}

function resolveCreateFailureText(
  message: string | undefined,
  fallback: string,
  createFailedPrefix: string,
  createdPrefix: string,
): string {
  const raw = (message ?? '').trim();
  const text = raw.replace(new RegExp(`^${escapeRegExp(createFailedPrefix)}[:：]\\s*`, 'u'), '');
  if (!text) return fallback;
  if (text.startsWith(createdPrefix) || text.startsWith('Created ')) return fallback;
  return text;
}

function getCreateFallbackMessage(action: LayerActionType, messages: LayerActionPopoverMessages): string {
  if (action === 'create-translation') {
    return messages.translationCreateFallback;
  }
  if (action === 'create-transcription') {
    return messages.transcriptionCreateFallback;
  }
  return messages.genericActionFailed;
}

function formatParentLayerOptionLabel(layer: LayerDocType): string {
  const { type, lang, alias } = getLayerLabelParts(layer);
  return alias ? `${type} · ${lang} · ${alias}` : `${type} · ${lang}`;
}

export function LayerActionPopover({
  action,
  layerId,
  deletableLayers,
  defaultLanguageId,
  defaultOrthographyId,
  layerCreateMessage,
  createLayer,
  deleteLayer,
  deleteLayerWithoutConfirm,
  checkLayerHasContent,
  onClose,
}: LayerActionPopoverProps) {
  const locale = useLocale();
  const { uiTextDirection, uiFontScale } = useUiFontScaleRuntime(locale);
  const viewportWidth = useViewportWidth();
  const panelDefaultWidth = useMemo(
    () => computeAdaptivePanelWidth({
      baseWidth: 360,
      locale,
      direction: uiTextDirection,
      uiFontScale,
      density: action === 'delete' ? 'compact' : 'standard',
      minWidth: 300,
      maxWidth: 640,
      ...(viewportWidth !== undefined ? { viewportWidth } : {}),
    }),
    [action, locale, uiFontScale, uiTextDirection, viewportWidth],
  );
  const panelMinWidth = useMemo(() => Math.max(280, Math.round(panelDefaultWidth * 0.78)), [panelDefaultWidth]);
  const dialogAutoWidth = useMemo(
    () => Math.max(320, Math.min(640, panelDefaultWidth)),
    [panelDefaultWidth],
  );
  const actionMessages = getLayerActionPopoverMessages(locale);
  const { languageOptions, resolveLanguageCode, resolveLanguageDisplayName } = useLanguageCatalogLabelMap(locale);
  const defaultLanguageSeed = useMemo(
    () => buildLanguageInputSeed(defaultLanguageId, locale, resolveLanguageDisplayName, resolveLanguageCode),
    [defaultLanguageId, locale, resolveLanguageCode, resolveLanguageDisplayName],
  );
  const normalizedDefaultOrthographyId = useMemo(() => defaultOrthographyId?.trim() ?? '', [defaultOrthographyId]);
  const [languageInput, setLanguageInput] = useState<LanguageIsoInputValue>(defaultLanguageSeed);
  const [orthographyId, setOrthographyId] = useState(normalizedDefaultOrthographyId);
  const [alias, setAlias] = useState('');
  const [modality, setModality] = useState<'text' | 'audio' | 'mixed'>('text');
  const [constraint, setConstraint] = useState<LayerConstraint>('symbolic_association');
  const [selectedParentLayerId, setSelectedParentLayerId] = useState('');
  const [deleteLayerId, setDeleteLayerId] = useState(layerId ?? '');
  const [isLoading, setIsLoading] = useState(false);
  const [createFailureMessage, setCreateFailureMessage] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<{ layerId: string; layerName: string; textCount: number } | null>(null);
  const fieldIdPrefix = useId();
  const pendingDefaultOrthographyIdRef = React.useRef(normalizedDefaultOrthographyId);
  const lastInitializedFormKeyRef = React.useRef<string | null>(null);

  // Sync deleteLayerId when layerId changes
  useEffect(() => {
    if (layerId) setDeleteLayerId(layerId);
  }, [layerId]);

  const independentParentLayers = listIndependentBoundaryTranscriptionLayers(deletableLayers);
  const contextualParentLayerId = useMemo(() => {
    if (!layerId) return '';
    const clickedLayer = deletableLayers.find((layer) => layer.id === layerId);
    if (!clickedLayer) return '';
    if (independentParentLayers.some((layer) => layer.id === clickedLayer.id)) {
      return clickedLayer.id;
    }
    const parentLayerId = clickedLayer.parentLayerId?.trim() ?? '';
    if (parentLayerId && independentParentLayers.some((layer) => layer.id === parentLayerId)) {
      return parentLayerId;
    }
    return '';
  }, [deletableLayers, independentParentLayers, layerId]);
  const formInitializationKey = useMemo(
    () => `${action}::${contextualParentLayerId}::${defaultLanguageId?.trim().toLowerCase() ?? ''}::${normalizedDefaultOrthographyId}`,
    [action, contextualParentLayerId, defaultLanguageId, normalizedDefaultOrthographyId],
  );
  const resolvedLanguageId = useMemo(() => normalizeLanguageInputAssetId(languageInput), [languageInput]);
  const displayedLanguage = useMemo(() => getDisplayedLanguageInputLabel(languageInput), [languageInput]);
  const orthographyPicker = useOrthographyPicker(resolvedLanguageId, orthographyId, setOrthographyId);
  const groupedOrthographyOptions = useMemo(
    () => groupOrthographiesForSelect(orthographyPicker.orthographies),
    [orthographyPicker.orthographies],
  );
  const selectedOrthography = useMemo(
    () => orthographyPicker.orthographies.find((item) => item.id === orthographyId),
    [orthographyId, orthographyPicker.orthographies],
  );
  const selectedOrthographyBadge = useMemo(
    () => (selectedOrthography ? getOrthographyCatalogBadgeInfo(locale, selectedOrthography) : null),
    [locale, selectedOrthography],
  );
  const customLanguageError = '';
  const orthographySelectionError = orthographyId && !orthographyPicker.isCreating && !selectedOrthography
    ? actionMessages.invalidOrthographySelection
    : '';

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
    pendingDefaultOrthographyIdRef.current = normalizedDefaultOrthographyId;
    setLanguageInput(defaultLanguageSeed);
    setOrthographyId(normalizedDefaultOrthographyId);
    setAlias('');
    setModality('text');
  }, [action, contextualParentLayerId, defaultLanguageSeed, formInitializationKey, normalizedDefaultOrthographyId]);

  useEffect(() => {
    const pendingDefaultOrthographyId = pendingDefaultOrthographyIdRef.current.trim();
    if (!pendingDefaultOrthographyId) return;
    if (resolvedLanguageId !== normalizeLanguageInputAssetId(defaultLanguageSeed) || orthographyPicker.isCreating) {
      return;
    }
    if (orthographyId === pendingDefaultOrthographyId) {
      pendingDefaultOrthographyIdRef.current = '';
      return;
    }
    if (orthographyPicker.orthographies.some((orthography) => orthography.id === pendingDefaultOrthographyId)) {
      setOrthographyId(pendingDefaultOrthographyId);
      pendingDefaultOrthographyIdRef.current = '';
      return;
    }
    if (orthographyPicker.orthographies.length > 0) {
      pendingDefaultOrthographyIdRef.current = '';
    }
  }, [
    defaultLanguageSeed.languageAssetId,
    defaultLanguageSeed.languageCode,
    orthographyId,
    orthographyPicker.isCreating,
    orthographyPicker.orthographies,
    resolvedLanguageId,
  ]);

  // Keep refs synchronized with state to avoid stale closures | 保持 ref 与 state 同步，避免闭包过期

  const needsDependentParent = action === 'create-translation'
    || (action === 'create-transcription' && constraint === 'symbolic_association');
  const autoParentLayer = needsDependentParent && independentParentLayers.length === 1
    ? independentParentLayers[0]
    : undefined;
  const resolvedCreateParentLayerId = needsDependentParent
    ? (autoParentLayer?.id ?? selectedParentLayerId)
    : '';

  useEffect(() => {
    if (!needsDependentParent) {
      if (selectedParentLayerId) setSelectedParentLayerId('');
      return;
    }
    if (autoParentLayer) {
      if (selectedParentLayerId !== autoParentLayer.id) {
        setSelectedParentLayerId(autoParentLayer.id);
      }
      return;
    }
    if (selectedParentLayerId && independentParentLayers.some((layer) => layer.id === selectedParentLayerId)) {
      return;
    }
    if (selectedParentLayerId) setSelectedParentLayerId('');
  }, [autoParentLayer, independentParentLayers, needsDependentParent, selectedParentLayerId]);

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
    const existingTranscriptionCount = deletableLayers.filter((layer) => layer.layerType === 'transcription').length;
    const canConfigureTranscriptionConstraint = action === 'create-transcription' && existingTranscriptionCount > 0;
    const resolvedConstraint = action === 'create-translation'
      ? 'symbolic_association'
      : (canConfigureTranscriptionConstraint ? constraint : undefined);
    const createLayerType = action === 'create-transcription' ? 'transcription' : 'translation';
    const hasSupportedParent = independentParentLayers.length > 0;
    const immediateGuard = getLayerCreateGuard(deletableLayers, createLayerType, {
      languageId: resolvedLang,
      alias,
      ...(resolvedConstraint ? { constraint: resolvedConstraint } : {}),
      ...(resolvedCreateParentLayerId ? { parentLayerId: resolvedCreateParentLayerId } : {}),
      hasSupportedParent,
    });
    setCreateFailureMessage('');
    setIsLoading(true);
    try {
      const success = await createLayer(createLayerType, {
        languageId: resolvedLang,
        ...(orthographyId ? { orthographyId } : {}),
        ...(alias.trim() ? { alias: alias.trim() } : {}),
        ...(resolvedConstraint ? { constraint: resolvedConstraint } : {}),
        ...(resolvedCreateParentLayerId ? { parentLayerId: resolvedCreateParentLayerId } : {}),
      }, action === 'create-translation' ? modality : undefined);
      if (success) {
        onClose();
        return;
      }
      setCreateFailureMessage(resolveCreateFailureText(
        immediateGuard.reason ?? layerCreateMessage,
        getCreateFallbackMessage(action, actionMessages),
        actionMessages.createFailedPrefix,
        actionMessages.createdPrefix,
      ));
    } catch (error) {
      setCreateFailureMessage(resolveCreateFailureText(
        error instanceof Error ? error.message : '',
        getCreateFallbackMessage(action, actionMessages),
        actionMessages.createFailedPrefix,
        actionMessages.createdPrefix,
      ));
    } finally {
      setIsLoading(false);
    }
  }, [resolvedLanguageId, customLanguageError, orthographySelectionError, orthographyId, alias, modality, constraint, action, createLayer, deletableLayers, independentParentLayers.length, layerCreateMessage, onClose, resolvedCreateParentLayerId, actionMessages]);

  const handleDelete = useCallback(async () => {
    if (!deleteLayerId) return;
    const layer = deletableLayers.find((l) => l.id === deleteLayerId);
    const layerName = (layer ? readAnyMultiLangLabel(layer.name) : undefined) ?? layer?.key ?? deleteLayerId;

    // Check if layer has content
    const textCount = checkLayerHasContent ? await checkLayerHasContent(deleteLayerId) : 0;

    if (textCount === 0) {
      // No content - delete directly | 无内容 — 直接删除
      setIsLoading(true);
      try {
        await (deleteLayerWithoutConfirm ?? deleteLayer)(deleteLayerId);
        onClose();
      } finally {
        setIsLoading(false);
      }
    } else {
      // Has content - show confirmation
      setDeleteConfirm({ layerId: deleteLayerId, layerName, textCount });
    }
  }, [deleteLayerId, deletableLayers, checkLayerHasContent, deleteLayerWithoutConfirm, deleteLayer, onClose]);

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteConfirm) return;
    setIsLoading(true);
    try {
      await (deleteLayerWithoutConfirm ?? deleteLayer)(deleteConfirm.layerId);
      setDeleteConfirm(null);
      onClose();
    } finally {
      setIsLoading(false);
    }
  }, [deleteConfirm, deleteLayerWithoutConfirm, deleteLayer, onClose]);

  const handleCancelDelete = useCallback(() => {
    setDeleteConfirm(null);
  }, []);

  const handleResetForm = useCallback(() => {
    pendingDefaultOrthographyIdRef.current = normalizedDefaultOrthographyId;
    setLanguageInput(defaultLanguageSeed);
    setOrthographyId(normalizedDefaultOrthographyId);
    setAlias('');
    setModality('text');
    setConstraint('symbolic_association');
    setSelectedParentLayerId(contextualParentLayerId);
    setCreateFailureMessage('');
  }, [contextualParentLayerId, defaultLanguageSeed, normalizedDefaultOrthographyId]);

  const label = action === 'create-transcription'
    ? actionMessages.createTranscriptionLayer
    : action === 'create-translation'
    ? actionMessages.createTranslationLayer
    : actionMessages.deleteLayer;

  const existingTranscriptionCount = deletableLayers.filter((layer) => layer.layerType === 'transcription').length;
  const resolvedLangForGuard = resolvedLanguageId.trim();
  const hasValidLanguage = resolvedLangForGuard.length > 0;
  const showConstraintSelector = action === 'create-transcription' && existingTranscriptionCount > 0;
  const translationGuard = action === 'create-translation'
    ? getLayerCreateGuard(deletableLayers, 'translation', {
      languageId: resolvedLangForGuard,
      alias,
      constraint: 'symbolic_association',
      ...(resolvedCreateParentLayerId ? { parentLayerId: resolvedCreateParentLayerId } : {}),
      hasSupportedParent: independentParentLayers.length > 0,
    })
    : { allowed: true };
  const transcriptionGuard = action === 'create-transcription'
    ? getLayerCreateGuard(deletableLayers, 'transcription', {
      languageId: resolvedLangForGuard,
      alias,
      ...(showConstraintSelector ? { constraint } : {}),
      ...(resolvedCreateParentLayerId ? { parentLayerId: resolvedCreateParentLayerId } : {}),
      hasSupportedParent: independentParentLayers.length > 0,
    })
    : { allowed: true };
  const translationCreateDisabledReason = action === 'create-translation'
    ? (translationGuard.allowed ? '' : (translationGuard.reasonShort ?? actionMessages.translationCreateUnavailable))
    : '';
  const transcriptionCreateDisabledReason = action === 'create-transcription'
    ? (transcriptionGuard.allowed ? '' : (transcriptionGuard.reasonShort ?? actionMessages.transcriptionCreateUnavailable))
    : '';
  const createGuardByConstraint = (candidate: LayerConstraint) => {
    if (action === 'delete') return { allowed: true };
    const optionParentLayerId = candidate === 'independent_boundary'
      ? undefined
      : (resolvedCreateParentLayerId || independentParentLayers[0]?.id);
    return getLayerCreateGuard(
      deletableLayers,
      action === 'create-transcription' ? 'transcription' : 'translation',
      {
        languageId: resolvedLangForGuard,
        alias,
        constraint: candidate,
        ...(optionParentLayerId ? { parentLayerId: optionParentLayerId } : {}),
        hasSupportedParent: independentParentLayers.length > 0,
      },
    );
  };
  const symbolicConstraintGuard = createGuardByConstraint('symbolic_association');
  const independentConstraintGuard = createGuardByConstraint('independent_boundary');
  const showCreateFailure = action !== 'delete' && createFailureMessage.trim().length > 0;
  const createLanguageRequiredMessage = action === 'create-translation'
    ? actionMessages.translationLanguageRequired
    : actionMessages.transcriptionLanguageRequired;
  const createLanguageRequiredText = createLanguageRequiredMessage.startsWith(actionMessages.requiredPrefix)
    ? createLanguageRequiredMessage
    : `${actionMessages.requiredPrefix}${createLanguageRequiredMessage}`;
  const summaryMeta = (
    <div className="panel-meta">
      <span className="panel-chip">{actionMessages.deleteLayer}</span>
      <span className="panel-chip panel-chip--danger">{deletableLayers.length}</span>
    </div>
  );
  const createFooter = (
    <button
      className="panel-button panel-button--primary"
      disabled={action === 'create-translation'
        ? (isLoading || orthographyPicker.submitting || orthographyPicker.isCreating || !hasValidLanguage || Boolean(customLanguageError) || Boolean(orthographySelectionError) || translationCreateDisabledReason.length > 0)
        : (isLoading || orthographyPicker.submitting || orthographyPicker.isCreating || !hasValidLanguage || Boolean(customLanguageError) || Boolean(orthographySelectionError) || transcriptionCreateDisabledReason.length > 0)}
      onClick={handleCreate}
    >
      {label}
    </button>
  );
  /* 面包屑标题 + 构建器专属 footer | Breadcrumb title + builder-specific footer */
  const builderMessages = getOrthographyBuilderMessages(locale);
  const builderBreadcrumbTitle = (
    <span className="dialog-breadcrumb-title">
      <button type="button" className="dialog-breadcrumb-back" onClick={orthographyPicker.cancelCreate} aria-label={label}>
        <ChevronLeft size={16} />
        <span>{label}</span>
      </button>
      <span className="dialog-breadcrumb-separator">/</span>
      <span className="dialog-breadcrumb-current">{builderMessages.panelTitle}</span>
    </span>
  );
  const builderFooter = (
    <>
      <button
        type="button"
        className="panel-button panel-button--ghost"
        disabled={orthographyPicker.submitting}
        onClick={orthographyPicker.cancelCreate}
      >
        {builderMessages.cancelCreate}
      </button>
      <button
        type="button"
        className="panel-button panel-button--primary"
        disabled={orthographyPicker.submitting}
        onClick={() => { void orthographyPicker.createOrthography(); }}
      >
        {orthographyPicker.submitting
          ? builderMessages.creating
          : orthographyPicker.requiresRenderWarningConfirmation
            ? builderMessages.confirmRiskAndCreate
            : builderMessages.createAndSelect}
      </button>
    </>
  );
  const deleteFooter = (
    <>
      <button className="panel-button panel-button--ghost" onClick={deleteConfirm ? handleCancelDelete : onClose} disabled={isLoading}>
        {actionMessages.cancel}
      </button>
      <button
        className="panel-button panel-button--danger"
        disabled={deleteConfirm ? isLoading : (!deleteLayerId || isLoading)}
        onClick={deleteConfirm ? handleConfirmDelete : handleDelete}
      >
        {deleteConfirm ? actionMessages.confirmDelete : actionMessages.deleteAction}
      </button>
    </>
  );
  const orthographyFieldId = `${fieldIdPrefix}-orthography`;
  const aliasFieldId = `${fieldIdPrefix}-alias`;
  const modalityFieldId = `${fieldIdPrefix}-modality`;
  const translationParentLayerFieldId = `${fieldIdPrefix}-translation-parent-layer`;
  const transcriptionParentLayerFieldId = `${fieldIdPrefix}-transcription-parent-layer`;
  const deleteLayerFieldId = `${fieldIdPrefix}-delete-layer`;

  const popover = (
    <div
      className="dialog-overlay dialog-overlay-topmost"
      role="presentation"
      onMouseDown={onClose}
    >
      <DialogShell
        className={`layer-action-dialog${orthographyPicker.isCreating ? ' orthography-builder-dialog-host' : ''}`}
        style={{ '--dialog-auto-width': orthographyPicker.isCreating ? '404px' : `${Math.max(panelMinWidth, dialogAutoWidth)}px` } as React.CSSProperties}
        bodyClassName="layer-action-dialog-body"
        title={orthographyPicker.isCreating ? builderBreadcrumbTitle : label}
        headerClassName="layer-action-dialog-header"
        actions={(
          <>
            {action !== 'delete' && !orthographyPicker.isCreating && (
              <button
                type="button"
                className="icon-btn"
                onClick={handleResetForm}
                aria-label={actionMessages.resetForm}
                title={actionMessages.resetForm}
              >
                <RotateCcw size={15} />
              </button>
            )}
            <button
              type="button"
              className="icon-btn"
              onClick={onClose}
              aria-label={`${label} ${actionMessages.cancel}`}
              title={`${label} ${actionMessages.cancel}`}
            >
              <X size={18} />
            </button>
          </>
        )}
        footer={action === 'delete' ? deleteFooter : orthographyPicker.isCreating ? builderFooter : createFooter}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        dir={uiTextDirection}
      >
        {action === 'delete' ? (
          <>
            <PanelSummary
              className="layer-action-dialog-summary"
              description={deleteConfirm
                ? actionMessages.deleteLayerConfirmMessage(deleteConfirm.layerName, deleteConfirm.textCount)
                : actionMessages.deleteLayer}
              meta={summaryMeta}
            />
            <PanelSection className="layer-action-dialog-section">
              {deleteConfirm ? (
                <p className="layer-action-dialog-copy">
                  {actionMessages.deleteLayerConfirmMessage(deleteConfirm.layerName, deleteConfirm.textCount)}
                </p>
              ) : (
                <div className="dialog-field">
                  <label className="layer-action-dialog-field-label" htmlFor={deleteLayerFieldId}>{actionMessages.deleteLayer}</label>
                  <select
                    id={deleteLayerFieldId}
                    className="input panel-input layer-action-dialog-input"
                    value={deleteLayerId}
                    onChange={(e) => setDeleteLayerId(e.target.value)}
                  >
                    {deletableLayers.map((l) => (
                      <option key={l.id} value={l.id}>
                        {readAnyMultiLangLabel(l.name) ?? l.key}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </PanelSection>
          </>
        ) : orthographyPicker.isCreating ? (
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
              actionMessages.orthographyContextLayerType(action === 'create-translation' ? actionMessages.translationLayerType : actionMessages.transcriptionLayerType),
            ]}
          />
        ) : (
          <>
            <div className="dialog-field">
              <LanguageIsoInput
                locale={locale}
                value={languageInput}
                onChange={setLanguageInput}
                resolveLanguageDisplayName={resolveLanguageDisplayName}
                nameLabel={actionMessages.languageNameLabel}
                codeLabel={actionMessages.languageCodeLabel}
                namePlaceholder={actionMessages.selectLanguage}
                codePlaceholder={actionMessages.customLanguageCodePlaceholder}
                error={customLanguageError}
                disabled={isLoading || orthographyPicker.submitting}
              />
            </div>
            <div className="dialog-field">
              <label className="layer-action-dialog-field-label" htmlFor={`${fieldIdPrefix}-language-asset-id`}>{actionMessages.languageAssetIdLabel}</label>
              <input
                id={`${fieldIdPrefix}-language-asset-id`}
                className="input panel-input layer-action-dialog-input"
                type="text"
                value={languageInput.languageAssetId ?? ''}
                onChange={(event) => setLanguageInput((prev) => ({
                  ...prev,
                  languageAssetId: event.target.value.trim().toLowerCase(),
                }))}
                placeholder={actionMessages.languageAssetIdPlaceholder}
                disabled={isLoading || orthographyPicker.submitting}
              />
            </div>
            {resolvedLanguageId && (
              <div className="layer-action-dialog-field-group">
                <div className="dialog-field">
                  <label className="layer-action-dialog-field-label" htmlFor={orthographyFieldId}>{actionMessages.orthographyFieldLabel}</label>
                  <div className="layer-action-dialog-select-with-btn">
                    <select
                      id={orthographyFieldId}
                      className="input panel-input layer-action-dialog-input"
                      value={orthographyId}
                      onChange={(e) => orthographyPicker.handleSelectionChange(e.target.value)}
                    >
                      {orthographyPicker.orthographies.length === 0 && <option value="">{actionMessages.useDefaultScript}</option>}
                      {groupedOrthographyOptions.map((group) => (
                        <optgroup key={group.key} label={getOrthographyCatalogGroupLabel(locale, group.key)}>
                          {group.orthographies.map((orthography) => (
                            <option key={orthography.id} value={orthography.id}>
                              {formatOrthographyOptionLabel(orthography, locale)}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="panel-button panel-button--ghost layer-action-dialog-inline-btn"
                      onClick={() => orthographyPicker.handleSelectionChange(ORTHOGRAPHY_CREATE_SENTINEL)}
                      title={actionMessages.createOrthography}
                    >
                      <Plus size={14} />
                      <span>{actionMessages.newOrthographyButton}</span>
                    </button>
                  </div>
                </div>
                {orthographyPicker.orthographies.length === 0 && (
                  <p className="panel-note layer-action-dialog-meta-note">
                    {actionMessages.orthographyHint}
                  </p>
                )}
                {selectedOrthography && selectedOrthographyBadge && (
                  <div className="panel-note layer-action-dialog-meta-note" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span>{formatOrthographyOptionLabel(selectedOrthography, locale)}</span>
                    <span className={selectedOrthographyBadge.className}>{selectedOrthographyBadge.label}</span>
                  </div>
                )}
                {orthographyPicker.error && (
                  <p className="panel-feedback panel-feedback--error">{orthographyPicker.error}</p>
                )}
                {orthographySelectionError && (
                  <p className="panel-feedback panel-feedback--error">{orthographySelectionError}</p>
                )}
              </div>
            )}
            <div className="dialog-field">
              <label className="layer-action-dialog-field-label" htmlFor={aliasFieldId}>{actionMessages.aliasShortPlaceholder}</label>
              <input
                id={aliasFieldId}
                className="input panel-input layer-action-dialog-input"
                placeholder={actionMessages.aliasShortPlaceholder}
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
              />
              <p className="layer-action-dialog-alias-hint">{actionMessages.aliasHint}</p>
            </div>
            {action === 'create-translation' && (
              <div className="layer-action-dialog-field-group">
                <div className="dialog-field">
                  <label className="layer-action-dialog-field-label" htmlFor={modalityFieldId}>{actionMessages.modalityLabel}</label>
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
                </div>
                <p className="panel-note layer-action-dialog-meta-note">
                  {actionMessages.translationBoundarySource}
                </p>
                {independentParentLayers.length > 1 && (
                  <div className="dialog-field">
                    <label className="layer-action-dialog-field-label" htmlFor={translationParentLayerFieldId}>{actionMessages.selectParentLayer}</label>
                    <select
                      id={translationParentLayerFieldId}
                      className="input panel-input layer-action-dialog-input"
                      value={selectedParentLayerId}
                      onChange={(e) => setSelectedParentLayerId(e.target.value)}
                    >
                      <option value="">{actionMessages.selectParentLayer}</option>
                      {independentParentLayers.map((layer) => (
                        <option key={layer.id} value={layer.id}>{formatParentLayerOptionLabel(layer)}</option>
                      ))}
                    </select>
                  </div>
                )}
                {autoParentLayer && (
                  <p className="panel-note layer-action-dialog-meta-note layer-action-dialog-auto-linked-hint">
                    {actionMessages.autoLinkedParent(formatParentLayerOptionLabel(autoParentLayer))}
                  </p>
                )}
              </div>
            )}
            {action === 'create-transcription' && showConstraintSelector && (
              <div className="layer-action-dialog-field-group">
                <fieldset className="panel-fieldset layer-action-dialog-fieldset">
                  <legend className="layer-action-dialog-fieldset-legend">{actionMessages.constraintLegend}</legend>
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
                  <div className="dialog-field">
                    <label className="layer-action-dialog-field-label" htmlFor={transcriptionParentLayerFieldId}>{actionMessages.selectParentLayer}</label>
                    <select
                      id={transcriptionParentLayerFieldId}
                      className="input panel-input layer-action-dialog-input"
                      value={selectedParentLayerId}
                      onChange={(e) => setSelectedParentLayerId(e.target.value)}
                    >
                      <option value="">{actionMessages.selectParentLayer}</option>
                      {independentParentLayers.map((layer) => (
                        <option key={layer.id} value={layer.id}>{formatParentLayerOptionLabel(layer)}</option>
                      ))}
                    </select>
                  </div>
                )}
                {constraint === 'symbolic_association' && autoParentLayer && (
                  <p className="panel-note layer-action-dialog-meta-note layer-action-dialog-auto-linked-hint">
                    {actionMessages.autoLinkedParent(formatParentLayerOptionLabel(autoParentLayer))}
                  </p>
                )}
              </div>
            )}
            {showCreateFailure && (
              <div
                role="alert"
                aria-live="assertive"
                className="panel-feedback panel-feedback--error"
              >
                {actionMessages.createFailedPrefix}{createFailureMessage}
              </div>
            )}
            {(translationCreateDisabledReason || transcriptionCreateDisabledReason || !hasValidLanguage) && (
              <div className="panel-feedback-stack">
                {translationCreateDisabledReason && (
                  <p className="panel-feedback panel-feedback--error">
                    {actionMessages.currentRestrictionTranslation}{translationCreateDisabledReason}
                  </p>
                )}
                {transcriptionCreateDisabledReason && (
                  <p className="panel-feedback panel-feedback--error">
                    {actionMessages.currentRestrictionTranscription}{transcriptionCreateDisabledReason}
                  </p>
                )}
                {!hasValidLanguage && (
                  <p className="panel-feedback panel-feedback--info">
                    {createLanguageRequiredText}
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </DialogShell>
      </div>
  );

  return ReactDOM.createPortal(popover, document.body);
}
