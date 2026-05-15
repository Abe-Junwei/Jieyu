import type { BuildReadyWorkspaceLayoutStyleInputFromProps } from './transcriptionReadyWorkspaceLayoutStyleInputBuilder';
import type { UseReadyWorkspaceSurfacePropsInput } from './readyWorkspaceSurfacePropsTypes';
import type {
  ReadyWorkspaceSurfaceControllersSliceContract,
  ReadyWorkspaceSurfaceOverlaysSliceContract,
  ReadyWorkspaceSurfaceWaveformSliceContract,
} from './readyWorkspaceSurfaceSliceContracts';

export function buildReadyWorkspaceSurfaceLayoutSlice(
  input: BuildReadyWorkspaceLayoutStyleInputFromProps,
): UseReadyWorkspaceSurfacePropsInput['layout'] {
  return input;
}

export function buildReadyWorkspaceSurfaceControllersSlice(
  input: ReadyWorkspaceSurfaceControllersSliceContract,
): ReadyWorkspaceSurfaceControllersSliceContract {
  return input;
}

export function buildReadyWorkspaceSurfaceWaveformSlice(
  input: ReadyWorkspaceSurfaceWaveformSliceContract,
): ReadyWorkspaceSurfaceWaveformSliceContract {
  return input;
}

export function buildReadyWorkspaceSurfaceOverlaysSlice(
  input: ReadyWorkspaceSurfaceOverlaysSliceContract,
): ReadyWorkspaceSurfaceOverlaysSliceContract {
  return input;
}
