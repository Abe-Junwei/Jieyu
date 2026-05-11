import { buildReadyWorkspaceSurfacePropsOrchestratorInputSlice } from './readyWorkspaceSurfacePropsOrchestratorInputSlice';
import type { ReadyWorkspaceSurfacePropsOrchestratorInputSliceArgs } from './readyWorkspaceSurfacePropsOrchestratorInputSlice';
import { useReadyWorkspaceSurfaceProps } from './useReadyWorkspaceSurfaceProps';

/**
 * Thin bundle: `buildReadyWorkspaceSurfacePropsOrchestratorInputSlice` + `useReadyWorkspaceSurfaceProps`.
 * Keeps ReadyWorkspace orchestrator call site to a single surface entry (see migration plan).
 */
export function useReadyWorkspaceSurfaceOrchestratorBundle(
  args: ReadyWorkspaceSurfacePropsOrchestratorInputSliceArgs,
) {
  return useReadyWorkspaceSurfaceProps(buildReadyWorkspaceSurfacePropsOrchestratorInputSlice(args));
}
