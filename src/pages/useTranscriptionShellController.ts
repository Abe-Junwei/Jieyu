import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AnalysisBottomTab } from '../components/AiAnalysisPanel';
import type { LayerDocType, LayerLinkDocType } from '../db';
import { useLayerActionPanel } from '../hooks/useLayerActionPanel';
import type { LayerCreateInput } from '../hooks/transcriptionTypes';
import { useDialogs } from '../hooks/useDialogs';
import { usePanelToggles } from '../hooks/usePanelToggles';
import { APP_SHELL_OPEN_SEARCH_EVENT, type AppShellOpenSearchDetail } from '../utils/appShellEvents';
import { buildLayerLinkConnectorLayout } from '../utils/layerLinkConnector';
import { LinguisticService } from '../services/LinguisticService';
import { createPdfPreviewOpenRequest } from './TranscriptionPage.runtimeProps';
import type { PdfPreviewOpenRequest } from './TranscriptionPage.runtimeContracts';

interface DialogUtteranceLike {
  textId: string;
}

interface UseTranscriptionShellControllerInput {
  utterances: DialogUtteranceLike[];
  appSearchRequest?: AppShellOpenSearchDetail | null;
  onConsumeAppSearchRequest?: () => void;
  selectedLayerId?: string;
  setSelectedLayerId: (layerId: string) => void;
  orderedLayers: LayerDocType[];
  layerLinks: LayerLinkDocType[];
  deletableLayers: Array<{ id: string; layerType?: 'transcription' | 'translation' }>;
  layerCreateMessage: string;
  setLayerCreateMessage: (message: string) => void;
  createLayer: (
    type: 'transcription' | 'translation',
    config: LayerCreateInput,
    modality?: 'text' | 'audio' | 'mixed',
  ) => Promise<boolean>;
  deleteLayer: (layerId: string, options?: { keepUtterances?: boolean }) => Promise<void>;
  deleteLayerWithoutConfirm?: (layerId: string) => Promise<void>;
  checkLayerHasContent?: (layerId: string) => Promise<number>;
}

interface UseTranscriptionShellControllerResult {
  focusedLayerRowId: string;
  flashLayerRowId: string;
  setFocusedLayerRowId: React.Dispatch<React.SetStateAction<string>>;
  setFlashLayerRowId: React.Dispatch<React.SetStateAction<string>>;
  showAllLayerConnectors: boolean;
  handleToggleAllLayerConnectors: () => void;
  pdfPreviewRequest: PdfPreviewOpenRequest | null;
  setPdfPreviewRequest: React.Dispatch<React.SetStateAction<PdfPreviewOpenRequest | null>>;
  openPdfPreviewRequest: (input: {
    title: string;
    page: number | null;
    sourceUrl?: string;
    sourceBlob?: Blob;
    hashSuffix?: string;
    searchSnippet?: string;
  }) => void;
  isLayerRailCollapsed: boolean;
  setIsLayerRailCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  isAiPanelCollapsed: boolean;
  setIsAiPanelCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  layerRailWidth: number;
  setLayerRailWidth: React.Dispatch<React.SetStateAction<number>>;
  aiPanelWidth: number;
  setAiPanelWidth: React.Dispatch<React.SetStateAction<number>>;
  handleLayerRailToggle: (e?: React.SyntheticEvent<HTMLElement>) => void;
  handleAiPanelToggle: (e?: React.SyntheticEvent<HTMLElement>) => void;
  isHubCollapsed: boolean;
  hubHeight: number;
  setHubHeight: React.Dispatch<React.SetStateAction<number>>;
  analysisTab: AnalysisBottomTab;
  setAnalysisTab: React.Dispatch<React.SetStateAction<AnalysisBottomTab>>;
  hubSidebarTab: 'assistant' | 'analysis';
  setHubSidebarTab: React.Dispatch<React.SetStateAction<'assistant' | 'analysis'>>;
  showProjectSetup: boolean;
  setShowProjectSetup: React.Dispatch<React.SetStateAction<boolean>>;
  showAudioImport: boolean;
  setShowAudioImport: React.Dispatch<React.SetStateAction<boolean>>;
  showSearch: boolean;
  setShowSearch: React.Dispatch<React.SetStateAction<boolean>>;
  showUndoHistory: boolean;
  setShowUndoHistory: React.Dispatch<React.SetStateAction<boolean>>;
  activeTextId: string | null;
  setActiveTextId: React.Dispatch<React.SetStateAction<string | null>>;
  activeTextPrimaryLanguageId: string | null;
  getActiveTextId: () => Promise<string | null>;
  getActiveTextPrimaryLanguageId: () => Promise<string | null>;
  searchOverlayRequest: AppShellOpenSearchDetail | null;
  setSearchOverlayRequest: React.Dispatch<React.SetStateAction<AppShellOpenSearchDetail | null>>;
  openSearchFromRequest: (detail?: AppShellOpenSearchDetail) => void;
  createLayerWithActiveContext: UseTranscriptionShellControllerInput['createLayer'];
  layerAction: ReturnType<typeof useLayerActionPanel>;
  handleFocusLayerRow: (id: string) => void;
}

export function useTranscriptionShellController(
  input: UseTranscriptionShellControllerInput,
): UseTranscriptionShellControllerResult {
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

  const openPdfPreviewRequest = useCallback((nextInput: {
    title: string;
    page: number | null;
    sourceUrl?: string;
    sourceBlob?: Blob;
    hashSuffix?: string;
    searchSnippet?: string;
  }) => {
    pdfPreviewRequestNonceRef.current += 1;
    setPdfPreviewRequest(createPdfPreviewOpenRequest({
      nonce: pdfPreviewRequestNonceRef.current,
      title: nextInput.title,
      page: nextInput.page,
      ...(nextInput.sourceUrl ? { sourceUrl: nextInput.sourceUrl } : {}),
      ...(nextInput.sourceBlob ? { sourceBlob: nextInput.sourceBlob } : {}),
      ...(nextInput.hashSuffix ? { hashSuffix: nextInput.hashSuffix } : {}),
      ...(nextInput.searchSnippet ? { searchSnippet: nextInput.searchSnippet } : {}),
    }));
  }, []);

  const handleFocusLayerRow = useCallback((id: string) => {
    setFocusedLayerRowId(id);
    setSelectedLayerId(id);
    if (flashLayerRowId && flashLayerRowId !== id) {
      setFlashLayerRowId('');
    }
  }, [flashLayerRowId, setSelectedLayerId]);

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
    isLayerRailCollapsed,
    setIsLayerRailCollapsed,
    isAiPanelCollapsed,
    setIsAiPanelCollapsed,
    layerRailWidth,
    setLayerRailWidth,
    aiPanelWidth,
    setAiPanelWidth,
    handleLayerRailToggle,
    handleAiPanelToggle,
    isHubCollapsed,
    hubHeight,
    setHubHeight,
  } = usePanelToggles();

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
    getActiveTextId,
    getActiveTextPrimaryLanguageId,
  } = useDialogs(input.utterances);
  const [searchOverlayRequest, setSearchOverlayRequest] = useState<AppShellOpenSearchDetail | null>(null);

  const openSearchFromRequest = useCallback((detail: AppShellOpenSearchDetail = {}) => {
    setSearchOverlayRequest(detail);
    setShowSearch(true);
  }, [setShowSearch]);

  useEffect(() => {
    if (!input.appSearchRequest) return;
    openSearchFromRequest(input.appSearchRequest);
    input.onConsumeAppSearchRequest?.();
  }, [input.appSearchRequest, input.onConsumeAppSearchRequest, openSearchFromRequest]);

  useEffect(() => {
    const handleOpenSearch = (event: Event) => {
      const detail = (event as CustomEvent<AppShellOpenSearchDetail>).detail ?? {};
      openSearchFromRequest(detail);
    };
    window.addEventListener(APP_SHELL_OPEN_SEARCH_EVENT, handleOpenSearch as EventListener);
    return () => window.removeEventListener(APP_SHELL_OPEN_SEARCH_EVENT, handleOpenSearch as EventListener);
  }, [openSearchFromRequest]);

  const createLayerWithActiveContext = useCallback<UseTranscriptionShellControllerInput['createLayer']>(async (...args) => {
    const [layerType, config, modality] = args;
    let resolvedTextId = config.textId?.trim() || activeTextId || (await getActiveTextId()) || '';
    if (!resolvedTextId) {
      const result = await LinguisticService.createProject({
        titleZh: '未命名项目',
        titleEn: 'Untitled Project',
        primaryLanguageId: config.languageId?.trim() || 'und',
        ...(config.orthographyId?.trim() ? { primaryOrthographyId: config.orthographyId.trim() } : {}),
      });
      resolvedTextId = result.textId;
      setActiveTextId(resolvedTextId);
    }
    return createLayer(layerType, {
      ...config,
      ...(resolvedTextId ? { textId: resolvedTextId } : {}),
    }, modality);
  }, [activeTextId, createLayer, getActiveTextId, setActiveTextId]);

  const layerAction = useLayerActionPanel({
    createLayer: createLayerWithActiveContext,
    deleteLayer: input.deleteLayer,
    deleteLayerWithoutConfirm: input.deleteLayerWithoutConfirm ?? input.deleteLayer,
    checkLayerHasContent: input.checkLayerHasContent ?? (async () => 0),
    deletableLayers: input.deletableLayers,
    focusedLayerRowId,
    isLayerRailCollapsed,
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
      const fallback = input.orderedLayers.find((item) => item.id === input.selectedLayerId)?.id
        ?? input.orderedLayers[0]?.id
        ?? '';
      setFocusedLayerRowId(fallback);
    }
  }, [focusedLayerRowId, input.orderedLayers, input.selectedLayerId]);

  useEffect(() => {
    if (!input.layerCreateMessage.startsWith('已创建') || input.orderedLayers.length === 0) return;
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
    isLayerRailCollapsed,
    setIsLayerRailCollapsed,
    isAiPanelCollapsed,
    setIsAiPanelCollapsed,
    layerRailWidth,
    setLayerRailWidth,
    aiPanelWidth,
    setAiPanelWidth,
    handleLayerRailToggle,
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
    getActiveTextId,
    getActiveTextPrimaryLanguageId,
    searchOverlayRequest,
    setSearchOverlayRequest,
    openSearchFromRequest,
    createLayerWithActiveContext,
    layerAction,
    handleFocusLayerRow,
  };
}