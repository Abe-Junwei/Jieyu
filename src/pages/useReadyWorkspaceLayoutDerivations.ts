import { useCallback, useMemo } from 'react';
import type { TimelineUnitView } from '../hooks/timelineUnitView';
import type { UseAiPanelLogicInput } from '../hooks/useAiPanelLogic';
import { unitDocForSpeakerTargetFromUnitView } from './timelineUnitViewUnitHelpers';

type RuntimeAiChatOverlay = {
  providerLabel: unknown;
  settings: unknown;
  connectionTestStatus: unknown;
  connectionTestMessage: unknown;
  updateSettings: unknown;
  testConnection: unknown;
};

type AiPanelSelectedUnit = NonNullable<UseAiPanelLogicInput['selectedUnit']>;

interface UseReadyWorkspaceLayoutDerivationsInput {
  unitsOnCurrentMedia: Array<{ endTime?: number }>;
  selectedTimelineMediaId: string | undefined;
  unitsCount: number;
  selectionSnapshotSelectedUnit: TimelineUnitView | null | undefined;
  getUnitDocById: (id: string) => AiPanelSelectedUnit | undefined;
  deferredAiRuntime: {
    aiChat: RuntimeAiChatOverlay;
  };
  deferredAiRuntimeForSidebar: { aiChat: any };
  playerInstanceRef: { current: { getWidth?: () => number } | null };
}

export function useReadyWorkspaceLayoutDerivations({
  unitsOnCurrentMedia,
  selectedTimelineMediaId,
  unitsCount,
  selectionSnapshotSelectedUnit,
  getUnitDocById,
  deferredAiRuntime,
  deferredAiRuntimeForSidebar,
  playerInstanceRef,
}: UseReadyWorkspaceLayoutDerivationsInput) {
  const hiddenByMediaFilterCount = useMemo(() => {
    if (!selectedTimelineMediaId) return 0;
    return Math.max(0, unitsCount - unitsOnCurrentMedia.length);
  }, [selectedTimelineMediaId, unitsCount, unitsOnCurrentMedia.length]);

  const selectedUnitForAiPanelLogic = useMemo(
    () => unitDocForSpeakerTargetFromUnitView(selectionSnapshotSelectedUnit, getUnitDocById) ?? undefined,
    [getUnitDocById, selectionSnapshotSelectedUnit],
  );

  const aiChatForSidebar = useMemo(() => ({
    ...deferredAiRuntimeForSidebar.aiChat,
    providerLabel: deferredAiRuntime.aiChat.providerLabel,
    settings: deferredAiRuntime.aiChat.settings,
    connectionTestStatus: deferredAiRuntime.aiChat.connectionTestStatus,
    connectionTestMessage: deferredAiRuntime.aiChat.connectionTestMessage,
    updateSettings: deferredAiRuntime.aiChat.updateSettings,
    testConnection: deferredAiRuntime.aiChat.testConnection,
  }), [
    deferredAiRuntime.aiChat.connectionTestMessage,
    deferredAiRuntime.aiChat.connectionTestStatus,
    deferredAiRuntime.aiChat.providerLabel,
    deferredAiRuntime.aiChat.settings,
    deferredAiRuntime.aiChat.testConnection,
    deferredAiRuntime.aiChat.updateSettings,
    deferredAiRuntimeForSidebar.aiChat,
  ]);

  const playerInstanceGetWidth = useCallback(
    () => playerInstanceRef.current?.getWidth?.() ?? 9999,
    [playerInstanceRef],
  );

  return {
    hiddenByMediaFilterCount,
    selectedUnitForAiPanelLogic,
    aiChatForSidebar,
    playerInstanceGetWidth,
  };
}
