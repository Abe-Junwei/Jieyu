/**
 * TranscriptionPage - Ready Workspace (orchestrator runtime)
 *
 * Heavy ready-state hook wiring; thin chunk entry + CSS stay on `TranscriptionPage.ReadyWorkspace.tsx`;
 * 薄壳见 `TranscriptionPage.ReadyWorkspace.body.tsx` | Thin shell: {@link TranscriptionPageReadyWorkspace} in body module.
 *
 * 改装配 / 时间轴 `data` vs 壳层：先读 `docs/architecture/ReadyWorkspace-数据域与壳层装配边界.md`
 *（一页式阶段顺序表、「主要产出 → 消费方」简表、`domainWrite`/`hostWrite`、`npm run audit:ready-workspace-timeline-host`）。
 */

import { useSearchParams } from 'react-router-dom';
import { useToast } from '../contexts/ToastContext';
import { type AppShellOpenSearchDetail } from '../utils/appShellEvents';
import { useTranscriptionData } from '../hooks/useTranscriptionData';
import { useLocaleBoundTf } from '../hooks/useLocaleBoundTf';
import { useLocale } from '../i18n';
import { formatTime } from '../utils/transcriptionFormatters';
import { buildReadyWorkspaceSidebarAndTrackPhaseParams } from './buildReadyWorkspaceSidebarAndTrackPhaseParams';
import { buildReadyWorkspaceTimelineAssistantPlaybackPhaseParams } from './buildReadyWorkspaceTimelineAssistantPlaybackPhaseParams';
import { buildReadyWorkspaceViewModelsSurfacePhaseParams } from './buildReadyWorkspaceViewModelsSurfacePhaseParams';
import { useReadyWorkspaceWaveformBridgePhase } from './useReadyWorkspaceWaveformBridgePhase';
import { useReadyWorkspaceSelectionAndAiPrepPhase } from './useReadyWorkspaceSelectionAndAiPrepPhase';
import { useReadyWorkspaceTimelineAssistantPlaybackPhase } from './useReadyWorkspaceTimelineAssistantPlaybackPhase';
import { useReadyWorkspaceSidebarAndTrackPhase } from './useReadyWorkspaceSidebarAndTrackPhase';
import { useReadyWorkspaceViewModelsAndSurfacePhase } from './useReadyWorkspaceViewModelsAndSurfacePhase';
import { buildReadyWorkspaceConflictReviewDrawerProps } from './transcriptionReadyWorkspacePropsBuilders';
import { buildReadyWorkspaceConflictReviewDrawerPropsInput } from './transcriptionReadyWorkspaceSurfaceInputBuilder';

import { TranscriptionPageReadyWorkspaceLayout } from './TranscriptionPage.ReadyWorkspaceLayout';
import { preserveReadyWorkspaceStructureMarkers } from './TranscriptionPage.ReadyWorkspace.structureMarkers';
import { useReadyWorkspaceDomainShellPhase } from './useReadyWorkspaceDomainShellPhase';
import { useReadyWorkspacePreBootstrapChromePhase } from './useReadyWorkspacePreBootstrapChromePhase';
import { useReadyWorkspaceReadyPhaseBootstrap } from './useReadyWorkspaceReadyPhaseBootstrap';
void preserveReadyWorkspaceStructureMarkers;

export interface TranscriptionPageReadyWorkspaceProps {
  data: ReturnType<typeof useTranscriptionData>;
  appSearchRequest?: AppShellOpenSearchDetail | null;
  onConsumeAppSearchRequest?: () => void;
}

export function TranscriptionPageReadyWorkspaceOrchestrator({
  data,
  appSearchRequest,
  onConsumeAppSearchRequest,
}: TranscriptionPageReadyWorkspaceProps) {
  const locale = useLocale();
  const [searchParams, setSearchParams] = useSearchParams();
  const tfB = useLocaleBoundTf(locale);
  const { showToast } = useToast();
  const {
    state,
    collaborationConflictTickets,
    applyRemoteConflictTicket,
    keepLocalConflictTicket,
    postponeConflictTicket,
  } = data;
  const domainShell = useReadyWorkspaceDomainShellPhase({
    data,
    searchParams,
    setSearchParams,
    showToast,
    tfB,
    ...(appSearchRequest !== undefined ? { appSearchRequest } : {}),
    ...(onConsumeAppSearchRequest ? { onConsumeAppSearchRequest } : {}),
  });
  // transcriptionLaneReadScope + timeline index: see useReadyWorkspacePreBootstrapChromePhase (ADR 0020 wiring)
  const pre = useReadyWorkspacePreBootstrapChromePhase({ data, domainShell });

  const bootstrap = useReadyWorkspaceReadyPhaseBootstrap({
    statePhase: state.phase,
    timelineTotalCount: pre.timelineUnitViewIndex.totalCount,
    timelineCurrentMediaUnits: pre.timelineUnitViewIndex.currentMediaUnits,
    setState: data.setState,
    activeLayerIdForEdits: domainShell.activeLayerIdForEdits,
    resolveSegmentRoutingForLayer: domainShell.resolveSegmentRoutingForLayer,
    segmentScopeMediaItem: domainShell.segmentScopeMediaItem,
    selectedTimelineMedia: domainShell.selectedTimelineMedia,
    documentSpanSecFromBridgeRef: pre.documentSpanSecFromBridgeRef,
    unitsOnCurrentMedia: data.unitsOnCurrentMedia,
    pushUndo: data.pushUndo,
    reloadSegments: domainShell.reloadSegments,
    refreshSegmentUndoSnapshot: domainShell.refreshSegmentUndoSnapshot,
    selectTimelineUnit: data.selectTimelineUnit,
    setSaveState: data.setSaveState,
    splitUnit: data.splitUnit,
    mergeSelectedUnits: data.mergeSelectedUnits,
    mergeWithPrevious: data.mergeWithPrevious,
    mergeWithNext: data.mergeWithNext,
    deleteUnit: data.deleteUnit,
    deleteSelectedUnits: data.deleteSelectedUnits,
    selectAllBefore: data.selectAllBefore,
    selectAllAfter: data.selectAllAfter,
    createAdjacentUnit: data.createAdjacentUnit,
    createUnitFromSelection: data.createUnitFromSelection,
    reloadSegmentContents: domainShell.reloadSegmentContents,
    ensureTimelineMediaRowResolved: data.ensureTimelineMediaRowResolved,
    selectedTimelineMediaForCreation: domainShell.selectedTimelineMedia ?? null,
    units: data.units,
    translationTextByLayer: data.translationTextByLayer,
    locale,
  });

  const waveform = useReadyWorkspaceWaveformBridgePhase({
    documentSpanSecFromBridgeRef: pre.documentSpanSecFromBridgeRef,
    activeLayerIdForEdits: domainShell.activeLayerIdForEdits,
    layers: data.layers,
    layerById: domainShell.layerById,
    layerLinks: data.layerLinks,
    ...(data.defaultTranscriptionLayerId !== undefined
      ? { defaultTranscriptionLayerId: data.defaultTranscriptionLayerId }
      : {}),
    timelineUnitViewIndex: pre.timelineUnitViewIndex,
    selectedTimelineUnit: data.selectedTimelineUnit,
    selectedTimelineUnitForTime: domainShell.selectedTimelineUnitForTime,
    selectedUnitIds: data.selectedUnitIds,
    selectedMediaUrl: data.selectedMediaUrl,
    waveformHeight: pre.waveformHeight,
    amplitudeScale: pre.amplitudeScale,
    setAmplitudeScale: pre.setAmplitudeScale,
    waveformDisplayMode: pre.waveformDisplayMode,
    waveformVisualStyle: pre.waveformVisualStyle,
    acousticOverlayMode: pre.acousticOverlayMode,
    zoomMode: pre.zoomMode,
    setZoomMode: pre.setZoomMode,
    clearUnitSelection: data.clearUnitSelection,
    createUnitFromSelectionRouted: bootstrap.createUnitFromSelectionRouted,
    setUnitSelection: data.setUnitSelection,
    resolveNoteIndicatorTarget: pre.resolveNoteIndicatorTarget,
    tierContainerRef: pre.tierContainerRef,
    ...(typeof pre.activeTextLogicalDurationSecForBridge === 'number' &&
    Number.isFinite(pre.activeTextLogicalDurationSecForBridge)
      ? { activeTextTimeLogicalDurationSec: pre.activeTextLogicalDurationSecForBridge }
      : {}),
    unitsOnCurrentMedia: data.unitsOnCurrentMedia,
    selectedTimelineMediaId: domainShell.selectedTimelineMedia?.id,
    selectedMediaBlobSize: data.selectedMediaBlobSize,
    verticalComparisonEnabled: pre.verticalComparisonEnabled,
    tierIndependentSegmentCreateRangeClamp: bootstrap.tierIndependentSegmentCreateRangeClamp,
  });

  const selectionAi = useReadyWorkspaceSelectionAndAiPrepPhase({
    selectedTimelineUnit: data.selectedTimelineUnit,
    selectedTimelineSegment: domainShell.selectedTimelineSegment,
    selectedTimelineOwnerUnit: domainShell.selectedTimelineOwnerUnit ?? null,
    selectedTimelineRowMeta: domainShell.selectedTimelineRowMeta,
    selectedLayerId: data.selectedLayerId,
    layers: data.layers,
    layerLinks: data.layerLinks,
    segmentContentByLayer: domainShell.segmentContentByLayer,
    getUnitTextForLayer: data.getUnitTextForLayer,
    formatTime,
    timelineUnitViewIndex: pre.timelineUnitViewIndex,
    locale,
    units: data.units,
    unitsOnCurrentMedia: data.unitsOnCurrentMedia,
    selectedTimelineMedia: domainShell.selectedTimelineMedia,
    getUnitDocById: bootstrap.getUnitDocById,
    player: waveform.player,
    handleExecuteRecommendation: pre.handleExecuteRecommendation,
    translationLayers: data.translationLayers,
    translationDrafts: data.translationDrafts,
    translationTextByLayer: data.translationTextByLayer,
    selectUnit: data.selectUnit,
    setSaveState: data.setSaveState,
    waveformHoverReadout: waveform.waveformHoverReadout,
    spectrogramHoverReadout: waveform.spectrogramHoverReadout,
    ...(data.selectedMediaUrl !== undefined ? { selectedMediaUrl: data.selectedMediaUrl } : {}),
  });

  const timeline = useReadyWorkspaceTimelineAssistantPlaybackPhase(
    buildReadyWorkspaceTimelineAssistantPlaybackPhaseParams({
      data,
      domainShell,
      locale,
      tfB,
      pre,
      bootstrap,
      waveform,
      selectionAi,
    }),
  );

  const sidebar = useReadyWorkspaceSidebarAndTrackPhase(
    buildReadyWorkspaceSidebarAndTrackPhaseParams({
      data,
      domainShell,
      locale,
      tfB,
      pre,
      bootstrap,
      selectionAi,
      timeline,
      waveform,
    }),
  );

  const { readyWorkspaceOverlaysProps, readyWorkspaceLayoutStyle, readyWorkspaceStageProps } =
    useReadyWorkspaceViewModelsAndSurfacePhase(
      buildReadyWorkspaceViewModelsSurfacePhaseParams({
        data,
        domainShell,
        locale,
        pre,
        bootstrap,
        waveform,
        selectionAi,
        timeline,
        sidebar,
      }),
    );

  return (
    <TranscriptionPageReadyWorkspaceLayout
      locale={locale}
      phase={state.phase}
      screenRef={pre.screenRef}
      dir={domainShell.uiTextDirection}
      layoutStyle={readyWorkspaceLayoutStyle}
      readyStageProps={readyWorkspaceStageProps}
      overlaysProps={readyWorkspaceOverlaysProps}
      layerPopoverProps={null}
      conflictReviewDrawerProps={buildReadyWorkspaceConflictReviewDrawerProps(
        buildReadyWorkspaceConflictReviewDrawerPropsInput({
          tickets: collaborationConflictTickets,
          applyRemoteConflictTicket,
          keepLocalConflictTicket,
          postponeConflictTicket,
        }),
      )}
      {...(state.phase === 'error' ? { errorMessage: state.message } : {})}
    />
  );
}
