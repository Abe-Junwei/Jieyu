import type { AnalysisBottomTab } from '../components/AiAnalysisPanel';
import type { LayerDocType, LayerLinkDocType } from '../types/jieyuDbDocTypes';
import type { LayerCreateInput } from '../hooks/transcription/transcriptionTypes';
import type { TextTimeMappingSummary } from '~/hooks/dialogs/useDialogs';
import type { AppShellOpenSearchDetail } from '../utils/appShellEvents';
import type { PdfPreviewOpenRequest } from './TranscriptionPage.runtimeContracts';
import type { TextDirection, UiFontScaleMode } from '../utils/panelAdaptiveLayout';
import type { useLayerActionPanel } from '~/hooks/layer/useLayerActionPanel';

interface DialogUnitLike {
  textId: string;
}

export interface UseTranscriptionShellControllerInput {
  units: DialogUnitLike[];
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
  deleteLayer: (layerId: string, options?: { keepUnits?: boolean }) => Promise<void>;
  deleteLayerWithoutConfirm?: (layerId: string) => Promise<void>;
  checkLayerHasContent?: (layerId: string) => Promise<number>;
}

export interface UseTranscriptionShellControllerResult {
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
  isAiPanelCollapsed: boolean;
  setIsAiPanelCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  aiPanelWidth: number;
  setAiPanelWidth: React.Dispatch<React.SetStateAction<number>>;
  uiFontScale: number;
  uiFontScaleMode: UiFontScaleMode;
  setUiFontScale: (nextScale: number) => void;
  resetUiFontScale: () => void;
  uiTextDirection: TextDirection;
  adaptiveDialogWidth: number;
  adaptiveDialogCompactWidth: number;
  adaptiveDialogWideWidth: number;
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
  activeTextPrimaryOrthographyId: string | null;
  activeTextTimelineMode: 'document' | 'media' | null;
  activeTextTimeMapping: TextTimeMappingSummary | null;
  getActiveTextId: () => Promise<string | null>;
  getActiveTextPrimaryLanguageId: () => Promise<string | null>;
  getActiveTextTimelineMode: () => Promise<'document' | 'media' | null>;
  searchOverlayRequest: AppShellOpenSearchDetail | null;
  setSearchOverlayRequest: React.Dispatch<React.SetStateAction<AppShellOpenSearchDetail | null>>;
  openSearchFromRequest: (detail?: AppShellOpenSearchDetail) => void;
  createLayerWithActiveContext: UseTranscriptionShellControllerInput['createLayer'];
  layerAction: ReturnType<typeof useLayerActionPanel>;
  handleFocusLayerRow: (id: string) => void;
}
