import React, { useId, useState, useCallback, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { RotateCcw, X } from 'lucide-react';
import type { LayerCreateInput } from '../hooks/transcriptionTypes';
import type { LayerConstraint, LayerDocType } from '../db';
import { LanguageIsoInput, type LanguageIsoInputValue } from './LanguageIsoInput';
import {
  getLayerCreateGuard,
  listIndependentBoundaryTranscriptionLayers,
} from '../services/LayerConstraintService';
import { COMMON_LANGUAGES, getLayerLabelParts } from '../utils/transcriptionFormatters';
import { OrthographyBuilderPanel } from './OrthographyBuilderPanel';
import {
  formatOrthographyOptionLabel,
  groupOrthographiesForSelect,
  ORTHOGRAPHY_CREATE_SENTINEL,
  useOrthographyPicker,
} from '../hooks/useOrthographyPicker';
import { useLocale } from '../i18n';
import { getOrthographyCatalogGroupLabel } from '../i18n/orthographyBuilderMessages';
import { getLayerManagerPopoverMessages } from '../i18n/layerManagerPopoverMessages';
import { getOrthographyCatalogBadgeInfo } from './orthographyCatalogUi';
import { computeAdaptivePanelWidth } from '../utils/panelAdaptiveLayout';
import { useUiFontScaleRuntime } from '../hooks/useUiFontScaleRuntime';
import { useViewportWidth } from '../hooks/useViewportWidth';
import { readAnyMultiLangLabel } from '../utils/multiLangLabels';
import { DialogShell } from './ui/DialogShell';
import { PanelSection } from './ui/PanelSection';
import { PanelSummary } from './ui/PanelSummary';
import { getLanguageDisplayName, isKnownIso639_3Code } from '../utils/langMapping';

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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

type LayerActionPopoverUiText = {
  createTranscription: string;
  createTranslation: string;
  deleteLayer: string;
  createFailedPrefix: string;
  genericActionFailed: string;
  createdPrefix: string;
  confirmDelete: string;
  cancel: string;
  delete: string;
  create: string;
  selectLanguage: string;
  otherManualInput: string;
  customLanguageCodePlaceholder: string;
  useDefaultScript: string;
  createOrthography: string;
  orthographyHint: string;
  sourceLanguagePlaceholder: string;
  sourceLanguageCodeLabel: string;
  sourceLanguageCodePlaceholder: string;
  aliasPlaceholder: string;
  translationText: string;
  translationAudio: string;
  translationMixed: string;
  translationBoundaryHint: string;
  selectParentLayer: string;
  autoLinkedParent: (label: string) => string;
  constraintLegend: string;
  constraintDependent: string;
  constraintIndependent: string;
  currentRestrictionTranslation: string;
  currentRestrictionTranscription: string;
  requiredPrefix: string;
  deleteConfirmMessage: (layerName: string, textCount: number) => string;
  createTranslationFallback: string;
  createTranscriptionFallback: string;
  translationLanguageRequired: string;
  transcriptionLanguageRequired: string;
  translationCreateUnavailable: string;
  transcriptionCreateUnavailable: string;
  resetForm: string;
};

function getCreateFallbackMessage(action: LayerActionType, uiText: LayerActionPopoverUiText): string {
  if (action === 'create-translation') {
    return uiText.createTranslationFallback;
  }
  if (action === 'create-transcription') {
    return uiText.createTranscriptionFallback;
  }
  return uiText.genericActionFailed;
}

function formatParentLayerOptionLabel(layer: LayerDocType): string {
  const { type, lang, alias } = getLayerLabelParts(layer);
  return alias ? `${type} · ${lang} · ${alias}` : `${type} · ${lang}`;
}

function resolveLanguageSeed(defaultLanguageId?: string): {
  languageName: string;
  languageCode: string;
} {
  const normalized = defaultLanguageId?.trim().toLowerCase() ?? '';
  if (!normalized) {
    return { languageName: '', languageCode: '' };
  }
  return {
    languageName: getLanguageDisplayName(normalized),
    languageCode: normalized,
  };
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
  const managerMessages = getLayerManagerPopoverMessages(locale);
  const uiText = useMemo<LayerActionPopoverUiText>(() => ({
    createTranscription: managerMessages.createTranscriptionLayer,
    createTranslation: managerMessages.createTranslationLayer,
    deleteLayer: managerMessages.deleteLayer,
    createFailedPrefix: managerMessages.createFailedPrefix,
    genericActionFailed: managerMessages.genericActionFailed,
    createdPrefix: managerMessages.createdPrefix,
    confirmDelete: managerMessages.confirmDelete,
    cancel: managerMessages.cancel,
    delete: managerMessages.deleteAction,
    create: managerMessages.create,
    selectLanguage: managerMessages.selectLanguage,
    otherManualInput: managerMessages.customLanguageOption,
    customLanguageCodePlaceholder: managerMessages.customLanguageCodePlaceholder,
    useDefaultScript: managerMessages.useDefaultScript,
    createOrthography: managerMessages.createOrthography,
    orthographyHint: managerMessages.orthographyHint,
    sourceLanguagePlaceholder: managerMessages.sourceLanguagePlaceholder,
    sourceLanguageCodeLabel: managerMessages.sourceLanguageCodeLabel,
    sourceLanguageCodePlaceholder: managerMessages.sourceLanguageCodePlaceholder,
    aliasPlaceholder: managerMessages.aliasShortPlaceholder,
    translationText: managerMessages.modalityText,
    translationAudio: managerMessages.modalityAudio,
    translationMixed: managerMessages.modalityMixed,
    translationBoundaryHint: managerMessages.translationBoundarySource,
    selectParentLayer: managerMessages.selectParentLayer,
    autoLinkedParent: managerMessages.autoLinkedParent,
    constraintLegend: managerMessages.constraintLegend,
    constraintDependent: managerMessages.dependentConstraint,
    constraintIndependent: managerMessages.independentConstraint,
    currentRestrictionTranslation: managerMessages.currentRestrictionTranslation,
    currentRestrictionTranscription: managerMessages.currentRestrictionTranscription,
    requiredPrefix: managerMessages.requiredPrefix,
    deleteConfirmMessage: managerMessages.deleteLayerConfirmMessage,
    createTranslationFallback: managerMessages.translationCreateFallback,
    createTranscriptionFallback: managerMessages.transcriptionCreateFallback,
    translationLanguageRequired: managerMessages.translationLanguageRequired,
    transcriptionLanguageRequired: managerMessages.transcriptionLanguageRequired,
    translationCreateUnavailable: managerMessages.translationCreateUnavailable,
    transcriptionCreateUnavailable: managerMessages.transcriptionCreateUnavailable,
    resetForm: managerMessages.resetForm,
  }), [managerMessages]);
  const defaultLanguageSeed = useMemo(() => resolveLanguageSeed(defaultLanguageId), [defaultLanguageId]);
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
  const resolvedLanguageId = useMemo(
    () => languageInput.languageCode.trim().toLowerCase(),
    [languageInput.languageCode],
  );
  const displayedLanguage = useMemo(
    () => languageInput.languageName.trim() || resolvedLanguageId.toUpperCase(),
    [languageInput.languageName, resolvedLanguageId],
  );
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
  const customLanguageError = resolvedLanguageId && !isKnownIso639_3Code(resolvedLanguageId)
    ? managerMessages.invalidLanguageCode
    : '';
  const orthographySelectionError = orthographyId && !orthographyPicker.isCreating && !selectedOrthography
    ? managerMessages.invalidOrthographySelection
    : '';

  useEffect(() => {
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
  }, [action, contextualParentLayerId, defaultLanguageSeed, normalizedDefaultOrthographyId]);

  useEffect(() => {
    const pendingDefaultOrthographyId = pendingDefaultOrthographyIdRef.current.trim();
    if (!pendingDefaultOrthographyId) return;
    if (resolvedLanguageId !== defaultLanguageSeed.languageCode || orthographyPicker.isCreating) {
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
        getCreateFallbackMessage(action, uiText),
        uiText.createFailedPrefix,
        uiText.createdPrefix,
      ));
    } catch (error) {
      setCreateFailureMessage(resolveCreateFailureText(
        error instanceof Error ? error.message : '',
        getCreateFallbackMessage(action, uiText),
        uiText.createFailedPrefix,
        uiText.createdPrefix,
      ));
    } finally {
      setIsLoading(false);
    }
  }, [resolvedLanguageId, customLanguageError, orthographySelectionError, orthographyId, alias, modality, constraint, action, createLayer, deletableLayers, independentParentLayers.length, layerCreateMessage, onClose, resolvedCreateParentLayerId, uiText]);

  const handleDelete = useCallback(async () => {
    if (!deleteLayerId) return;
    const layer = deletableLayers.find((l) => l.id === deleteLayerId);
    const layerName = (layer ? readAnyMultiLangLabel(layer.name) : undefined) ?? layer?.key ?? deleteLayerId;

    // Check if layer has content
    const textCount = checkLayerHasContent ? await checkLayerHasContent(deleteLayerId) : 0;

    if (textCount === 0) {
      // No content - delete directly
      setIsLoading(true);
      await (deleteLayerWithoutConfirm ?? deleteLayer)(deleteLayerId);
      setIsLoading(false);
      onClose();
    } else {
      // Has content - show confirmation
      setDeleteConfirm({ layerId: deleteLayerId, layerName, textCount });
    }
  }, [deleteLayerId, deletableLayers, checkLayerHasContent, deleteLayerWithoutConfirm, deleteLayer, onClose]);

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteConfirm) return;
    setIsLoading(true);
    await (deleteLayerWithoutConfirm ?? deleteLayer)(deleteConfirm.layerId);
    setIsLoading(false);
    setDeleteConfirm(null);
    onClose();
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

  const handleOpenOrthographyWorkspace = useCallback((createdOrthographyId: string) => {
    const params = new URLSearchParams();
    params.set('orthographyId', createdOrthographyId);
    onClose();
    window.location.assign(`/lexicon/orthographies?${params.toString()}`);
  }, [onClose]);

  const label = action === 'create-transcription'
    ? uiText.createTranscription
    : action === 'create-translation'
    ? uiText.createTranslation
    : uiText.deleteLayer;

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
    ? (translationGuard.allowed ? '' : (translationGuard.reasonShort ?? uiText.translationCreateUnavailable))
    : '';
  const transcriptionCreateDisabledReason = action === 'create-transcription'
    ? (transcriptionGuard.allowed ? '' : (transcriptionGuard.reasonShort ?? uiText.transcriptionCreateUnavailable))
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
    ? uiText.translationLanguageRequired
    : uiText.transcriptionLanguageRequired;
  const createLanguageRequiredText = createLanguageRequiredMessage.startsWith(uiText.requiredPrefix)
    ? createLanguageRequiredMessage
    : `${uiText.requiredPrefix}${createLanguageRequiredMessage}`;
  const summaryMeta = (
    <div className="panel-meta">
      <span className="panel-chip">{uiText.deleteLayer}</span>
      <span className="panel-chip panel-chip--danger">{deletableLayers.length}</span>
    </div>
  );
  const createFooter = (
    <>
      <button className="panel-button panel-button--ghost" onClick={onClose}>
        {uiText.cancel}
      </button>
      <button
        className="panel-button panel-button--primary"
        disabled={action === 'create-translation'
          ? (isLoading || orthographyPicker.submitting || orthographyPicker.isCreating || !hasValidLanguage || Boolean(customLanguageError) || Boolean(orthographySelectionError) || translationCreateDisabledReason.length > 0)
          : (isLoading || orthographyPicker.submitting || orthographyPicker.isCreating || !hasValidLanguage || Boolean(customLanguageError) || Boolean(orthographySelectionError) || transcriptionCreateDisabledReason.length > 0)}
        onClick={handleCreate}
      >
        {uiText.create}
      </button>
    </>
  );
  const deleteFooter = (
    <>
      <button className="panel-button panel-button--ghost" onClick={deleteConfirm ? handleCancelDelete : onClose} disabled={isLoading}>
        {uiText.cancel}
      </button>
      <button
        className="panel-button panel-button--danger"
        disabled={deleteConfirm ? isLoading : (!deleteLayerId || isLoading)}
        onClick={deleteConfirm ? handleConfirmDelete : handleDelete}
      >
        {deleteConfirm ? uiText.confirmDelete : uiText.delete}
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
        className="layer-action-dialog"
        style={{ '--dialog-auto-width': `${Math.max(panelMinWidth, dialogAutoWidth)}px` } as React.CSSProperties}
        bodyClassName="layer-action-dialog-body"
        footerClassName="layer-action-dialog-footer"
        title={label}
        headerClassName="layer-action-dialog-header"
        actions={(
          <>
            {action !== 'delete' && (
              <button
                type="button"
                className="icon-btn"
                onClick={handleResetForm}
                aria-label={uiText.resetForm}
                title={uiText.resetForm}
              >
                <RotateCcw size={15} />
              </button>
            )}
            <button
              type="button"
              className="icon-btn"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={onClose}
              aria-label={`${label} ${uiText.cancel}`}
              title={`${label} ${uiText.cancel}`}
            >
              <X size={18} />
            </button>
          </>
        )}
        footer={action === 'delete' ? deleteFooter : createFooter}
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
                ? uiText.deleteConfirmMessage(deleteConfirm.layerName, deleteConfirm.textCount)
                : uiText.deleteLayer}
              meta={summaryMeta}
            />
            <PanelSection className="layer-action-dialog-section">
              {deleteConfirm ? (
                <p className="layer-action-dialog-copy">
                  {uiText.deleteConfirmMessage(deleteConfirm.layerName, deleteConfirm.textCount)}
                </p>
              ) : (
                <div className="dialog-field">
                  <label className="layer-action-dialog-field-label" htmlFor={deleteLayerFieldId}>{uiText.deleteLayer}</label>
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
        ) : (
          <>
            <div className="dialog-field">
              <label className="layer-action-dialog-field-label">{uiText.selectLanguage}</label>
              <LanguageIsoInput
                locale={locale}
                value={languageInput}
                onChange={setLanguageInput}
                nameLabel={uiText.selectLanguage}
                codeLabel={uiText.sourceLanguageCodeLabel}
                namePlaceholder={uiText.selectLanguage}
                codePlaceholder={uiText.customLanguageCodePlaceholder}
                error={customLanguageError}
                disabled={isLoading || orthographyPicker.submitting}
              />
            </div>
            {customLanguageError && (
              <p className="layer-action-dialog-feedback layer-action-dialog-feedback-error">
                {customLanguageError}
              </p>
            )}
            {resolvedLanguageId && (
              <div className="layer-action-dialog-field-group">
                <div className="dialog-field">
                  <label className="layer-action-dialog-field-label" htmlFor={orthographyFieldId}>{uiText.createOrthography.replace(/^\+\s*/, '')}</label>
                  <select
                    id={orthographyFieldId}
                    className="input panel-input layer-action-dialog-input"
                    value={orthographyPicker.isCreating ? ORTHOGRAPHY_CREATE_SENTINEL : orthographyId}
                    onChange={(e) => orthographyPicker.handleSelectionChange(e.target.value)}
                  >
                    {orthographyPicker.orthographies.length === 0 && <option value="">{uiText.useDefaultScript}</option>}
                      {groupedOrthographyOptions.map((group) => (
                        <optgroup key={group.key} label={getOrthographyCatalogGroupLabel(locale, group.key)}>
                          {group.orthographies.map((orthography) => (
                            <option key={orthography.id} value={orthography.id}>
                              {formatOrthographyOptionLabel(orthography, locale)}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    <option value={ORTHOGRAPHY_CREATE_SENTINEL}>{uiText.createOrthography}</option>
                  </select>
                </div>
                {orthographyPicker.orthographies.length === 0 && !orthographyPicker.isCreating && (
                  <p className="panel-note layer-action-dialog-meta-note">
                    {uiText.orthographyHint}
                  </p>
                )}
                {!orthographyPicker.isCreating && selectedOrthography && selectedOrthographyBadge && (
                  <div className="panel-note layer-action-dialog-meta-note" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span>{formatOrthographyOptionLabel(selectedOrthography, locale)}</span>
                    <span className={selectedOrthographyBadge.className}>{selectedOrthographyBadge.label}</span>
                  </div>
                )}
                {orthographyPicker.isCreating && (
                  <OrthographyBuilderPanel
                    picker={orthographyPicker}
                    languageOptions={COMMON_LANGUAGES}
                    compact
                    sourceLanguagePlaceholder={uiText.sourceLanguagePlaceholder}
                    sourceLanguageCodePlaceholder={uiText.sourceLanguageCodePlaceholder}
                    contextLines={[
                      label,
                      managerMessages.orthographyContextTargetLanguage(displayedLanguage),
                      managerMessages.orthographyContextLayerType(action === 'create-translation' ? managerMessages.translationLayerType : managerMessages.transcriptionLayerType),
                    ]}
                    onOpenWorkspace={handleOpenOrthographyWorkspace}
                  />
                )}
                {!orthographyPicker.isCreating && orthographyPicker.error && (
                  <p className="layer-create-feedback layer-create-feedback-error">{orthographyPicker.error}</p>
                )}
                {!orthographyPicker.isCreating && orthographySelectionError && (
                  <p className="layer-create-feedback layer-create-feedback-error">{orthographySelectionError}</p>
                )}
              </div>
            )}
            <div className="dialog-field">
              <label className="layer-action-dialog-field-label" htmlFor={aliasFieldId}>{uiText.aliasPlaceholder}</label>
              <input
                id={aliasFieldId}
                className="input panel-input layer-action-dialog-input"
                placeholder={uiText.aliasPlaceholder}
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
              />
            </div>
            {action === 'create-translation' && (
              <div className="layer-action-dialog-field-group">
                <div className="dialog-field">
                  <label className="layer-action-dialog-field-label" htmlFor={modalityFieldId}>{uiText.translationText.replace(/\s*\(.*\)$|\s*（.*）$/, '')}</label>
                  <select
                    id={modalityFieldId}
                    className="input panel-input layer-action-dialog-input"
                    value={modality}
                    onChange={(e) => setModality(e.target.value as 'text' | 'audio' | 'mixed')}
                  >
                    <option value="text">{uiText.translationText}</option>
                    <option value="audio">{uiText.translationAudio}</option>
                    <option value="mixed">{uiText.translationMixed}</option>
                  </select>
                </div>
                <p className="panel-note layer-action-dialog-meta-note">
                  {uiText.translationBoundaryHint}
                </p>
                {independentParentLayers.length > 1 && (
                  <div className="dialog-field">
                    <label className="layer-action-dialog-field-label" htmlFor={translationParentLayerFieldId}>{uiText.selectParentLayer}</label>
                    <select
                      id={translationParentLayerFieldId}
                      className="input panel-input layer-action-dialog-input layer-parent-select"
                      value={selectedParentLayerId}
                      onChange={(e) => setSelectedParentLayerId(e.target.value)}
                    >
                      <option value="">{uiText.selectParentLayer}</option>
                      {independentParentLayers.map((layer) => (
                        <option key={layer.id} value={layer.id}>{formatParentLayerOptionLabel(layer)}</option>
                      ))}
                    </select>
                  </div>
                )}
                {autoParentLayer && (
                  <p className="panel-note layer-action-dialog-meta-note">
                    {uiText.autoLinkedParent(formatParentLayerOptionLabel(autoParentLayer))}
                  </p>
                )}
              </div>
            )}
            {action === 'create-transcription' && showConstraintSelector && (
              <div className="layer-action-dialog-field-group">
                <fieldset className="panel-fieldset layer-action-dialog-fieldset">
                  <legend className="layer-action-dialog-fieldset-legend">{uiText.constraintLegend}</legend>
                  <label className="panel-radio layer-action-dialog-radio-option layer-action-dialog-radio-option-block">
                    <input
                      type="radio"
                      name={`${fieldIdPrefix}-constraint`}
                      value="symbolic_association"
                      checked={constraint === 'symbolic_association'}
                      disabled={!symbolicConstraintGuard.allowed}
                      onChange={(e) => setConstraint(e.target.value as LayerConstraint)}
                    />
                    <span>{uiText.constraintDependent}</span>
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
                    <span>{uiText.constraintIndependent}</span>
                  </label>
                </fieldset>
                {constraint === 'symbolic_association' && independentParentLayers.length > 1 && (
                  <div className="dialog-field">
                    <label className="layer-action-dialog-field-label" htmlFor={transcriptionParentLayerFieldId}>{uiText.selectParentLayer}</label>
                    <select
                      id={transcriptionParentLayerFieldId}
                      className="input panel-input layer-action-dialog-input layer-parent-select"
                      value={selectedParentLayerId}
                      onChange={(e) => setSelectedParentLayerId(e.target.value)}
                    >
                      <option value="">{uiText.selectParentLayer}</option>
                      {independentParentLayers.map((layer) => (
                        <option key={layer.id} value={layer.id}>{formatParentLayerOptionLabel(layer)}</option>
                      ))}
                    </select>
                  </div>
                )}
                {constraint === 'symbolic_association' && autoParentLayer && (
                  <p className="panel-note layer-action-dialog-meta-note">
                    {uiText.autoLinkedParent(formatParentLayerOptionLabel(autoParentLayer))}
                  </p>
                )}
              </div>
            )}
            {showCreateFailure && (
              <div
                role="alert"
                aria-live="assertive"
                className="layer-action-dialog-feedback layer-action-dialog-feedback-error"
              >
                {uiText.createFailedPrefix}{createFailureMessage}
              </div>
            )}
            {(translationCreateDisabledReason || transcriptionCreateDisabledReason || !hasValidLanguage) && (
              <div className="layer-create-feedback-stack">
                {translationCreateDisabledReason && (
                  <p className="layer-action-dialog-feedback layer-action-dialog-feedback-error">
                    {uiText.currentRestrictionTranslation}{translationCreateDisabledReason}
                  </p>
                )}
                {transcriptionCreateDisabledReason && (
                  <p className="layer-action-dialog-feedback layer-action-dialog-feedback-error">
                    {uiText.currentRestrictionTranscription}{transcriptionCreateDisabledReason}
                  </p>
                )}
                {!hasValidLanguage && (
                  <p className="layer-action-dialog-feedback layer-action-dialog-feedback-info">
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
