import React, { useId, useMemo, useState } from 'react';
import { type LayerConstraint, type LayerLinkDocType } from '../../db';
import type { LanguageIsoInputValue } from '../LanguageIsoInput';
import {
  groupOrthographiesForSelect,
  useOrthographyPicker,
} from '../../hooks/orthography/useOrthographyPicker';
import { useLanguageCatalogLabelMap } from '../../hooks/languageCatalog/useLanguageCatalogLabelMap';
import { useLocale } from '../../i18n';
import { getLayerActionPopoverMessages } from '../../i18n/messages';
import { getOrthographyCatalogBadgeInfo } from '../orthographyCatalogUi';
import {
  buildLanguageInputSeed,
  getDisplayedLanguageInputLabel,
  normalizeLanguageInputAssetId,
  normalizeLanguageInputCode,
} from '../../utils/languageInputHostState';
import { isKnownIso639_3Code } from '../../utils/langMapping';
import { computeAdaptivePanelWidth } from '../../utils/panelAdaptiveLayout';
import { useUiFontScaleRuntime } from '~/hooks/ui/useUiFontScaleRuntime';
import { useViewportWidth } from '~/hooks/ui/useViewportWidth';
import {
  buildFormInitializationKey,
  computeContextualParentLayerId,
  computeIndependentParentLayers,
} from './layerActionPopoverFormDerivations';
import type { LayerActionPopoverProps } from './LayerActionPopoverTypes';

export function useLayerActionPopoverFormState(props: LayerActionPopoverProps) {
  const {
    action,
    layerId,
    deletableLayers,
    defaultLanguageId,
    defaultOrthographyId,
    layerLinks = [],
  } = props;

  const locale = useLocale();
  const { uiTextDirection, uiFontScale } = useUiFontScaleRuntime(locale);
  const viewportWidth = useViewportWidth();
  const { panelDefaultWidth, panelMinWidth, dialogAutoWidth } = useMemo(() => {
    const panelDefaultWidthInner = computeAdaptivePanelWidth({
      baseWidth: 480,
      locale,
      direction: uiTextDirection,
      uiFontScale,
      density: action === 'delete' ? 'compact' : 'standard',
      minWidth: 360,
      maxWidth: 760,
      ...(viewportWidth !== undefined ? { viewportWidth } : {}),
    });
    return {
      panelDefaultWidth: panelDefaultWidthInner,
      panelMinWidth: Math.max(280, Math.round(panelDefaultWidthInner * 0.78)),
      dialogAutoWidth: Math.max(360, Math.min(760, panelDefaultWidthInner)),
    };
  }, [action, locale, uiFontScale, uiTextDirection, viewportWidth]);
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

  const independentParentLayers = useMemo(
    () => computeIndependentParentLayers(deletableLayers),
    [deletableLayers],
  );
  const contextualParentLayerId = useMemo(
    () =>
      computeContextualParentLayerId({
        layerId,
        deletableLayers,
        layerLinks,
        independentParentLayers,
      }),
    [deletableLayers, independentParentLayers, layerId, layerLinks],
  );
  const formInitializationKey = useMemo(
    () =>
      buildFormInitializationKey({
        action,
        layerId,
        contextualParentLayerId,
        normalizedDefaultOrthographyId,
        ...(defaultLanguageId !== undefined ? { defaultLanguageId } : {}),
      }),
    [action, contextualParentLayerId, defaultLanguageId, layerId, normalizedDefaultOrthographyId],
  );
  const { resolvedLanguageId, displayedLanguage } = useMemo(
    () => ({
      resolvedLanguageId: normalizeLanguageInputAssetId(languageInput),
      displayedLanguage: getDisplayedLanguageInputLabel(languageInput),
    }),
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
  const { selectedOrthography, selectedOrthographyBadge } = useMemo(() => {
    const selected = orthographyPicker.orthographies.find((item) => item.id === orthographyId);
    return {
      selectedOrthography: selected,
      selectedOrthographyBadge: selected ? getOrthographyCatalogBadgeInfo(locale, selected) : null,
    };
  }, [locale, orthographyId, orthographyPicker.orthographies]);
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

  return {
    locale,
    uiTextDirection,
    uiFontScale,
    panelDefaultWidth,
    panelMinWidth,
    dialogAutoWidth,
    actionMessages,
    languageOptions,
    resolveLanguageCode,
    resolveLanguageDisplayName,
    defaultLanguageSeed,
    normalizedDefaultOrthographyId,
    languageInput,
    setLanguageInput,
    orthographyId,
    setOrthographyId,
    dialect,
    setDialect,
    vernacular,
    setVernacular,
    alias,
    setAlias,
    modality,
    setModality,
    constraint,
    setConstraint,
    bridgeId,
    setBridgeId,
    participantId,
    setParticipantId,
    dataCategory,
    setDataCategory,
    delimiter,
    setDelimiter,
    sortOrderInput,
    setSortOrderInput,
    accessRights,
    setAccessRights,
    isDefaultLayer,
    setIsDefaultLayer,
    selectedParentLayerId,
    setSelectedParentLayerId,
    translationHostIds,
    setTranslationHostIds,
    preferredTranslationHostId,
    setPreferredTranslationHostId,
    translationLinkType,
    setTranslationLinkType,
    deleteLayerId,
    setDeleteLayerId,
    isLoading,
    setIsLoading,
    createFailureMessage,
    setCreateFailureMessage,
    editingTierSnapshot,
    setEditingTierSnapshot,
    deleteConfirm,
    setDeleteConfirm,
    fieldIdPrefix,
    pendingDefaultOrthographyIdRef,
    lastInitializedFormKeyRef,
    isEditMetadataAction,
    editingLayer,
    isEditingTranslationLayer,
    isEditingTranscriptionLayer,
    editingLanguageSeed,
    independentParentLayers,
    contextualParentLayerId,
    formInitializationKey,
    resolvedLanguageId,
    displayedLanguage,
    orthographyPicker,
    groupedOrthographyOptions,
    selectedOrthography,
    selectedOrthographyBadge,
    customLanguageError,
    orthographySelectionError,
    baselineLanguageSeed,
    needsTranscriptionDependentParent,
    autoTranscriptionParentLayer,
    resolvedTranscriptionParentLayerId,
    autoTranslationHostLayer,
  };
}

export type LayerActionPopoverFormState = ReturnType<typeof useLayerActionPopoverFormState>;
