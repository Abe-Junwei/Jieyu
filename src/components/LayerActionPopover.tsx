import React, { useId, useState, useCallback, useEffect, useMemo, memo } from 'react';
import ReactDOM from 'react-dom';
import { MaterialSymbol } from './ui/MaterialSymbol';
import { JIEYU_MATERIAL_INLINE, JIEYU_MATERIAL_PANEL, JIEYU_MATERIAL_PANEL_CLOSE_LG, JIEYU_MATERIAL_WAVE_MD } from '../utils/jieyuMaterialIcon';
import type { LayerCreateInput } from '../hooks/transcriptionTypes';
import type { LayerConstraint, LayerDocType, LayerLinkDocType } from '../db';
import { layerTranscriptionTreeParentId } from '../db';
import { LanguageIsoInput, type LanguageIsoInputValue } from './LanguageIsoInput';
import { getLayerCreateGuard, listIndependentBoundaryTranscriptionLayers } from '../services/LayerConstraintService';
import { getLayerLabelParts } from '../utils/transcriptionFormatters';
import { OrthographyBuilderPanel } from './OrthographyBuilderPanel';
import { formatOrthographyOptionLabel, groupOrthographiesForSelect, ORTHOGRAPHY_CREATE_SENTINEL, useOrthographyPicker } from '../hooks/useOrthographyPicker';
import { useLanguageCatalogLabelMap } from '../hooks/useLanguageCatalogLabelMap';
import { useLocale } from '../i18n';
import { getOrthographyCatalogGroupLabel, getOrthographyBuilderMessages } from '../i18n/orthographyBuilderMessages';
import { getLayerActionPopoverMessages, type LayerActionPopoverMessages } from '../i18n/layerActionPopoverMessages';
import { getOrthographyCatalogBadgeInfo } from './orthographyCatalogUi';
import { computeAdaptivePanelWidth } from '../utils/panelAdaptiveLayout';
import { useUiFontScaleRuntime } from '../hooks/useUiFontScaleRuntime';
import { useViewportWidth } from '../hooks/useViewportWidth';
import { readAnyMultiLangLabel } from '../utils/multiLangLabels';
import { DialogOverlay, DialogShell, FormField, PanelButton, PanelChip, PanelFeedback, PanelFeedbackStack, PanelNote, PanelSection, PanelSummary } from './ui';
import { buildLanguageInputSeed, getDisplayedLanguageInputLabel, normalizeLanguageInputAssetId, normalizeLanguageInputCode } from '../utils/languageInputHostState';
import { isKnownIso639_3Code } from '../utils/langMapping';
import { escapeRegExp } from '../utils/escapeRegExp';
import { buildTranscriptionIdByKeyMap, getPreferredHostTranscriptionLayerIdForTranslation } from '../utils/translationHostLinkQuery';

type LayerActionType =
  | 'create-transcription'
  | 'create-translation'
  | 'edit-transcription-metadata'
  | 'edit-translation-metadata'
  | 'delete';

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
  updateLayerMetadata?: (layerId: string, input: {
    dialect?: string;
    vernacular?: string;
    alias?: string;
  }) => Promise<boolean>;
  deleteLayer: (layerId: string) => Promise<void>;
  deleteLayerWithoutConfirm?: (layerId: string) => Promise<void>;
  checkLayerHasContent?: (layerId: string) => Promise<number>;
  /** 翻译宿主 link（用于从翻译层推导「上下文独立转写根层」；不读 translation.parentLayerId） */
  layerLinks?: ReadonlyArray<Pick<LayerLinkDocType, 'layerId' | 'transcriptionLayerKey' | 'hostTranscriptionLayerId' | 'isPreferred'>>;
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

export const LayerActionPopover = memo(function LayerActionPopover({
  action,
  layerId,
  deletableLayers,
  defaultLanguageId,
  defaultOrthographyId,
  layerCreateMessage,
  createLayer,
  updateLayerMetadata,
  deleteLayer,
  deleteLayerWithoutConfirm,
  checkLayerHasContent,
  layerLinks = [],
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
  const [dialect, setDialect] = useState('');
  const [vernacular, setVernacular] = useState('');
  const [alias, setAlias] = useState('');
  const [modality, setModality] = useState<'text' | 'audio' | 'mixed'>('text');
  const [constraint, setConstraint] = useState<LayerConstraint>('symbolic_association');
  const [selectedParentLayerId, setSelectedParentLayerId] = useState('');
  const [translationHostIds, setTranslationHostIds] = useState<string[]>([]);
  const [preferredTranslationHostId, setPreferredTranslationHostId] = useState('');
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

  const isEditMetadataAction = action === 'edit-transcription-metadata' || action === 'edit-translation-metadata';
  const editingLayer = useMemo(
    () => (isEditMetadataAction && layerId
      ? deletableLayers.find((layer) => layer.id === layerId)
      : undefined),
    [deletableLayers, isEditMetadataAction, layerId],
  );

  const independentParentLayers = listIndependentBoundaryTranscriptionLayers(deletableLayers);
  const contextualParentLayerId = useMemo(() => {
    if (!layerId) return '';
    const clickedLayer = deletableLayers.find((layer) => layer.id === layerId);
    if (!clickedLayer) return '';
    if (independentParentLayers.some((layer) => layer.id === clickedLayer.id)) {
      return clickedLayer.id;
    }
    if (clickedLayer.layerType === 'translation') {
      if (layerLinks.length === 0) return '';
      const transcriptionLayers = deletableLayers.filter((l) => l.layerType === 'transcription');
      const tidByKey = buildTranscriptionIdByKeyMap(transcriptionLayers);
      const preferredHostId = getPreferredHostTranscriptionLayerIdForTranslation(clickedLayer.id, layerLinks, tidByKey);
      if (preferredHostId && independentParentLayers.some((layer) => layer.id === preferredHostId)) {
        return preferredHostId;
      }
      return '';
    }
    const parentLayerId = layerTranscriptionTreeParentId(clickedLayer)?.trim() ?? '';
    if (parentLayerId && independentParentLayers.some((layer) => layer.id === parentLayerId)) {
      return parentLayerId;
    }
    return '';
  }, [deletableLayers, independentParentLayers, layerId, layerLinks]);
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
  // 内联 ISO 639-3 校验，与 ProjectSetupDialog 对齐（纯 ISO 码而非 assetId） | Inline ISO 639-3 validation, aligned with ProjectSetupDialog (pure ISO code, not assetId)
  const effectiveLangForValidation = normalizeLanguageInputCode(languageInput);
  const customLanguageError = effectiveLangForValidation && !isKnownIso639_3Code(effectiveLangForValidation)
    ? actionMessages.invalidLanguageCode
    : '';
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
    if (isEditMetadataAction) {
      pendingDefaultOrthographyIdRef.current = '';
      setDialect(editingLayer?.dialect ?? '');
      setVernacular(editingLayer?.vernacular ?? '');
      setAlias(editingLayer ? getLayerLabelParts(editingLayer, locale).alias : '');
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
      if (independentParentLayers.length === 1) {
        const onlyId = independentParentLayers[0]!.id;
        setTranslationHostIds([onlyId]);
        setPreferredTranslationHostId(onlyId);
      } else {
        const seed = contextualParentLayerId && independentParentLayers.some((layer) => layer.id === contextualParentLayerId)
          ? [contextualParentLayerId]
          : [];
        setTranslationHostIds(seed);
        setPreferredTranslationHostId(seed[0] ?? '');
      }
    } else {
      setTranslationHostIds([]);
      setPreferredTranslationHostId('');
    }
  }, [action, contextualParentLayerId, defaultLanguageSeed, editingLayer, formInitializationKey, independentParentLayers, isEditMetadataAction, locale, normalizedDefaultOrthographyId]);

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

  const needsTranscriptionDependentParent = action === 'create-transcription' && constraint === 'symbolic_association';
  const autoTranscriptionParentLayer = needsTranscriptionDependentParent && independentParentLayers.length === 1
    ? independentParentLayers[0]
    : undefined;
  const resolvedTranscriptionParentLayerId = needsTranscriptionDependentParent
    ? (autoTranscriptionParentLayer?.id ?? selectedParentLayerId)
    : '';
  const autoTranslationHostLayer = action === 'create-translation' && independentParentLayers.length === 1
    ? independentParentLayers[0]
    : undefined;

  useEffect(() => {
    if (action !== 'create-translation') return;
    setPreferredTranslationHostId((pref) => {
      if (translationHostIds.length === 0) return '';
      if (pref && translationHostIds.includes(pref)) return pref;
      return translationHostIds[0]!;
    });
  }, [action, translationHostIds]);

  const toggleTranslationHost = useCallback((hostId: string, checked: boolean) => {
    const order = independentParentLayers.map((layer) => layer.id);
    setTranslationHostIds((prev) => {
      const nextIds = new Set(checked ? [...prev, hostId] : prev.filter((id) => id !== hostId));
      return order.filter((id) => nextIds.has(id));
    });
  }, [independentParentLayers]);

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
    if (selectedParentLayerId && independentParentLayers.some((layer) => layer.id === selectedParentLayerId)) {
      return;
    }
    if (selectedParentLayerId) setSelectedParentLayerId('');
  }, [autoTranscriptionParentLayer, independentParentLayers, needsTranscriptionDependentParent, selectedParentLayerId]);

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
    const preferredTranslationHostForPayload = preferredTranslationHostId && translationHostIds.includes(preferredTranslationHostId)
      ? preferredTranslationHostId
      : translationHostIds[0];
    const immediateGuard = getLayerCreateGuard(deletableLayers, createLayerType, {
      languageId: resolvedLang,
      alias,
      modality,
      ...(resolvedConstraint ? { constraint: resolvedConstraint } : {}),
      ...(createLayerType === 'transcription' && resolvedTranscriptionParentLayerId
        ? { parentLayerId: resolvedTranscriptionParentLayerId }
        : {}),
      ...(createLayerType === 'translation' && translationHostIds.length > 0
        ? {
          hostTranscriptionLayerIds: translationHostIds,
          ...(preferredTranslationHostForPayload
            ? { preferredHostTranscriptionLayerId: preferredTranslationHostForPayload }
            : {}),
        }
        : {}),
      hasSupportedParent,
    });
    setCreateFailureMessage('');
    setIsLoading(true);
    try {
      const translationHostConfig = createLayerType === 'translation' && translationHostIds.length > 0
        ? {
          hostTranscriptionLayerIds: translationHostIds,
          ...(preferredTranslationHostForPayload
            ? { preferredHostTranscriptionLayerId: preferredTranslationHostForPayload }
            : {}),
        }
        : {};
      const success = await createLayer(createLayerType, {
        languageId: resolvedLang,
        ...(orthographyId ? { orthographyId } : {}),
        ...(dialect.trim() ? { dialect: dialect.trim() } : {}),
        ...(vernacular.trim() ? { vernacular: vernacular.trim() } : {}),
        ...(alias.trim() ? { alias: alias.trim() } : {}),
        ...(resolvedConstraint ? { constraint: resolvedConstraint } : {}),
        ...translationHostConfig,
        ...(createLayerType === 'transcription' && resolvedTranscriptionParentLayerId ? { parentLayerId: resolvedTranscriptionParentLayerId } : {}),
      }, (action === 'create-translation' || action === 'create-transcription') ? modality : undefined);
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
  }, [resolvedLanguageId, customLanguageError, orthographySelectionError, orthographyId, dialect, vernacular, alias, modality, constraint, action, createLayer, deletableLayers, independentParentLayers.length, layerCreateMessage, onClose, preferredTranslationHostId, resolvedTranscriptionParentLayerId, translationHostIds, actionMessages]);

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

  const handleSaveMetadata = useCallback(async () => {
    if (!isEditMetadataAction || !layerId || !updateLayerMetadata) return;
    setCreateFailureMessage('');
    setIsLoading(true);
    try {
      const success = await updateLayerMetadata(layerId, {
        dialect: dialect.trim(),
        vernacular: vernacular.trim(),
        alias: alias.trim(),
      });
      if (success) {
        onClose();
        return;
      }
      setCreateFailureMessage(actionMessages.genericActionFailed);
    } catch (error) {
      setCreateFailureMessage(error instanceof Error ? error.message : actionMessages.genericActionFailed);
    } finally {
      setIsLoading(false);
    }
  }, [actionMessages.genericActionFailed, alias, dialect, isEditMetadataAction, layerId, onClose, updateLayerMetadata, vernacular]);

  const handleResetForm = useCallback(() => {
    if (isEditMetadataAction) {
      setDialect(editingLayer?.dialect ?? '');
      setVernacular(editingLayer?.vernacular ?? '');
      setAlias(editingLayer ? getLayerLabelParts(editingLayer, locale).alias : '');
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
    setSelectedParentLayerId(contextualParentLayerId);
    if (action === 'create-translation') {
      if (independentParentLayers.length === 1) {
        const onlyId = independentParentLayers[0]!.id;
        setTranslationHostIds([onlyId]);
        setPreferredTranslationHostId(onlyId);
      } else {
        const seed = contextualParentLayerId && independentParentLayers.some((layer) => layer.id === contextualParentLayerId)
          ? [contextualParentLayerId]
          : [];
        setTranslationHostIds(seed);
        setPreferredTranslationHostId(seed[0] ?? '');
      }
    } else {
      setTranslationHostIds([]);
      setPreferredTranslationHostId('');
    }
    setCreateFailureMessage('');
  }, [action, contextualParentLayerId, defaultLanguageSeed, editingLayer, independentParentLayers, isEditMetadataAction, locale, normalizedDefaultOrthographyId]);

  const label = action === 'create-transcription'
    ? actionMessages.createTranscriptionLayer
    : action === 'create-translation'
    ? actionMessages.createTranslationLayer
    : action === 'edit-transcription-metadata' || action === 'edit-translation-metadata'
    ? actionMessages.editLayerMetadata
    : actionMessages.deleteLayer;

  const existingTranscriptionCount = deletableLayers.filter((layer) => layer.layerType === 'transcription').length;
  const resolvedLangForGuard = resolvedLanguageId.trim();
  const hasValidLanguage = resolvedLangForGuard.length > 0;
  const showConstraintSelector = action === 'create-transcription' && existingTranscriptionCount > 0;
  const preferredTranslationHostResolved = preferredTranslationHostId && translationHostIds.includes(preferredTranslationHostId)
    ? preferredTranslationHostId
    : translationHostIds[0];
  const translationGuard = action === 'create-translation'
    ? getLayerCreateGuard(deletableLayers, 'translation', {
      languageId: resolvedLangForGuard,
      alias,
      modality,
      constraint: 'symbolic_association',
      ...(translationHostIds.length > 0
        ? {
          hostTranscriptionLayerIds: translationHostIds,
          ...(preferredTranslationHostResolved
            ? { preferredHostTranscriptionLayerId: preferredTranslationHostResolved }
            : {}),
        }
        : {}),
      hasSupportedParent: independentParentLayers.length > 0,
    })
    : { allowed: true };
  const transcriptionGuard = action === 'create-transcription'
    ? getLayerCreateGuard(deletableLayers, 'transcription', {
      languageId: resolvedLangForGuard,
      alias,
      modality,
      ...(showConstraintSelector ? { constraint } : {}),
      ...(resolvedTranscriptionParentLayerId ? { parentLayerId: resolvedTranscriptionParentLayerId } : {}),
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
      : (resolvedTranscriptionParentLayerId || independentParentLayers[0]?.id);
    return getLayerCreateGuard(
      deletableLayers,
      action === 'create-transcription' ? 'transcription' : 'translation',
      {
        languageId: resolvedLangForGuard,
        alias,
        modality,
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
      <PanelChip>{actionMessages.deleteLayer}</PanelChip>
      <PanelChip variant="danger">{deletableLayers.length}</PanelChip>
    </div>
  );
  const createFooter = (
    <PanelButton
      variant="primary"
      disabled={action === 'create-translation'
        ? (isLoading || orthographyPicker.submitting || orthographyPicker.isCreating || !hasValidLanguage || Boolean(customLanguageError) || Boolean(orthographySelectionError) || translationCreateDisabledReason.length > 0)
        : (isLoading || orthographyPicker.submitting || orthographyPicker.isCreating || !hasValidLanguage || Boolean(customLanguageError) || Boolean(orthographySelectionError) || transcriptionCreateDisabledReason.length > 0)}
      onClick={handleCreate}
    >
      {label}
    </PanelButton>
  );
  /* 面包屑标题 + 构建器专属 footer | Breadcrumb title + builder-specific footer */
  const builderMessages = getOrthographyBuilderMessages(locale);
  const builderBreadcrumbTitle = (
    <span className="dialog-breadcrumb-title">
      <button type="button" className="dialog-breadcrumb-back" onClick={orthographyPicker.cancelCreate} aria-label={label}>
        <MaterialSymbol name="chevron_left" className={JIEYU_MATERIAL_PANEL} />
        <span>{label}</span>
      </button>
      <span className="dialog-breadcrumb-separator">/</span>
      <span className="dialog-breadcrumb-current">{builderMessages.panelTitle}</span>
    </span>
  );
  const builderFooter = (
    <>
      <PanelButton
        variant="ghost"
        disabled={orthographyPicker.submitting}
        onClick={orthographyPicker.cancelCreate}
      >
        {builderMessages.cancelCreate}
      </PanelButton>
      <PanelButton
        variant="primary"
        disabled={orthographyPicker.submitting}
        onClick={() => { void orthographyPicker.createOrthography(); }}
      >
        {orthographyPicker.submitting
          ? builderMessages.creating
          : orthographyPicker.requiresRenderWarningConfirmation
            ? builderMessages.confirmRiskAndCreate
            : builderMessages.createAndSelect}
      </PanelButton>
    </>
  );
  const deleteFooter = (
    <>
      <PanelButton variant="ghost" onClick={deleteConfirm ? handleCancelDelete : onClose} disabled={isLoading}>
        {actionMessages.cancel}
      </PanelButton>
      <PanelButton
        variant="danger"
        disabled={deleteConfirm ? isLoading : (!deleteLayerId || isLoading)}
        onClick={deleteConfirm ? handleConfirmDelete : handleDelete}
      >
        {deleteConfirm ? actionMessages.confirmDelete : actionMessages.deleteAction}
      </PanelButton>
    </>
  );
  const editFooter = (
    <>
      <PanelButton variant="ghost" onClick={onClose} disabled={isLoading}>
        {actionMessages.cancel}
      </PanelButton>
      <PanelButton
        variant="primary"
        disabled={isLoading || !layerId || !updateLayerMetadata}
        onClick={handleSaveMetadata}
      >
        {actionMessages.saveMetadata}
      </PanelButton>
    </>
  );
  const orthographyFieldId = `${fieldIdPrefix}-orthography`;
  const dialectFieldId = `${fieldIdPrefix}-dialect`;
  const vernacularFieldId = `${fieldIdPrefix}-vernacular`;
  const aliasFieldId = `${fieldIdPrefix}-alias`;
  const modalityFieldId = `${fieldIdPrefix}-modality`;
  const translationParentLayerFieldId = `${fieldIdPrefix}-translation-parent-layer`;
  const transcriptionParentLayerFieldId = `${fieldIdPrefix}-transcription-parent-layer`;
  const deleteLayerFieldId = `${fieldIdPrefix}-delete-layer`;

  const popover = (
    <DialogOverlay
      onClose={onClose}
      topmost
      closeOn="mousedown"
    >
      <DialogShell
        className={`layer-action-dialog${orthographyPicker.isCreating ? ' orthography-builder-dialog-host' : ''}`}
        layoutStyle={{ '--dialog-auto-width': orthographyPicker.isCreating ? '404px' : `${Math.max(panelMinWidth, dialogAutoWidth)}px` } as React.CSSProperties}
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
                <MaterialSymbol name="restart_alt" className={JIEYU_MATERIAL_WAVE_MD} />
              </button>
            )}
            <button
              type="button"
              className="icon-btn"
              onClick={onClose}
              aria-label={`${label} ${actionMessages.cancel}`}
              title={`${label} ${actionMessages.cancel}`}
            >
              <MaterialSymbol name="close" className={JIEYU_MATERIAL_PANEL_CLOSE_LG} />
            </button>
          </>
        )}
        footer={action === 'delete'
          ? deleteFooter
          : isEditMetadataAction
            ? editFooter
            : orthographyPicker.isCreating
              ? builderFooter
              : createFooter}
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
                <FormField htmlFor={deleteLayerFieldId} label={actionMessages.deleteLayer}>
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
                </FormField>
              )}
            </PanelSection>
          </>
        ) : isEditMetadataAction ? (
          <>
            <PanelSummary
              className="layer-action-dialog-summary"
              description={editingLayer ? readAnyMultiLangLabel(editingLayer.name) ?? editingLayer.key : ''}
              meta={(
                <div className="panel-meta">
                  <PanelChip>{editingLayer?.layerType === 'translation' ? actionMessages.translationLayerType : actionMessages.transcriptionLayerType}</PanelChip>
                </div>
              )}
            />
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
                placeholder={actionMessages.aliasShortPlaceholder}
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
              />
              <p className="layer-action-dialog-alias-hint">{actionMessages.aliasHint}</p>
            </FormField>
            {createFailureMessage.trim().length > 0 ? (
              <PanelFeedback role="alert" aria-live="assertive" level="error">
                {createFailureMessage}
              </PanelFeedback>
            ) : null}
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
            <FormField>
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
              />
            </FormField>
            <FormField htmlFor={`${fieldIdPrefix}-language-asset-id`} label={actionMessages.languageAssetIdLabel}>
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
            </FormField>
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
                    <span className={selectedOrthographyBadge.className}>{selectedOrthographyBadge.label}</span>
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
                placeholder={actionMessages.aliasShortPlaceholder}
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
              />
              <p className="layer-action-dialog-alias-hint">{actionMessages.aliasHint}</p>
            </FormField>
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
                  {action === 'create-translation'
                    ? actionMessages.translationBoundarySource
                    : actionMessages.transcriptionModalityHint}
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
                        <label key={layer.id} className="panel-checkbox layer-action-dialog-checkbox-option">
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
                    {actionMessages.autoLinkedParent(formatParentLayerOptionLabel(autoTranslationHostLayer))}
                  </PanelNote>
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
                  <FormField htmlFor={transcriptionParentLayerFieldId} label={actionMessages.selectParentLayer}>
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
                  </FormField>
                )}
                {constraint === 'symbolic_association' && autoTranscriptionParentLayer && (
                  <PanelNote className="layer-action-dialog-meta-note layer-action-dialog-auto-linked-hint">
                    {actionMessages.autoLinkedParent(formatParentLayerOptionLabel(autoTranscriptionParentLayer))}
                  </PanelNote>
                )}
              </div>
            )}
            {showCreateFailure && (
              <PanelFeedback
                role="alert"
                aria-live="assertive"
                level="error"
              >
                {actionMessages.createFailedPrefix}{createFailureMessage}
              </PanelFeedback>
            )}
            {(translationCreateDisabledReason || transcriptionCreateDisabledReason || !hasValidLanguage) && (
              <PanelFeedbackStack>
                {translationCreateDisabledReason && (
                  <PanelFeedback level="error">
                    {actionMessages.currentRestrictionTranslation}{translationCreateDisabledReason}
                  </PanelFeedback>
                )}
                {transcriptionCreateDisabledReason && (
                  <PanelFeedback level="error">
                    {actionMessages.currentRestrictionTranscription}{transcriptionCreateDisabledReason}
                  </PanelFeedback>
                )}
                {!hasValidLanguage && (
                  <PanelFeedback level="info">
                    {createLanguageRequiredText}
                  </PanelFeedback>
                )}
              </PanelFeedbackStack>
            )}
          </>
        )}
      </DialogShell>
      </DialogOverlay>
  );

  return ReactDOM.createPortal(popover, document.body);
});
