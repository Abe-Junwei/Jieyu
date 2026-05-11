import type { ReadyWorkspaceAssistantBridgeOrchestratorSliceDeps } from './readyWorkspaceAssistantBridgeOrchestratorInputSlice';

/**
 * Join bridge interior + tail fields without flattening duplicate keys (e.g. `selectedLayerId` on bridge and tail).
 */
export function joinAssistantBridgeOrchestratorSliceDeps(parts: {
  segmentScopeMediaItem?: ReadyWorkspaceAssistantBridgeOrchestratorSliceDeps['segmentScopeMediaItem'];
  bridge: ReadyWorkspaceAssistantBridgeOrchestratorSliceDeps['bridge'];
  tail: Omit<
    ReadyWorkspaceAssistantBridgeOrchestratorSliceDeps,
    'segmentScopeMediaItem' | 'bridge'
  >;
}): ReadyWorkspaceAssistantBridgeOrchestratorSliceDeps {
  return {
    segmentScopeMediaItem: parts.segmentScopeMediaItem,
    bridge: parts.bridge,
    ...parts.tail,
  };
}
