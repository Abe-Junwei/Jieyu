import type { CSSProperties } from 'react';
import type { OrchestratorWaveformContentProps } from './OrchestratorWaveformContent';
import type { TranscriptionOverlaysProps } from '../components/TranscriptionOverlays';
import type { TranscriptionPageReadyWorkspaceLayoutProps } from './TranscriptionPage.ReadyWorkspaceLayout';
import type { TranscriptionPageSidePaneProps } from './TranscriptionPage.SidePane';
import type { BuildReadyWorkspaceLayoutStyleInputFromProps } from './transcriptionReadyWorkspaceLayoutStyleInputBuilder';
import type {
  ReadyWorkspaceSurfaceControllersSliceContract,
  ReadyWorkspaceSurfaceOverlaysSliceContract,
  ReadyWorkspaceSurfaceWaveformSliceContract,
} from './readyWorkspaceSurfaceSliceContracts';

/** Phase B/C：ReadyWorkspace 表面 props 编排输入（`layeredFlat` ∪ 嵌套 slice）。 */
export interface UseReadyWorkspaceSurfacePropsInput {
  locale: string;
  /** Side pane row flash/focus — forwarded to side pane builder | 侧栏层行高亮 */
  focusedLayerRowId?: string | null;
  flashLayerRowId?: string | null;
  activeTextId: unknown;
  selectedTimelineMedia: unknown | undefined;
  selectedMediaUrl: unknown;
  segmentScopeMediaId: unknown;
  verticalViewActive: boolean;
  activeTextTimelineMode: unknown;
  activeTextTimeMapping: unknown;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string;
  undoHistory: unknown;
  showUndoHistory: boolean;
  setShowUndoHistory: (v: boolean) => void;
  redo: unknown;
  selectedTimelineUnit: unknown;
  activeTimelineUnitId: string;
  recordTimelineEdit: unknown;
  undoToHistoryIndex: unknown;
  setShowProjectSetup: (v: boolean) => void;
  setShowAudioImport: (v: boolean) => void;
  applyTextTimeMapping: unknown;
  selectedUnitIds: Set<string>;
  batchPreviewTextPropsByLayerId: unknown;
  showBatchOperationPanel: boolean;
  setShowBatchOperationPanel: (v: boolean) => void;
  selectedWaveformRegionId: string | null;
  waveformTimelineItems: unknown;
  zoomToPercent: unknown;
  zoomToUnit: unknown;
  snapEnabled: boolean;
  autoScrollEnabled: boolean;
  setSnapEnabled: (v: boolean) => void;
  setAutoScrollEnabled: (v: boolean) => void;
  setIsAiPanelCollapsed: (v: boolean) => void;
  handleAiPanelToggle: () => void;
  handleAiPanelResizeStart: unknown;
  handleLassoPointerDown: unknown;
  handleLassoPointerMove: unknown;
  handleLassoPointerUp: unknown;
  handleTimelineScroll: unknown;
  recoveryAvailable: boolean;
  recoveryDiffSummary: unknown;
  applyRecoveryBanner: () => void;
  dismissRecoveryBanner: () => void;
  toolbarPropsWithCollaboration: unknown;
  observerResult: { stage: unknown };
  actionableObserverRecommendations: unknown | null;
  handleExecuteObserverRecommendation: (item: { id: string }) => void;
  deferredAiRuntime: { acousticRuntimeStatus: unknown };
  vadCacheStatus: unknown;
  collaborationProtocolGuard: unknown;
  assistantBridgeControllerInput: unknown;
  handleDeferredAiRuntimeChange: unknown;
  selectUnit: (id: string) => void;
  formatTime: unknown;
  defaultTranscriptionLayerId: unknown;
  translationLayers: unknown[];
  orderedLayers: unknown[];
  handleFocusLayerRow: unknown;
  layerLinks: unknown;
  toggleLayerLink: unknown;
  deletableLayers: unknown;
  updateLayerMetadata: unknown;
  layerCreateMessage: unknown;
  layerAction: unknown;
  segmentsByLayer: unknown;
  segmentContentByLayer: unknown;
  unitsOnCurrentMedia: unknown;
  speakers: unknown;
  listProjectAssets: unknown;
  removeProjectAsset: unknown;
  getProjectAssetSignedUrl: unknown;
  listProjectSnapshots: unknown;
  restoreProjectSnapshotToLocalById: unknown;
  queryProjectChangeTimeline: unknown;
  listAccessibleCloudProjects: unknown;
  listCloudProjectMembers: unknown;
  getUnitTextForLayer: unknown;
  selectTimelineUnit: unknown;
  reorderLayers: unknown;
  onSelectWorkspaceHorizontalLayout: () => void;
  onSelectWorkspaceVerticalLayout: () => void;
  units: unknown;
  notePopover: unknown;
  setNotePopover: unknown;
  currentNotes: unknown;
  addNote: unknown;
  updateNote: unknown;
  deleteNote: unknown;
  ctxMenu: unknown;
  setCtxMenu: unknown;
  uttOpsMenu: unknown;
  setUttOpsMenu: unknown;
  runOverlayDeleteSelection: unknown;
  runOverlayMergeSelection: unknown;
  runSelectBefore: unknown;
  runSelectAfter: unknown;
  runOverlayDeleteOne: unknown;
  runOverlayMergePrev: unknown;
  runOverlayMergeNext: unknown;
  runOverlaySplitAtTime: unknown;
  deleteConfirmState: unknown;
  muteDeleteConfirmInSession: unknown;
  setMuteDeleteConfirmInSession: unknown;
  closeDeleteConfirmDialog: unknown;
  confirmDeleteFromDialog: unknown;
  displayStyleControl: unknown;
  toggleSkipProcessingRouted: unknown;
  player: unknown;
  timelineViewportProjection: unknown;
  waveformAcousticRuntimeStatus: unknown;
  waveformVadCacheStatus: unknown;
  assistantSidebarController: unknown;
  assistantController: { aiPanelContextValue: unknown };
  readyWorkspaceViewModels: unknown;
  readyWorkspaceRenderController: {
    shouldRenderRecoveryBanner: boolean;
    shouldRenderAiSidebar: boolean;
    shouldRenderDialogs: boolean;
    shouldRenderPdfRuntime: boolean;
    shouldRenderBatchOps: boolean;
  };
  readyWorkspaceAxisStatusController: unknown;
  workspacePanelEffectsController: { handleAiPanelResizeStart: unknown };
  timelineResizeController: unknown;
  /** Phase B：侧栏 speaker 合同 + stage 所需的 `handleOpenSpeakerManagementPanel`；其余控制器键仍为 `unknown`。 */
  controllers: ReadyWorkspaceSurfaceControllersSliceContract;
  /** Phase B3：与 `buildReadyWorkspaceLayoutStyleInputFromProps` 对齐。 */
  layout: BuildReadyWorkspaceLayoutStyleInputFromProps;
  waveform: ReadyWorkspaceSurfaceWaveformSliceContract;
  /** Phase B1：overlays 域（与 `buildReadyWorkspaceOverlaysPropsInput` 对齐）。 */
  overlays: ReadyWorkspaceSurfaceOverlaysSliceContract;
}

export interface UseReadyWorkspaceSurfacePropsResult {
  readyWorkspaceSidePaneProps: TranscriptionPageSidePaneProps;
  readyWorkspaceWaveformContentProps: OrchestratorWaveformContentProps;
  readyWorkspaceOverlaysProps: TranscriptionOverlaysProps;
  readyWorkspaceLayoutStyle: CSSProperties;
  readyWorkspaceStageProps: NonNullable<
    TranscriptionPageReadyWorkspaceLayoutProps['readyStageProps']
  >;
}
