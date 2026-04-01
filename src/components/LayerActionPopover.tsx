import React, { useState, useCallback, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom';
import type { LayerCreateInput } from '../hooks/transcriptionTypes';
import type { LayerConstraint, LayerDocType } from '../db';
import {
  getLayerCreateGuard,
  listIndependentBoundaryTranscriptionLayers,
} from '../services/LayerConstraintService';
import { COMMON_LANGUAGES, getLayerLabelParts } from '../utils/transcriptionFormatters';
import { useDraggablePanel } from '../hooks/useDraggablePanel';
import { OrthographyBuilderPanel } from './OrthographyBuilderPanel';
import { OrthographyTransformManager } from './OrthographyTransformManager';
import {
  formatOrthographyOptionLabel,
  ORTHOGRAPHY_CREATE_SENTINEL,
  useOrthographyPicker,
} from '../hooks/useOrthographyPicker';
import { decodeEscapedUnicode } from '../utils/decodeEscapedUnicode';

type LayerActionType = 'create-transcription' | 'create-translation' | 'delete';

interface LayerActionPopoverProps {
  action: LayerActionType;
  layerId: string | undefined;
  deletableLayers: LayerDocType[];
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

const PANEL_MIN_WIDTH = 280;
const PANEL_MIN_HEIGHT = 180;
const PANEL_MAX_WIDTH = 760;
const PANEL_MAX_HEIGHT = 560;
const PANEL_MARGIN = 8;
const PANEL_DEFAULT_SIZE = { width: 360, height: 240 };
const UI_TEXT = {
  createTranscription: decodeEscapedUnicode('\\u65b0\\u5efa\\u8f6c\\u5199\\u5c42'),
  createTranslation: decodeEscapedUnicode('\\u65b0\\u5efa\\u7ffb\\u8bd1\\u5c42'),
  deleteLayer: decodeEscapedUnicode('\\u5220\\u9664\\u5c42'),
  createFailedPrefix: decodeEscapedUnicode('\\u521b\\u5efa\\u5931\\u8d25\\uff1a'),
  resetPanel: decodeEscapedUnicode('\\u91cd\\u7f6e\\u4f4d\\u7f6e\\u4e0e\\u5c3a\\u5bf8'),
  dragToMove: decodeEscapedUnicode('\\u62d6\\u52a8\\u79fb\\u52a8\\uff0c\\u53cc\\u51fb\\u56de\\u4e2d'),
  confirmDelete: decodeEscapedUnicode('\\u786e\\u8ba4\\u5220\\u9664'),
  cancel: decodeEscapedUnicode('\\u53d6\\u6d88'),
  delete: decodeEscapedUnicode('\\u5220\\u9664'),
  create: decodeEscapedUnicode('\\u521b\\u5efa'),
  selectLanguage: decodeEscapedUnicode('\\u9009\\u62e9\\u8bed\\u8a00\\u2026'),
  otherManualInput: decodeEscapedUnicode('\\u5176\\u4ed6\\uff08\\u624b\\u52a8\\u8f93\\u5165\\uff09'),
  customLanguageCodePlaceholder: decodeEscapedUnicode('ISO 639-3 \\u4ee3\\u7801\\uff08\\u5982 tib\\uff09'),
  useDefaultScript: decodeEscapedUnicode('\\u6cbf\\u7528\\u9ed8\\u8ba4\\u811a\\u672c\\u63a8\\u65ad'),
  createOrthography: decodeEscapedUnicode('+ \\u65b0\\u5efa\\u6b63\\u5b57\\u6cd5\\u2026'),
  orthographyHint: decodeEscapedUnicode('\\u5f53\\u524d\\u8bed\\u8a00\\u6682\\u65e0\\u6b63\\u5b57\\u6cd5\\u8bb0\\u5f55\\uff0c\\u53ef\\u76f4\\u63a5\\u65b0\\u5efa\\u6216\\u6cbf\\u7528\\u9ed8\\u8ba4\\u811a\\u672c\\u63a8\\u65ad\\u3002'),
  sourceLanguagePlaceholder: decodeEscapedUnicode('\\u9009\\u62e9\\u6765\\u6e90\\u8bed\\u8a00\\u2026'),
  sourceLanguageCodePlaceholder: decodeEscapedUnicode('\\u6765\\u6e90\\u8bed\\u8a00 ISO 639-3 \\u4ee3\\u7801\\uff08\\u5982 eng\\uff09'),
  aliasPlaceholder: decodeEscapedUnicode('\\u522b\\u540d\\uff08\\u53ef\\u9009\\uff09'),
  translationText: decodeEscapedUnicode('\\u6587\\u672c\\uff08\\u7eaf\\u6587\\u5b57\\u7ffb\\u8bd1\\uff09'),
  translationAudio: decodeEscapedUnicode('\\u8bed\\u97f3\\uff08\\u53e3\\u8bd1\\u5f55\\u97f3\\uff09'),
  translationMixed: decodeEscapedUnicode('\\u6df7\\u5408\\uff08\\u6587\\u5b57 + \\u5f55\\u97f3\\uff09'),
  translationBoundaryHint: decodeEscapedUnicode('\\u8fb9\\u754c\\u6765\\u6e90\\uff1a\\u7ffb\\u8bd1\\u5c42\\u4f1a\\u6cbf\\u7528\\u6240\\u9009\\u8f6c\\u5199\\u5c42\\u7684\\u8fb9\\u754c\\u8303\\u56f4\\u3002'),
  selectParentLayer: decodeEscapedUnicode('\\u9009\\u62e9\\u4f9d\\u8d56\\u8fb9\\u754c\\u5c42\\u2026'),
  autoLinkedPrefix: decodeEscapedUnicode('\\u5df2\\u81ea\\u52a8\\u5173\\u8054\\u5230\\u300c'),
  autoLinkedSuffix: decodeEscapedUnicode('\\u300d\\u3002'),
  constraintLegend: decodeEscapedUnicode('\\u5c42\\u7ea6\\u675f\\u7c7b\\u578b | Layer Constraint Type'),
  constraintDependent: decodeEscapedUnicode('\\u4f9d\\u8d56\\u8fb9\\u754c\\uff08\\u8ddf\\u968f\\u4e3b\\u8f6c\\u5199\\u5c42\\uff09| Dependent'),
  constraintIndependent: decodeEscapedUnicode('\\u72ec\\u7acb\\u8fb9\\u754c\\uff08\\u81ea\\u7531\\u5b9a\\u4e49\\uff09| Independent'),
  currentRestrictionTranslation: decodeEscapedUnicode('\\u5f53\\u524d\\u9650\\u5236\\uff1a\\u65e0\\u6cd5\\u65b0\\u5efa\\u7ffb\\u8bd1\\u3002'),
  currentRestrictionTranscription: decodeEscapedUnicode('\\u5f53\\u524d\\u9650\\u5236\\uff1a\\u65e0\\u6cd5\\u65b0\\u5efa\\u8f6c\\u5199\\u3002'),
  requiredPrefix: decodeEscapedUnicode('\\u5fc5\\u586b\\u9879\\uff1a'),
  createTranslationFallback: decodeEscapedUnicode('\\u65e0\\u6cd5\\u521b\\u5efa\\u7ffb\\u8bd1\\u5c42\\uff1a\\u8bf7\\u68c0\\u67e5\\u4f9d\\u8d56\\u5c42\\u3001\\u76ee\\u6807\\u8bed\\u8a00\\u4e0e\\u522b\\u540d\\u8bbe\\u7f6e\\u3002'),
  createTranscriptionFallback: decodeEscapedUnicode('\\u65e0\\u6cd5\\u521b\\u5efa\\u8f6c\\u5199\\u5c42\\uff1a\\u8bf7\\u68c0\\u67e5\\u8fb9\\u754c\\u6a21\\u5f0f\\u3001\\u76ee\\u6807\\u8bed\\u8a00\\u4e0e\\u522b\\u540d\\u8bbe\\u7f6e\\u3002'),
  genericActionFailed: decodeEscapedUnicode('\\u64cd\\u4f5c\\u5931\\u8d25\\uff0c\\u8bf7\\u7a0d\\u540e\\u91cd\\u8bd5\\u3002'),
  translationLanguageRequired: decodeEscapedUnicode('\\u8bf7\\u5148\\u9009\\u62e9\\u7ffb\\u8bd1\\u5c42\\u8bed\\u8a00\\uff08\\u81ea\\u5b9a\\u4e49\\u8bed\\u8a00\\u9700\\u586b\\u5199\\u4ee3\\u7801\\uff09\\u3002'),
  transcriptionLanguageRequired: decodeEscapedUnicode('\\u8bf7\\u5148\\u9009\\u62e9\\u8f6c\\u5199\\u5c42\\u8bed\\u8a00\\uff08\\u81ea\\u5b9a\\u4e49\\u8bed\\u8a00\\u9700\\u586b\\u5199\\u4ee3\\u7801\\uff09\\u3002'),
} as const;

function resolveCreateFailureText(message: string | undefined, fallback: string): string {
  const raw = (message ?? '').trim();
  const text = raw.replace(/^\u521b\u5efa\u5931\u8d25[:：]\s*/u, '');
  if (!text) return fallback;
  if (text.startsWith('\u5df2\u521b\u5efa')) return fallback;
  return text;
}

function getCreateFallbackMessage(action: LayerActionType): string {
  if (action === 'create-translation') {
    return UI_TEXT.createTranslationFallback;
  }
  if (action === 'create-transcription') {
    return UI_TEXT.createTranscriptionFallback;
  }
  return UI_TEXT.genericActionFailed;
}

function formatParentLayerOptionLabel(layer: LayerDocType): string {
  const { type, lang, alias } = getLayerLabelParts(layer);
  return alias ? `${type} · ${lang} · ${alias}` : `${type} · ${lang}`;
}

export function LayerActionPopover({
  action,
  layerId,
  deletableLayers,
  layerCreateMessage,
  createLayer,
  deleteLayer,
  deleteLayerWithoutConfirm,
  checkLayerHasContent,
  onClose,
}: LayerActionPopoverProps) {
  const storageKey = `jieyu:layer-action-popover-rect:${action}`;
  const [langId, setLangId] = useState('');
  const [customLang, setCustomLang] = useState('');
  const [orthographyId, setOrthographyId] = useState('');
  const [alias, setAlias] = useState('');
  const [modality, setModality] = useState<'text' | 'audio' | 'mixed'>('text');
  const [constraint, setConstraint] = useState<LayerConstraint>('symbolic_association');
  const [selectedParentLayerId, setSelectedParentLayerId] = useState('');
  const [deleteLayerId, setDeleteLayerId] = useState(layerId ?? '');
  const [isLoading, setIsLoading] = useState(false);
  const [createFailureMessage, setCreateFailureMessage] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<{ layerId: string; layerName: string; textCount: number } | null>(null);

  const {
    position,
    size,
    handleDragStart,
    handleResizeStart,
    handleRecenter,
    handleResetPanelLayout,
  } = useDraggablePanel({
    storageKey,
    defaultSize: PANEL_DEFAULT_SIZE,
    minWidth: PANEL_MIN_WIDTH,
    minHeight: PANEL_MIN_HEIGHT,
    maxWidth: PANEL_MAX_WIDTH,
    maxHeight: PANEL_MAX_HEIGHT,
    margin: PANEL_MARGIN,
  });

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
    () => (langId === '__custom__' ? customLang.trim() : langId),
    [customLang, langId],
  );
  const orthographyPicker = useOrthographyPicker(resolvedLanguageId, orthographyId, setOrthographyId);
  const selectedOrthography = useMemo(
    () => orthographyPicker.orthographies.find((item) => item.id === orthographyId),
    [orthographyId, orthographyPicker.orthographies],
  );

  useEffect(() => {
    setCreateFailureMessage('');
    setConstraint('symbolic_association');
    setSelectedParentLayerId(contextualParentLayerId);
  }, [action, contextualParentLayerId]);

  // Keep currentPositionRef and currentSizeRef in sync with state to avoid stale closures | \u4fdd\u6301 ref \u4e0e state \u540c\u6b65，\u907f\u514d\u95ed\u5305\u8fc7\u671f

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
        getCreateFallbackMessage(action),
      ));
    } catch (error) {
      setCreateFailureMessage(resolveCreateFailureText(
        error instanceof Error ? error.message : '',
        getCreateFallbackMessage(action),
      ));
    } finally {
      setIsLoading(false);
    }
  }, [resolvedLanguageId, orthographyId, alias, modality, constraint, action, createLayer, deletableLayers, independentParentLayers.length, layerCreateMessage, onClose, resolvedCreateParentLayerId]);

  const handleDelete = useCallback(async () => {
    if (!deleteLayerId) return;
    const layer = deletableLayers.find((l) => l.id === deleteLayerId);
    const layerName = layer?.name?.zho ?? layer?.name?.zh ?? layer?.name?.eng ?? layer?.name?.en ?? layer?.key ?? deleteLayerId;

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

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  const label = action === 'create-transcription'
    ? UI_TEXT.createTranscription
    : action === 'create-translation'
    ? UI_TEXT.createTranslation
    : UI_TEXT.deleteLayer;

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
    ? (translationGuard.allowed ? '' : (translationGuard.reasonShort ?? '\u5f53\u524d\u65e0\u6cd5\u65b0\u5efa\u7ffb\u8bd1'))
    : '';
  const transcriptionCreateDisabledReason = action === 'create-transcription'
    ? (transcriptionGuard.allowed ? '' : (transcriptionGuard.reasonShort ?? '\u5f53\u524d\u65e0\u6cd5\u65b0\u5efa\u8f6c\u5199'))
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
    ? UI_TEXT.translationLanguageRequired
    : UI_TEXT.transcriptionLanguageRequired;

  const popover = (
    <div
      className="layer-action-popover-backdrop"
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onClose}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      <div
        className="layer-action-popover-card floating-panel"
        style={{
          left: `${position.x}px`,
          top: `${position.y}px`,
          width: `${size.width}px`,
          minHeight: `${size.height}px`,
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        role="document"
      >
        <div
          className="layer-action-popover-title floating-panel-title-row floating-panel-drag-handle"
          onPointerDown={handleDragStart}
          onDoubleClick={handleRecenter}
          title={UI_TEXT.dragToMove}
        >
          <span>{label}</span>
          <button
            type="button"
            className="floating-panel-reset-btn"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={handleResetPanelLayout}
            aria-label={UI_TEXT.resetPanel}
            title={UI_TEXT.resetPanel}
          >
            ↺
          </button>
        </div>

        {showCreateFailure && (
          <div
            role="alert"
            aria-live="assertive"
            className="layer-action-popover-feedback layer-action-popover-feedback-error"
          >
            {UI_TEXT.createFailedPrefix}{createFailureMessage}
          </div>
        )}

        <div className="transcription-side-pane-action-popover-body layer-action-popover-body">
        {action === 'delete' ? (
          <>
            {deleteConfirm ? (
              // Delete confirmation view
              <>
                <p className="layer-action-popover-copy">
                  {decodeEscapedUnicode(`\\u5c42\\u300c${deleteConfirm.layerName}\\u300d\\u5305\\u542b ${deleteConfirm.textCount} \\u6761\\u6587\\u672c\\u8bb0\\u5f55\\uff0c\\u5220\\u9664\\u540e\\u5c06\\u65e0\\u6cd5\\u6062\\u590d\\u3002`)}
                </p>
                <div className="transcription-side-pane-action-row">
                  <button
                    className="btn btn-sm btn-danger"
                    disabled={isLoading}
                    onClick={handleConfirmDelete}
                  >
                    {UI_TEXT.confirmDelete}
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={handleCancelDelete} disabled={isLoading}>
                    {UI_TEXT.cancel}
                  </button>
                </div>
              </>
            ) : (
              // Delete selection view
              <>
                <select
                  className="input transcription-side-pane-action-input"
                  value={deleteLayerId}
                  onChange={(e) => setDeleteLayerId(e.target.value)}
                >
                  {deletableLayers.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name?.zho ?? l.name?.zh ?? l.name?.eng ?? l.name?.en ?? l.key}
                    </option>
                  ))}
                </select>
                <div className="transcription-side-pane-action-row">
                  <button
                    className="btn btn-sm btn-danger"
                    disabled={!deleteLayerId || isLoading}
                    onClick={handleDelete}
                  >
                    {UI_TEXT.delete}
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={onClose}>
                    {UI_TEXT.cancel}
                  </button>
                </div>
              </>
            )}
          </>
        ) : (
          <>
            <select
              className="input transcription-side-pane-action-input"
              value={langId}
              onChange={(e) => setLangId(e.target.value)}
            >
              <option value="">{UI_TEXT.selectLanguage}</option>
              {COMMON_LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.label}（{lang.code}）
                </option>
              ))}
              <option value="__custom__">{UI_TEXT.otherManualInput}</option>
            </select>
            {langId === '__custom__' && (
              <input
                className="input transcription-side-pane-action-input"
                placeholder={UI_TEXT.customLanguageCodePlaceholder}
                value={customLang}
                onChange={(e) => setCustomLang(e.target.value)}
              />
            )}
            {resolvedLanguageId && (
              <>
                <select
                  className="input transcription-side-pane-action-input"
                  value={orthographyPicker.isCreating ? ORTHOGRAPHY_CREATE_SENTINEL : orthographyId}
                  onChange={(e) => orthographyPicker.handleSelectionChange(e.target.value)}
                >
                  {orthographyPicker.orthographies.length === 0 && <option value="">{UI_TEXT.useDefaultScript}</option>}
                  {orthographyPicker.orthographies.map((orthography) => (
                    <option key={orthography.id} value={orthography.id}>
                      {formatOrthographyOptionLabel(orthography)}
                    </option>
                  ))}
                  <option value={ORTHOGRAPHY_CREATE_SENTINEL}>{UI_TEXT.createOrthography}</option>
                </select>
                {orthographyPicker.orthographies.length === 0 && !orthographyPicker.isCreating && (
                  <div className="layer-parent-guidance-note">
                    {UI_TEXT.orthographyHint}
                  </div>
                )}
                {orthographyPicker.isCreating && (
                  <OrthographyBuilderPanel
                    picker={orthographyPicker}
                    languageOptions={COMMON_LANGUAGES}
                    compact
                    sourceLanguagePlaceholder={UI_TEXT.sourceLanguagePlaceholder}
                    sourceLanguageCodePlaceholder={UI_TEXT.sourceLanguageCodePlaceholder}
                  />
                )}
                {!orthographyPicker.isCreating && selectedOrthography && (
                  <OrthographyTransformManager
                    targetOrthography={selectedOrthography}
                    languageOptions={COMMON_LANGUAGES}
                    compact
                  />
                )}
              </>
            )}
            <input
              className="input transcription-side-pane-action-input"
              placeholder={UI_TEXT.aliasPlaceholder}
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
            />
            {action === 'create-translation' && (
              <>
                <select
                  className="input transcription-side-pane-action-input"
                  value={modality}
                  onChange={(e) => setModality(e.target.value as 'text' | 'audio' | 'mixed')}
                >
                  <option value="text">{UI_TEXT.translationText}</option>
                  <option value="audio">{UI_TEXT.translationAudio}</option>
                  <option value="mixed">{UI_TEXT.translationMixed}</option>
                </select>
                <div className="layer-parent-guidance-note">
                  {UI_TEXT.translationBoundaryHint}
                </div>
                {independentParentLayers.length > 1 && (
                  <select
                    className="input transcription-side-pane-action-input layer-parent-select"
                    value={selectedParentLayerId}
                    onChange={(e) => setSelectedParentLayerId(e.target.value)}
                  >
                    <option value="">{UI_TEXT.selectParentLayer}</option>
                    {independentParentLayers.map((layer) => (
                      <option key={layer.id} value={layer.id}>{formatParentLayerOptionLabel(layer)}</option>
                    ))}
                  </select>
                )}
                {autoParentLayer && (
                  <p className="layer-parent-auto-note layer-action-popover-meta-note">
                    {UI_TEXT.autoLinkedPrefix}{formatParentLayerOptionLabel(autoParentLayer)}{UI_TEXT.autoLinkedSuffix}
                  </p>
                )}
              </>
            )}
            {action === 'create-transcription' && showConstraintSelector && (
              <fieldset className="layer-action-popover-fieldset">
                <legend className="layer-action-popover-fieldset-legend">{UI_TEXT.constraintLegend}</legend>
                <label className="layer-action-popover-radio-option layer-action-popover-radio-option-block">
                  <input
                    type="radio"
                    name="constraint"
                    value="symbolic_association"
                    checked={constraint === 'symbolic_association'}
                    disabled={!symbolicConstraintGuard.allowed}
                    onChange={(e) => setConstraint(e.target.value as LayerConstraint)}
                  />
                  {UI_TEXT.constraintDependent}
                </label>
                <label className="layer-action-popover-radio-option">
                  <input
                    type="radio"
                    name="constraint"
                    value="independent_boundary"
                    checked={constraint === 'independent_boundary'}
                    disabled={!independentConstraintGuard.allowed}
                    onChange={(e) => setConstraint(e.target.value as LayerConstraint)}
                  />
                  {UI_TEXT.constraintIndependent}
                </label>
              </fieldset>
            )}
            {action === 'create-transcription' && showConstraintSelector && constraint === 'symbolic_association' && independentParentLayers.length > 1 && (
              <select
                className="input transcription-side-pane-action-input layer-parent-select"
                value={selectedParentLayerId}
                onChange={(e) => setSelectedParentLayerId(e.target.value)}
              >
                <option value="">{UI_TEXT.selectParentLayer}</option>
                {independentParentLayers.map((layer) => (
                  <option key={layer.id} value={layer.id}>{formatParentLayerOptionLabel(layer)}</option>
                ))}
              </select>
            )}
            {action === 'create-transcription' && showConstraintSelector && constraint === 'symbolic_association' && autoParentLayer && (
              <p className="layer-parent-auto-note layer-action-popover-meta-note">
                {UI_TEXT.autoLinkedPrefix}{formatParentLayerOptionLabel(autoParentLayer)}{UI_TEXT.autoLinkedSuffix}
              </p>
            )}
            <div className="transcription-side-pane-action-row">
              <button
                className="btn btn-sm"
                disabled={action === 'create-translation'
                  ? (isLoading || orthographyPicker.submitting || orthographyPicker.isCreating || !hasValidLanguage || translationCreateDisabledReason.length > 0)
                  : (isLoading || orthographyPicker.submitting || orthographyPicker.isCreating || !hasValidLanguage || transcriptionCreateDisabledReason.length > 0)}
                onClick={handleCreate}
              >
                {UI_TEXT.create}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={onClose}>
                {UI_TEXT.cancel}
              </button>
            </div>
            {(translationCreateDisabledReason || transcriptionCreateDisabledReason || !hasValidLanguage) && (
              <div className="layer-create-feedback-stack">
                {translationCreateDisabledReason && (
                  <p className="layer-create-feedback layer-create-feedback-error">
                    {UI_TEXT.currentRestrictionTranslation}{translationCreateDisabledReason}
                  </p>
                )}
                {transcriptionCreateDisabledReason && (
                  <p className="layer-create-feedback layer-create-feedback-error">
                    {UI_TEXT.currentRestrictionTranscription}{transcriptionCreateDisabledReason}
                  </p>
                )}
                {!hasValidLanguage && (
                  <p className="layer-create-feedback layer-create-feedback-info">
                    {UI_TEXT.requiredPrefix}{createLanguageRequiredMessage}
                  </p>
                )}
              </div>
            )}
          </>
        )}
        </div>
        <div className="floating-panel-resize-handle" onPointerDown={handleResizeStart} aria-hidden="true" />
      </div>
    </div>
  );

  return ReactDOM.createPortal(popover, document.body);
}
