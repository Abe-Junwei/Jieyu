import type { MediaItemDocType } from '../types/jieyuDbDocTypes';

import { buildReadyWorkspaceAssistantBridgeInputForOrchestrator } from './transcriptionReadyWorkspaceAssistantBridgeAggregateBuilder';

type AssistantBridgeOrchestratorArg = Parameters<
  typeof buildReadyWorkspaceAssistantBridgeInputForOrchestrator
>[0];

/**
 * Same as `AssistantBridgeOrchestratorArg` plus optional `segmentScopeMediaItem` for `scopeMediaItemForAi`
 * (ReadyWorkspace previously computed `segmentScopeMediaItem ?? selectedTimelineMedia` inline).
 */
export type ReadyWorkspaceAssistantBridgeOrchestratorSliceDeps = AssistantBridgeOrchestratorArg & {
  segmentScopeMediaItem?: MediaItemDocType | null | undefined;
};

/** Wires AI bridge orchestrator input; injects timeline media / scope spreads into `bridge`. */
export function assembleReadyWorkspaceAssistantBridgeControllerInput(
  deps: ReadyWorkspaceAssistantBridgeOrchestratorSliceDeps,
): ReturnType<typeof buildReadyWorkspaceAssistantBridgeInputForOrchestrator> {
  const { segmentScopeMediaItem, ...rest } = deps;
  const aiScopeMediaItem = segmentScopeMediaItem ?? rest.selectedTimelineMedia;
  return buildReadyWorkspaceAssistantBridgeInputForOrchestrator({
    ...rest,
    bridge: {
      ...rest.bridge,
      ...(rest.selectedTimelineMedia ? { selectedTimelineMedia: rest.selectedTimelineMedia } : {}),
      ...(aiScopeMediaItem ? { scopeMediaItemForAi: aiScopeMediaItem } : {}),
    },
  });
}
