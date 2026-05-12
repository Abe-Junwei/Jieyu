import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AnalysisBottomTab } from '../components/AiAnalysisPanel';
import { useLayerActionPanel } from '~/hooks/layer/useLayerActionPanel';
import { useDialogs } from '~/hooks/dialogs/useDialogs';
import { usePanelToggles } from '~/hooks/panel/usePanelToggles';
import {
  APP_SHELL_OPEN_SEARCH_EVENT,
  type AppShellOpenSearchDetail,
} from '../utils/appShellEvents';
import { buildLayerLinkConnectorLayout } from '../utils/layerLinkConnector';
import { LinguisticService } from '../app/languageAssetPageAccess';
import { createPdfPreviewOpenRequest } from './TranscriptionPage.runtimeProps';
import type { PdfPreviewOpenRequest } from './TranscriptionPage.runtimeContracts';
import { t, useLocale } from '../i18n';
import { useTranscriptionAdaptiveSizing } from './useTranscriptionAdaptiveSizing';
import type {
  UseTranscriptionShellControllerInput,
  UseTranscriptionShellControllerResult,
} from './useTranscriptionShellController.types';

export type {
  UseTranscriptionShellControllerInput,
  UseTranscriptionShellControllerResult,
} from './useTranscriptionShellController.types';

export function useTranscriptionShellController(
  input: UseTranscriptionShellControllerInput,
): UseTranscriptionShellControllerResult {
  const locale = useLocale();
  const { layerCreateMessage, setLayerCreateMessage, setSelectedLayerId, createLayer } = input;
  const [focusedLayerRowId, setFocusedLayerRowId] = useState<string>('');
  const [flashLayerRowId, setFlashLayerRowId] = useState<string>('');
  const [showAllLayerConnectors, setShowAllLayerConnectors] = useState(true);
  const [layerConnectorVisibilityTouched, setLayerConnectorVisibilityTouched] = useState(false);
  const [pdfPreviewRequest, setPdfPreviewRequest] = useState<PdfPreviewOpenRequest | null>(null);
  const pdfPreviewRequestNonceRef = useRef(0);
  const handledLayerCreateMessageRef = useRef('');

  const hasAnyLayerConnectors = useMemo(
    () => buildLayerLinkConnectorLayout(input.orderedLayers, input.layerLinks).maxColumns > 0,
    [input.layerLinks, input.orderedLayers],
  );

  const openPdfPreviewRequest = useCallback(
    (nextInput: {
      title: string;
      page: number | null;
      sourceUrl?: string;
      sourceBlob?: Blob;
      hashSuffix?: string;
      searchSnippet?: string;
    }) => {
      pdfPreviewRequestNonceRef.current += 1;
      setPdfPreviewRequest(
        createPdfPreviewOpenRequest({
          nonce: pdfPreviewRequestNonceRef.current,
          title: nextInput.title,
          page: nextInput.page,
          ...(nextInput.sourceUrl ? { sourceUrl: nextInput.sourceUrl } : {}),
          ...(nextInput.sourceBlob ? { sourceBlob: nextInput.sourceBlob } : {}),
          ...(nextInput.hashSuffix ? { hashSuffix: nextInput.hashSuffix } : {}),
          ...(nextInput.searchSnippet ? { searchSnippet: nextInput.searchSnippet } : {}),
        }),
      );
    },
    [],
  );

  const handleFocusLayerRow = (id: string) => {
    setFocusedLayerRowId(id);
    setSelectedLayerId(id);
    if (flashLayerRowId && flashLayerRowId !== id) {
      setFlashLayerRowId('');
    }
  };

  useEffect(() => {
    if (!hasAnyLayerConnectors) {
      setShowAllLayerConnectors(false);
      return;
    }
    if (!layerConnectorVisibilityTouched) {
      setShowAllLayerConnectors(true);
    }
  }, [hasAnyLayerConnectors, layerConnectorVisibilityTouched]);

  const handleToggleAllLayerConnectors = useCallback(() => {
    if (!hasAnyLayerConnectors) return;
    setLayerConnectorVisibilityTouched(true);
    setShowAllLayerConnectors((prev) => !prev);
  }, [hasAnyLayerConnectors]);

  const {
    isAiPanelCollapsed,
    setIsAiPanelCollapsed,
    aiPanelWidth,
    setAiPanelWidth,
    handleAiPanelToggle,
    isHubCollapsed,
    hubHeight,
    setHubHeight,
  } = usePanelToggles();
  const {
    uiFontScale,
    uiFontScaleMode,
    setUiFontScale,
    resetUiFontScale,
    uiTextDirection,
    adaptiveDialogWidth,
    adaptiveDialogCompactWidth,
    adaptiveDialogWideWidth,
  } = useTranscriptionAdaptiveSizing(locale);

  const [analysisTab, setAnalysisTab] = useState<AnalysisBottomTab>('embedding');
  const [hubSidebarTab, setHubSidebarTab] = useState<'assistant' | 'analysis'>('assistant');

  const {
    showProjectSetup,
    setShowProjectSetup,
    showAudioImport,
    setShowAudioImport,
    showSearch,
    setShowSearch,
    showUndoHistory,
    setShowUndoHistory,
    activeTextId,
    setActiveTextId,
    activeTextPrimaryLanguageId,
    activeTextPrimaryOrthographyId,
    activeTextTimelineMode,
    activeTextTimeMapping,
    getActiveTextId,
    getActiveTextPrimaryLanguageId,
    getActiveTextTimelineMode,
  } = useDialogs(input.units);
  const [searchOverlayRequest, setSearchOverlayRequest] = useState<AppShellOpenSearchDetail | null>(
    null,
  );

  const openSearchFromRequest = useCallback(
    (detail: AppShellOpenSearchDetail = {}) => {
      setSearchOverlayRequest(detail);
      setShowSearch(true);
    },
    [setShowSearch],
  );

  useEffect(() => {
    if (!input.appSearchRequest) return;
    openSearchFromRequest(input.appSearchRequest);
    input.onConsumeAppSearchRequest?.();
  }, [input, openSearchFromRequest]);

  useEffect(() => {
    const handleOpenSearch = (event: Event) => {
      const detail = (event as CustomEvent<AppShellOpenSearchDetail>).detail ?? {};
      openSearchFromRequest(detail);
    };
    window.addEventListener(APP_SHELL_OPEN_SEARCH_EVENT, handleOpenSearch as EventListener);
    return () =>
      window.removeEventListener(APP_SHELL_OPEN_SEARCH_EVENT, handleOpenSearch as EventListener);
  }, [openSearchFromRequest]);

  const createLayerWithActiveContext = useCallback<
    UseTranscriptionShellControllerInput['createLayer']
  >(
    async (...args) => {
      const [layerType, config, modality] = args;
      let resolvedTextId = config.textId?.trim() || activeTextId || (await getActiveTextId()) || '';
      if (!resolvedTextId) {
        const result = await LinguisticService.projects.create({
          primaryTitle: t('zh-CN', 'transcription.project.untitledZh'),
          englishFallbackTitle: t('en-US', 'transcription.project.untitledEn'),
          primaryLanguageId: config.languageId?.trim() || 'und',
          ...(config.orthographyId?.trim()
            ? { primaryOrthographyId: config.orthographyId.trim() }
            : {}),
        });
        resolvedTextId = result.textId;
        setActiveTextId(resolvedTextId);
      }

      if (resolvedTextId) {
        const mediaItems = await LinguisticService.media.listByTextId(resolvedTextId);
        if (mediaItems.length === 0) {
          await LinguisticService.timeline.ensureDocument({ textId: resolvedTextId });
        }
      }

      return createLayer(
        layerType,
        {
          ...config,
          ...(resolvedTextId ? { textId: resolvedTextId } : {}),
        },
        modality,
      );
    },
    [activeTextId, createLayer, getActiveTextId, setActiveTextId],
  );

  const layerAction = useLayerActionPanel({
    createLayer: createLayerWithActiveContext,
    deleteLayer: input.deleteLayer,
    deleteLayerWithoutConfirm: input.deleteLayerWithoutConfirm ?? input.deleteLayer,
    checkLayerHasContent: input.checkLayerHasContent ?? (async () => 0),
    deletableLayers: input.deletableLayers,
    focusedLayerRowId,
  });

  useEffect(() => {
    if (input.orderedLayers.length === 0) {
      if (focusedLayerRowId) {
        setFocusedLayerRowId('');
      }
      return;
    }

    const exists = input.orderedLayers.some((item) => item.id === focusedLayerRowId);
    if (!exists) {
      const fallback =
        input.orderedLayers.find((item) => item.id === input.selectedLayerId)?.id ??
        input.orderedLayers[0]?.id ??
        '';
      setFocusedLayerRowId(fallback);
    }
  }, [focusedLayerRowId, input.orderedLayers, input.selectedLayerId]);

  useEffect(() => {
    if (
      !input.layerCreateMessage.startsWith(
        t('zh-CN', 'transcription.layer.messageCreatedPrefix'),
      ) ||
      input.orderedLayers.length === 0
    )
      return;
    if (handledLayerCreateMessageRef.current === input.layerCreateMessage) return;
    const latestCreatedLayer = [...input.orderedLayers].sort((a, b) => {
      const at = Date.parse(a.updatedAt || a.createdAt || '');
      const bt = Date.parse(b.updatedAt || b.createdAt || '');
      return bt - at;
    })[0];
    if (!latestCreatedLayer) return;
    handledLayerCreateMessageRef.current = input.layerCreateMessage;
    setFocusedLayerRowId((prev) => (prev === latestCreatedLayer.id ? prev : latestCreatedLayer.id));
    setFlashLayerRowId((prev) => (prev === latestCreatedLayer.id ? prev : latestCreatedLayer.id));
  }, [input.layerCreateMessage, input.orderedLayers]);

  useEffect(() => {
    if (!layerCreateMessage) {
      handledLayerCreateMessageRef.current = '';
      return;
    }
    const timer = window.setTimeout(() => {
      setLayerCreateMessage('');
    }, 3200);
    return () => window.clearTimeout(timer);
  }, [layerCreateMessage, setLayerCreateMessage]);

  return {
    focusedLayerRowId,
    flashLayerRowId,
    setFocusedLayerRowId,
    setFlashLayerRowId,
    showAllLayerConnectors,
    handleToggleAllLayerConnectors,
    pdfPreviewRequest,
    setPdfPreviewRequest,
    openPdfPreviewRequest,
    isAiPanelCollapsed,
    setIsAiPanelCollapsed,
    aiPanelWidth,
    setAiPanelWidth,
    uiFontScale,
    uiFontScaleMode,
    setUiFontScale,
    resetUiFontScale,
    uiTextDirection,
    adaptiveDialogWidth,
    adaptiveDialogCompactWidth,
    adaptiveDialogWideWidth,
    handleAiPanelToggle,
    isHubCollapsed,
    hubHeight,
    setHubHeight,
    analysisTab,
    setAnalysisTab,
    hubSidebarTab,
    setHubSidebarTab,
    showProjectSetup,
    setShowProjectSetup,
    showAudioImport,
    setShowAudioImport,
    showSearch,
    setShowSearch,
    showUndoHistory,
    setShowUndoHistory,
    activeTextId,
    setActiveTextId,
    activeTextPrimaryLanguageId,
    activeTextPrimaryOrthographyId,
    activeTextTimelineMode,
    activeTextTimeMapping,
    getActiveTextId,
    getActiveTextPrimaryLanguageId,
    getActiveTextTimelineMode,
    searchOverlayRequest,
    setSearchOverlayRequest,
    openSearchFromRequest,
    createLayerWithActiveContext,
    layerAction,
    handleFocusLayerRow,
  };
}
