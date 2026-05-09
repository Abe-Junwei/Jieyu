import React, { useId, useState, useCallback, useEffect, useMemo, memo } from 'react';
import ReactDOM from 'react-dom';
import { MaterialSymbol } from './ui/MaterialSymbol';
import {
  JIEYU_MATERIAL_PANEL,
  JIEYU_MATERIAL_PANEL_CLOSE_LG,
  JIEYU_MATERIAL_WAVE_MD,
} from '../utils/jieyuMaterialIcon';
import type { LayerCreateInput } from '../hooks/transcriptionTypes';
import type { LayerConstraint, LayerDocType, LayerLinkDocType } from '../db';
import { getDb, layerTranscriptionTreeParentId } from '../db';
import { type LanguageIsoInputValue } from './LanguageIsoInput';
import {
  getLayerCreateGuard,
  listIndependentBoundaryTranscriptionLayers,
} from '../services/LayerConstraintService';
import { getLayerLabelParts } from '../utils/transcriptionFormatters';
import { OrthographyBuilderPanel } from './OrthographyBuilderPanel';
import { groupOrthographiesForSelect, useOrthographyPicker } from '../hooks/useOrthographyPicker';
import { useLanguageCatalogLabelMap } from '../hooks/useLanguageCatalogLabelMap';
import { useLocale } from '../i18n';
import { getOrthographyBuilderMessages } from '../i18n/messages';
import { getOrthographyCatalogBadgeInfo } from './orthographyCatalogUi';
import { getLayerActionPopoverMessages } from '../i18n/messages';

import { computeAdaptivePanelWidth } from '../utils/panelAdaptiveLayout';
import { useUiFontScaleRuntime } from '../hooks/useUiFontScaleRuntime';
import { useViewportWidth } from '../hooks/useViewportWidth';
import { readAnyMultiLangLabel } from '../utils/multiLangLabels';
import {
  DialogOverlay,
  DialogShell,
  FormField,
  PanelButton,
  PanelChip,
  PanelSection,
  PanelSummary,
} from './ui';
import {
  buildLanguageInputSeed,
  getDisplayedLanguageInputLabel,
  normalizeLanguageInputAssetId,
  normalizeLanguageInputCode,
} from '../utils/languageInputHostState';
import { isKnownIso639_3Code } from '../utils/langMapping';
import {
  buildTranscriptionIdByKeyMap,
  getHostTranscriptionLayerIdsForTranslation,
  getPreferredHostTranscriptionLayerIdForTranslation,
} from '../utils/translationHostLinkQuery';
import type { LayerMetadataUpdateInput } from '../types/layerMetadata';
import { LayerActionPopoverEditMetadataContent } from './layerActionPopover/LayerActionPopoverEditMetadataContent';
import { LayerActionPopoverCreateContent } from './layerActionPopover/LayerActionPopoverCreateContent';
import {
  type LayerActionType,
  resolveCreateFailureText,
  getCreateFallbackMessage,
} from './layerActionPopoverHelpers';

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
  updateLayerMetadata?: (layerId: string, input: LayerMetadataUpdateInput) => Promise<boolean>;
  deleteLayer: (layerId: string) => Promise<void>;
  deleteLayerWithoutConfirm?: (layerId: string) => Promise<void>;
  checkLayerHasContent?: (layerId: string) => Promise<number>;
  /** 翻译宿主 link（用于从翻译层推导「上下文独立转写根层」；不读 translation.parentLayerId） */
  layerLinks?: ReadonlyArray<
    Pick<
      LayerLinkDocType,
      'layerId' | 'transcriptionLayerKey' | 'hostTranscriptionLayerId' | 'isPreferred' | 'linkType'
    >
  >;
  onClose: () => void;
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
    () =>
      computeAdaptivePanelWidth({
        baseWidth: 480,
        locale,
        direction: uiTextDirection,
        uiFontScale,
        density: action === 'delete' ? 'compact' : 'standard',
        minWidth: 360,
        maxWidth: 760,
        ...(viewportWidth !== undefined ? { viewportWidth } : {}),
      }),
    [action, locale, uiFontScale, uiTextDirection, viewportWidth],
  );
  const panelMinWidth = useMemo(
    () => Math.max(280, Math.round(panelDefaultWidth * 0.78)),
    [panelDefaultWidth],
  );
  const dialogAutoWidth = useMemo(
    () => Math.max(360, Math.min(760, panelDefaultWidth)),
    [panelDefaultWidth],
  );
  const actionMessages = getLayerActionPopoverMessages(locale);
  const { languageOptions, resolveLanguageCode, resolveLanguageDisplayName } =
    useLanguageCatalogLabelMap(locale);
  const defaultLanguageSeed = useMemo(
    () =>
      buildLanguageInputSeed(
        defaultLanguageId,
        locale,
        resolveLanguageDisplayName,
        resolveLanguageCode,
      ),
    [defaultLanguageId, locale, resolveLanguageCode, resolveLanguageDisplayName],
  );
  const normalizedDefaultOrthographyId = useMemo(
    () => defaultOrthographyId?.trim() ?? '',
    [defaultOrthographyId],
  );
  const [languageInput, setLanguageInput] = useState<LanguageIsoInputValue>(defaultLanguageSeed);
  const [orthographyId, setOrthographyId] = useState(normalizedDefaultOrthographyId);
  const [dialect, setDialect] = useState('');
  const [vernacular, setVernacular] = useState('');
  const [alias, setAlias] = useState('');
  const [modality, setModality] = useState<'text' | 'audio' | 'mixed'>('text');
  const [constraint, setConstraint] = useState<LayerConstraint>('symbolic_association');
  const [bridgeId, setBridgeId] = useState('');
  const [participantId, setParticipantId] = useState('');
  const [dataCategory, setDataCategory] = useState('');
  const [delimiter, setDelimiter] = useState('');
  const [sortOrderInput, setSortOrderInput] = useState('');
  const [accessRights, setAccessRights] = useState<'open' | 'restricted' | 'confidential'>('open');
  const [isDefaultLayer, setIsDefaultLayer] = useState(false);
  const [selectedParentLayerId, setSelectedParentLayerId] = useState('');
  const [translationHostIds, setTranslationHostIds] = useState<string[]>([]);
  const [preferredTranslationHostId, setPreferredTranslationHostId] = useState('');
  const [translationLinkType, setTranslationLinkType] =
    useState<LayerLinkDocType['linkType']>('free');
  const [deleteLayerId, setDeleteLayerId] = useState(layerId ?? '');
  const [isLoading, setIsLoading] = useState(false);
  const [createFailureMessage, setCreateFailureMessage] = useState('');
  const [editingTierSnapshot, setEditingTierSnapshot] = useState({
    participantId: '',
    dataCategory: '',
    delimiter: '',
    sortOrderInput: '',
  });
  const [deleteConfirm, setDeleteConfirm] = useState<{
    layerId: string;
    layerName: string;
    textCount: number;
  } | null>(null);
  const fieldIdPrefix = useId();
  const pendingDefaultOrthographyIdRef = React.useRef(normalizedDefaultOrthographyId);
  const lastInitializedFormKeyRef = React.useRef<string | null>(null);

  // Sync deleteLayerId when layerId changes
  useEffect(() => {
    if (layerId) setDeleteLayerId(layerId);
  }, [layerId]);

  const isEditMetadataAction =
    action === 'edit-transcription-metadata' || action === 'edit-translation-metadata';
  const editingLayer = useMemo(
    () =>
      isEditMetadataAction && layerId
        ? deletableLayers.find((layer) => layer.id === layerId)
        : undefined,
    [deletableLayers, isEditMetadataAction, layerId],
  );
  const isEditingTranslationLayer =
    isEditMetadataAction && editingLayer?.layerType === 'translation';
  const isEditingTranscriptionLayer =
    isEditMetadataAction && editingLayer?.layerType === 'transcription';
  const editingLanguageSeed = useMemo(
    () =>
      buildLanguageInputSeed(
        editingLayer?.languageId,
        locale,
        resolveLanguageDisplayName,
        resolveLanguageCode,
      ),
    [editingLayer?.languageId, locale, resolveLanguageCode, resolveLanguageDisplayName],
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
      const preferredHostId = getPreferredHostTranscriptionLayerIdForTranslation(
        clickedLayer.id,
        layerLinks,
        tidByKey,
      );
      if (
        preferredHostId &&
        independentParentLayers.some((layer) => layer.id === preferredHostId)
      ) {
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
    () =>
      `${action}::${layerId ?? ''}::${contextualParentLayerId}::${defaultLanguageId?.trim().toLowerCase() ?? ''}::${normalizedDefaultOrthographyId}`,
    [action, contextualParentLayerId, defaultLanguageId, layerId, normalizedDefaultOrthographyId],
  );
  const resolvedLanguageId = useMemo(
    () => normalizeLanguageInputAssetId(languageInput),
    [languageInput],
  );
  const displayedLanguage = useMemo(
    () => getDisplayedLanguageInputLabel(languageInput),
    [languageInput],
  );
  const orthographyPicker = useOrthographyPicker(
    resolvedLanguageId,
    orthographyId,
    setOrthographyId,
  );
  const groupedOrthographyOptions = useMemo(
    () => groupOrthographiesForSelect(orthographyPicker.orthographies),
    [orthographyPicker.orthographies],
  );
  const selectedOrthography = useMemo(
    () => orthographyPicker.orthographies.find((item) => item.id === orthographyId),
    [orthographyId, orthographyPicker.orthographies],
  );
  const selectedOrthographyBadge = useMemo(
    () =>
      selectedOrthography ? getOrthographyCatalogBadgeInfo(locale, selectedOrthography) : null,
    [locale, selectedOrthography],
  );
  // 内联 ISO 639-3 校验，与 ProjectSetupDialog 对齐（纯 ISO 码而非 assetId） | Inline ISO 639-3 validation, aligned with ProjectSetupDialog (pure ISO code, not assetId)
  const effectiveLangForValidation = normalizeLanguageInputCode(languageInput);
  const customLanguageError =
    effectiveLangForValidation && !isKnownIso639_3Code(effectiveLangForValidation)
      ? actionMessages.invalidLanguageCode
      : '';
  const orthographySelectionError =
    orthographyId && !orthographyPicker.isCreating && !selectedOrthography
      ? actionMessages.invalidOrthographySelection
      : '';
  const baselineLanguageSeed = isEditMetadataAction ? editingLanguageSeed : defaultLanguageSeed;

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
      const transcriptionIdByKey = buildTranscriptionIdByKeyMap(
        deletableLayers.filter((layer) => layer.layerType === 'transcription'),
      );
      const editingTranslationHostIds =
        editingLayer?.layerType === 'translation'
          ? getHostTranscriptionLayerIdsForTranslation(
              editingLayer.id,
              layerLinks,
              transcriptionIdByKey,
            )
          : [];
      const editingPreferredHostId =
        editingLayer?.layerType === 'translation'
          ? (getPreferredHostTranscriptionLayerIdForTranslation(
              editingLayer.id,
              layerLinks,
              transcriptionIdByKey,
            ) ??
            editingTranslationHostIds[0] ??
            '')
          : '';
      const editingPreferredLinkType =
        editingLayer?.layerType === 'translation'
          ? (layerLinks.find((link) => link.layerId === editingLayer.id && link.isPreferred)
              ?.linkType ??
            layerLinks.find((link) => link.layerId === editingLayer.id)?.linkType ??
            'free')
          : 'free';

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
      if (independentParentLayers.length === 1) {
        const onlyId = independentParentLayers[0]!.id;
        setTranslationHostIds([onlyId]);
        setPreferredTranslationHostId(onlyId);
      } else {
        const seed =
          contextualParentLayerId &&
          independentParentLayers.some((layer) => layer.id === contextualParentLayerId)
            ? [contextualParentLayerId]
            : [];
        setTranslationHostIds(seed);
        setPreferredTranslationHostId(seed[0] ?? '');
      }
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
    layerLinks,
    locale,
    normalizedDefaultOrthographyId,
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
  }, [editingLayer?.id, editingLayer?.sortOrder, isEditMetadataAction]);

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
    resolvedLanguageId,
  ]);

  // Keep refs synchronized with state to avoid stale closures | 保持 ref 与 state 同步，避免闭包过期

  const needsTranscriptionDependentParent =
    (action === 'create-transcription' || isEditingTranscriptionLayer) &&
    constraint === 'symbolic_association';
  const autoTranscriptionParentLayer =
    needsTranscriptionDependentParent && independentParentLayers.length === 1
      ? independentParentLayers[0]
      : undefined;
  const resolvedTranscriptionParentLayerId = needsTranscriptionDependentParent
    ? (autoTranscriptionParentLayer?.id ?? selectedParentLayerId)
    : '';
  const autoTranslationHostLayer =
    (action === 'create-translation' || isEditingTranslationLayer) &&
    independentParentLayers.length === 1
      ? independentParentLayers[0]
      : undefined;

  useEffect(() => {
    if (action !== 'create-translation' && !isEditingTranslationLayer) return;
    setPreferredTranslationHostId((pref) => {
      if (translationHostIds.length === 0) return '';
      if (pref && translationHostIds.includes(pref)) return pref;
      return translationHostIds[0]!;
    });
  }, [action, isEditingTranslationLayer, translationHostIds]);

  const toggleTranslationHost = useCallback(
    (hostId: string, checked: boolean) => {
      const order = independentParentLayers.map((layer) => layer.id);
      setTranslationHostIds((prev) => {
        const nextIds = new Set(checked ? [...prev, hostId] : prev.filter((id) => id !== hostId));
        return order.filter((id) => nextIds.has(id));
      });
    },
    [independentParentLayers],
  );

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
  ]);

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
    const existingTranscriptionCount = deletableLayers.filter(
      (layer) => layer.layerType === 'transcription',
    ).length;
    const canConfigureTranscriptionConstraint =
      action === 'create-transcription' && existingTranscriptionCount > 0;
    const resolvedConstraint =
      action === 'create-translation'
        ? 'symbolic_association'
        : canConfigureTranscriptionConstraint
          ? constraint
          : undefined;
    const createLayerType = action === 'create-transcription' ? 'transcription' : 'translation';
    const hasSupportedParent = independentParentLayers.length > 0;
    const preferredTranslationHostForPayload =
      preferredTranslationHostId && translationHostIds.includes(preferredTranslationHostId)
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
      const translationHostConfig =
        createLayerType === 'translation' && translationHostIds.length > 0
          ? {
              hostTranscriptionLayerIds: translationHostIds,
              ...(preferredTranslationHostForPayload
                ? { preferredHostTranscriptionLayerId: preferredTranslationHostForPayload }
                : {}),
            }
          : {};
      const success = await createLayer(
        createLayerType,
        {
          languageId: resolvedLang,
          ...(orthographyId ? { orthographyId } : {}),
          ...(dialect.trim() ? { dialect: dialect.trim() } : {}),
          ...(vernacular.trim() ? { vernacular: vernacular.trim() } : {}),
          ...(alias.trim() ? { alias: alias.trim() } : {}),
          ...(resolvedConstraint ? { constraint: resolvedConstraint } : {}),
          ...translationHostConfig,
          ...(createLayerType === 'transcription' && resolvedTranscriptionParentLayerId
            ? { parentLayerId: resolvedTranscriptionParentLayerId }
            : {}),
        },
        action === 'create-translation' || action === 'create-transcription' ? modality : undefined,
      );
      if (success) {
        onClose();
        return;
      }
      setCreateFailureMessage(
        resolveCreateFailureText(
          immediateGuard.reason ?? layerCreateMessage,
          getCreateFallbackMessage(action, actionMessages),
          actionMessages.createFailedPrefix,
          actionMessages.createdPrefix,
        ),
      );
    } catch (error) {
      setCreateFailureMessage(
        resolveCreateFailureText(
          error instanceof Error ? error.message : '',
          getCreateFallbackMessage(action, actionMessages),
          actionMessages.createFailedPrefix,
          actionMessages.createdPrefix,
        ),
      );
    } finally {
      setIsLoading(false);
    }
  }, [
    resolvedLanguageId,
    customLanguageError,
    orthographySelectionError,
    orthographyId,
    dialect,
    vernacular,
    alias,
    modality,
    constraint,
    action,
    createLayer,
    deletableLayers,
    independentParentLayers.length,
    layerCreateMessage,
    onClose,
    preferredTranslationHostId,
    resolvedTranscriptionParentLayerId,
    translationHostIds,
    actionMessages,
  ]);

  const handleDelete = useCallback(async () => {
    if (!deleteLayerId) return;
    const layer = deletableLayers.find((l) => l.id === deleteLayerId);
    const layerName =
      (layer ? readAnyMultiLangLabel(layer.name) : undefined) ?? layer?.key ?? deleteLayerId;

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
  }, [
    deleteLayerId,
    deletableLayers,
    checkLayerHasContent,
    deleteLayerWithoutConfirm,
    deleteLayer,
    onClose,
  ]);

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
    if (!resolvedLanguageId) {
      setCreateFailureMessage(actionMessages.metadataLanguageRequired);
      return;
    }
    if (customLanguageError) {
      setCreateFailureMessage(customLanguageError);
      return;
    }
    if (orthographySelectionError) {
      setCreateFailureMessage(orthographySelectionError);
      return;
    }
    if (isEditingTranslationLayer && translationHostIds.length === 0) {
      setCreateFailureMessage(actionMessages.translationHostLayersRequired);
      return;
    }
    if (
      isEditingTranscriptionLayer &&
      constraint === 'symbolic_association' &&
      independentParentLayers.length > 1 &&
      !resolvedTranscriptionParentLayerId
    ) {
      setCreateFailureMessage(actionMessages.transcriptionParentRequired);
      return;
    }

    const parsedSortOrder = sortOrderInput.trim();
    const normalizedSortOrder = parsedSortOrder.length > 0 ? Number(parsedSortOrder) : null;
    if (
      normalizedSortOrder !== null &&
      (!Number.isInteger(normalizedSortOrder) || normalizedSortOrder < 0)
    ) {
      setCreateFailureMessage(actionMessages.sortOrderInvalid);
      return;
    }

    setCreateFailureMessage('');
    setIsLoading(true);
    try {
      const metadataInput: LayerMetadataUpdateInput = {
        languageId: resolvedLanguageId,
        orthographyId: orthographyId.trim(),
        dialect: dialect.trim(),
        vernacular: vernacular.trim(),
        alias: alias.trim(),
        modality,
        bridgeId: bridgeId.trim(),
        participantId: participantId.trim(),
        dataCategory: dataCategory.trim(),
        delimiter: delimiter,
        ...(normalizedSortOrder !== null ? { sortOrder: normalizedSortOrder } : {}),
        accessRights,
        isDefault: isDefaultLayer,
        ...(isEditingTranscriptionLayer
          ? {
              constraint,
              parentLayerId:
                constraint === 'symbolic_association' ? resolvedTranscriptionParentLayerId : '',
            }
          : {}),
        ...(isEditingTranslationLayer
          ? {
              hostTranscriptionLayerIds: translationHostIds,
              preferredHostTranscriptionLayerId: preferredTranslationHostId,
              linkType: translationLinkType,
            }
          : {}),
      };
      const success = await updateLayerMetadata(layerId, {
        ...metadataInput,
      });
      if (success) {
        onClose();
        return;
      }
      setCreateFailureMessage(actionMessages.genericActionFailed);
    } catch (error) {
      setCreateFailureMessage(
        error instanceof Error ? error.message : actionMessages.genericActionFailed,
      );
    } finally {
      setIsLoading(false);
    }
  }, [
    accessRights,
    actionMessages.genericActionFailed,
    actionMessages.metadataLanguageRequired,
    actionMessages.translationHostLayersRequired,
    actionMessages.transcriptionParentRequired,
    alias,
    bridgeId,
    constraint,
    customLanguageError,
    dataCategory,
    delimiter,
    dialect,
    independentParentLayers.length,
    isDefaultLayer,
    isEditMetadataAction,
    isEditingTranscriptionLayer,
    isEditingTranslationLayer,
    layerId,
    modality,
    onClose,
    orthographyId,
    orthographySelectionError,
    preferredTranslationHostId,
    participantId,
    resolvedLanguageId,
    resolvedTranscriptionParentLayerId,
    sortOrderInput,
    actionMessages.sortOrderInvalid,
    translationHostIds,
    translationLinkType,
    updateLayerMetadata,
    vernacular,
  ]);

  const handleResetForm = useCallback(() => {
    if (isEditMetadataAction) {
      const transcriptionIdByKey = buildTranscriptionIdByKeyMap(
        deletableLayers.filter((layer) => layer.layerType === 'transcription'),
      );
      const editingTranslationHostIds =
        editingLayer?.layerType === 'translation'
          ? getHostTranscriptionLayerIdsForTranslation(
              editingLayer.id,
              layerLinks,
              transcriptionIdByKey,
            )
          : [];
      const editingPreferredHostId =
        editingLayer?.layerType === 'translation'
          ? (getPreferredHostTranscriptionLayerIdForTranslation(
              editingLayer.id,
              layerLinks,
              transcriptionIdByKey,
            ) ??
            editingTranslationHostIds[0] ??
            '')
          : '';
      const editingPreferredLinkType =
        editingLayer?.layerType === 'translation'
          ? (layerLinks.find((link) => link.layerId === editingLayer.id && link.isPreferred)
              ?.linkType ??
            layerLinks.find((link) => link.layerId === editingLayer.id)?.linkType ??
            'free')
          : 'free';
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
      setParticipantId(editingTierSnapshot.participantId);
      setDataCategory(editingTierSnapshot.dataCategory);
      setDelimiter(editingTierSnapshot.delimiter);
      setSortOrderInput(editingTierSnapshot.sortOrderInput);
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
    setBridgeId('');
    setParticipantId('');
    setDataCategory('');
    setDelimiter('');
    setSortOrderInput('');
    setAccessRights('open');
    setIsDefaultLayer(false);
    setSelectedParentLayerId(contextualParentLayerId);
    if (action === 'create-translation') {
      if (independentParentLayers.length === 1) {
        const onlyId = independentParentLayers[0]!.id;
        setTranslationHostIds([onlyId]);
        setPreferredTranslationHostId(onlyId);
      } else {
        const seed =
          contextualParentLayerId &&
          independentParentLayers.some((layer) => layer.id === contextualParentLayerId)
            ? [contextualParentLayerId]
            : [];
        setTranslationHostIds(seed);
        setPreferredTranslationHostId(seed[0] ?? '');
      }
    } else {
      setTranslationHostIds([]);
      setPreferredTranslationHostId('');
    }
    setTranslationLinkType('free');
    setCreateFailureMessage('');
  }, [
    action,
    contextualParentLayerId,
    defaultLanguageSeed,
    deletableLayers,
    editingLanguageSeed,
    editingLayer,
    editingTierSnapshot,
    independentParentLayers,
    isEditMetadataAction,
    layerLinks,
    locale,
    normalizedDefaultOrthographyId,
  ]);

  const label =
    action === 'create-transcription'
      ? actionMessages.createTranscriptionLayer
      : action === 'create-translation'
        ? actionMessages.createTranslationLayer
        : action === 'edit-transcription-metadata' || action === 'edit-translation-metadata'
          ? actionMessages.editLayerMetadata
          : actionMessages.deleteLayer;

  const existingTranscriptionCount = deletableLayers.filter(
    (layer) => layer.layerType === 'transcription',
  ).length;
  const resolvedLangForGuard = resolvedLanguageId.trim();
  const hasValidLanguage = resolvedLangForGuard.length > 0;
  const showConstraintSelector =
    action === 'create-transcription' && existingTranscriptionCount > 0;
  const preferredTranslationHostResolved =
    preferredTranslationHostId && translationHostIds.includes(preferredTranslationHostId)
      ? preferredTranslationHostId
      : translationHostIds[0];
  const translationGuard =
    action === 'create-translation'
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
  const transcriptionGuard =
    action === 'create-transcription'
      ? getLayerCreateGuard(deletableLayers, 'transcription', {
          languageId: resolvedLangForGuard,
          alias,
          modality,
          ...(showConstraintSelector ? { constraint } : {}),
          ...(resolvedTranscriptionParentLayerId
            ? { parentLayerId: resolvedTranscriptionParentLayerId }
            : {}),
          hasSupportedParent: independentParentLayers.length > 0,
        })
      : { allowed: true };
  const translationCreateDisabledReason =
    action === 'create-translation'
      ? translationGuard.allowed
        ? ''
        : (translationGuard.reasonShort ?? actionMessages.translationCreateUnavailable)
      : '';
  const transcriptionCreateDisabledReason =
    action === 'create-transcription'
      ? transcriptionGuard.allowed
        ? ''
        : (transcriptionGuard.reasonShort ?? actionMessages.transcriptionCreateUnavailable)
      : '';
  const createGuardByConstraint = (candidate: LayerConstraint) => {
    if (action === 'delete') return { allowed: true };
    const optionParentLayerId =
      candidate === 'independent_boundary'
        ? undefined
        : resolvedTranscriptionParentLayerId || independentParentLayers[0]?.id;
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
  const createLanguageRequiredMessage =
    action === 'create-translation'
      ? actionMessages.translationLanguageRequired
      : actionMessages.transcriptionLanguageRequired;
  const createLanguageRequiredText = createLanguageRequiredMessage.startsWith(
    actionMessages.requiredPrefix,
  )
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
      disabled={
        action === 'create-translation'
          ? isLoading ||
            orthographyPicker.submitting ||
            orthographyPicker.isCreating ||
            !hasValidLanguage ||
            Boolean(customLanguageError) ||
            Boolean(orthographySelectionError) ||
            translationCreateDisabledReason.length > 0
          : isLoading ||
            orthographyPicker.submitting ||
            orthographyPicker.isCreating ||
            !hasValidLanguage ||
            Boolean(customLanguageError) ||
            Boolean(orthographySelectionError) ||
            transcriptionCreateDisabledReason.length > 0
      }
      onClick={handleCreate}
    >
      {label}
    </PanelButton>
  );
  /* 面包屑标题 + 构建器专属 footer | Breadcrumb title + builder-specific footer */
  const builderMessages = getOrthographyBuilderMessages(locale);
  const builderBreadcrumbTitle = (
    <span className="dialog-breadcrumb-title">
      <button
        type="button"
        className="dialog-breadcrumb-back"
        onClick={orthographyPicker.cancelCreate}
        aria-label={label}
      >
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
        onClick={() => {
          void orthographyPicker.createOrthography();
        }}
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
      <PanelButton
        variant="ghost"
        onClick={deleteConfirm ? handleCancelDelete : onClose}
        disabled={isLoading}
      >
        {actionMessages.cancel}
      </PanelButton>
      <PanelButton
        variant="danger"
        disabled={deleteConfirm ? isLoading : !deleteLayerId || isLoading}
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
  const deleteLayerFieldId = `${fieldIdPrefix}-delete-layer`;

  const popover = (
    <DialogOverlay onClose={onClose} topmost closeOn="mousedown">
      <DialogShell
        className={`layer-action-dialog${orthographyPicker.isCreating ? ' orthography-builder-dialog-host' : ''}`}
        layoutStyle={
          {
            '--dialog-auto-width': orthographyPicker.isCreating
              ? '540px'
              : `${Math.max(panelMinWidth, dialogAutoWidth)}px`,
          } as React.CSSProperties
        }
        bodyClassName="layer-action-dialog-body"
        title={orthographyPicker.isCreating ? builderBreadcrumbTitle : label}
        headerClassName="layer-action-dialog-header"
        actions={
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
        }
        footer={
          action === 'delete'
            ? deleteFooter
            : isEditMetadataAction
              ? editFooter
              : orthographyPicker.isCreating
                ? builderFooter
                : createFooter
        }
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
              description={
                deleteConfirm
                  ? actionMessages.deleteLayerConfirmMessage(
                      deleteConfirm.layerName,
                      deleteConfirm.textCount,
                    )
                  : actionMessages.deleteLayer
              }
              meta={summaryMeta}
            />
            <PanelSection className="layer-action-dialog-section">
              {deleteConfirm ? (
                <p className="layer-action-dialog-copy">
                  {actionMessages.deleteLayerConfirmMessage(
                    deleteConfirm.layerName,
                    deleteConfirm.textCount,
                  )}
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
              actionMessages.orthographyContextLayerType(
                action === 'create-translation'
                  ? actionMessages.translationLayerType
                  : actionMessages.transcriptionLayerType,
              ),
            ]}
          />
        ) : (
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
            showConstraintSelector={showConstraintSelector}
            constraint={constraint}
            setConstraint={setConstraint}
            symbolicConstraintGuard={symbolicConstraintGuard}
            independentConstraintGuard={independentConstraintGuard}
            selectedParentLayerId={selectedParentLayerId}
            setSelectedParentLayerId={setSelectedParentLayerId}
            autoTranscriptionParentLayer={autoTranscriptionParentLayer}
            showCreateFailure={showCreateFailure}
            createFailureMessage={createFailureMessage}
            translationCreateDisabledReason={translationCreateDisabledReason}
            transcriptionCreateDisabledReason={transcriptionCreateDisabledReason}
            hasValidLanguage={hasValidLanguage}
            createLanguageRequiredText={createLanguageRequiredText}
          />
        )}
      </DialogShell>
    </DialogOverlay>
  );

  return ReactDOM.createPortal(popover, document.body);
});
