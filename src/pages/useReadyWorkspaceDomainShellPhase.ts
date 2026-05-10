import { useMemo } from 'react';
import type { SetURLSearchParams } from 'react-router-dom';

import { useTranscriptionData } from '../hooks/useTranscriptionData';
import { useReadyWorkspaceSegmentScope } from './useReadyWorkspaceSegmentScope';
import { useTranscriptionShellController } from './useTranscriptionShellController';
import { useReadyWorkspaceDeepLinkEffects } from './useReadyWorkspaceDeepLinkEffects';
import { useTranscriptionSelectionContextController } from './useTranscriptionSelectionContextController';
import { useTranscriptionSegmentBridgeController } from './useTranscriptionSegmentBridgeController';
import type { AppShellOpenSearchDetail } from '../utils/appShellEvents';
import type { ToastVariant } from '../contexts/ToastContext';

export interface UseReadyWorkspaceDomainShellPhaseParams {
  data: ReturnType<typeof useTranscriptionData>;
  searchParams: URLSearchParams;
  setSearchParams: SetURLSearchParams;
  showToast: (message: string, variant?: ToastVariant, autoDismissMs?: number) => void;
  tfB: (key: string, opts?: Record<string, unknown>) => string;
  appSearchRequest?: AppShellOpenSearchDetail | null;
  onConsumeAppSearchRequest?: () => void;
}

export function useReadyWorkspaceDomainShellPhase({
  data,
  searchParams,
  setSearchParams,
  showToast,
  tfB,
  appSearchRequest,
  onConsumeAppSearchRequest,
}: UseReadyWorkspaceDomainShellPhaseParams) {
  const {
    units,
    layers,
    layerLinks,
    mediaItems: _mediaItems,
    selectedTimelineUnit,
    selectedLayerId,
    setSelectedLayerId,
    orderedLayers,
    deletableLayers,
    layerCreateMessage,
    setLayerCreateMessage,
    createLayer,
    deleteLayer,
    deleteLayerWithoutConfirm,
    checkLayerHasContent,
    selectedUnit,
    selectedUnitMedia,
    unitsOnCurrentMedia,
    loadSnapshot,
    selectTimelineUnit,
    setSelectedMediaId: _setSelectedMediaId,
    defaultTranscriptionLayerId,
    transcriptionLayers,
    segmentUndoRef,
  } = data;

  const {
    activeTimelineUnitId,
    segmentScopeMediaId,
    segmentsByLayer,
    segmentsLoadComplete,
    reloadSegments,
    updateSegmentsLocally: _updateSegmentsLocally,
    segmentContentByLayer,
    reloadSegmentContents,
  } = useReadyWorkspaceSegmentScope({
    selectedUnitMedia,
    selectedTimelineUnit,
    units,
    mediaItems: _mediaItems,
    layers,
    defaultTranscriptionLayerId,
    layerLinks,
  });

  const segmentScopeMediaItem = useMemo(
    () => (segmentScopeMediaId ? _mediaItems.find((m) => m.id === segmentScopeMediaId) : undefined),
    [_mediaItems, segmentScopeMediaId],
  );

  const shell = useTranscriptionShellController({
    units,
    ...(appSearchRequest !== undefined ? { appSearchRequest } : {}),
    ...(onConsumeAppSearchRequest ? { onConsumeAppSearchRequest } : {}),
    selectedLayerId,
    setSelectedLayerId,
    orderedLayers,
    layerLinks,
    deletableLayers,
    layerCreateMessage,
    setLayerCreateMessage,
    createLayer,
    deleteLayer,
    deleteLayerWithoutConfirm,
    checkLayerHasContent,
  });

  useReadyWorkspaceDeepLinkEffects({
    searchParams,
    setSearchParams,
    setActiveTextId: shell.setActiveTextId,
    loadSnapshot,
    showToast,
    tfB,
    phase: data.state.phase,
    units: units.map((u) => ({
      id: u.id,
      textId: u.textId,
      ...(u.mediaId !== undefined ? { mediaId: u.mediaId } : {}),
      ...(u.layerId !== undefined ? { layerId: u.layerId } : {}),
    })),
    layers,
    mediaItems: _mediaItems,
    ...(selectedUnitMedia !== undefined ? { selectedUnitMedia } : {}),
    segmentsByLayer:
      segmentsByLayer instanceof Map
        ? (Object.fromEntries(segmentsByLayer) as Record<string, Array<{ id: string }> | undefined>)
        : segmentsByLayer,
    segmentsLoadComplete,
    selectTimelineUnit,
    setSelectedLayerId,
    setFocusedLayerRowId: shell.setFocusedLayerRowId,
    setSelectedMediaId: _setSelectedMediaId,
    ...(defaultTranscriptionLayerId !== undefined ? { defaultTranscriptionLayerId } : {}),
    ...(selectedLayerId !== undefined ? { selectedLayerId } : {}),
    transcriptionLayers,
    activeTextId: shell.activeTextId,
  });

  const selection = useTranscriptionSelectionContextController({
    layers,
    ...(defaultTranscriptionLayerId !== undefined ? { defaultTranscriptionLayerId } : {}),
    layerLinks,
    mediaItems: _mediaItems,
    units,
    unitsOnCurrentMedia,
    selectedUnit: selectedUnit ?? null,
    ...(selectedUnitMedia ? { selectedUnitMedia } : {}),
    selectedTimelineUnit,
    segmentsByLayer,
  });

  const bridge = useTranscriptionSegmentBridgeController({
    selectedLayerId,
    focusedLayerId: shell.focusedLayerRowId,
    selectedTimelineUnit,
    ...(defaultTranscriptionLayerId !== undefined ? { defaultTranscriptionLayerId } : {}),
    ...(transcriptionLayers[0]?.id ? { firstTranscriptionLayerId: transcriptionLayers[0].id } : {}),
    layerById: selection.layerById,
    layerLinks,
    independentLayerIds: selection.independentLayerIds,
    segmentsByLayer,
    segmentContentByLayer,
    reloadSegments,
    reloadSegmentContents,
    selectTimelineUnit,
    segmentUndoRef,
  });

  return {
    activeTimelineUnitId,
    segmentScopeMediaId,
    segmentsByLayer,
    segmentsLoadComplete,
    reloadSegments,
    updateSegmentsLocally: _updateSegmentsLocally,
    segmentContentByLayer,
    reloadSegmentContents,
    segmentScopeMediaItem,
    ...shell,
    ...selection,
    ...bridge,
  };
}

export type ReadyWorkspaceDomainShellPhaseResult = ReturnType<
  typeof useReadyWorkspaceDomainShellPhase
>;
