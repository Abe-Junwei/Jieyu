import { useMemo } from 'react';
import { assembleReadyWorkspaceSurfacePropsBundle } from './readyWorkspaceSurfacePropsAssemblyPhase';
import type {
  UseReadyWorkspaceSurfacePropsInput,
  UseReadyWorkspaceSurfacePropsResult,
} from './readyWorkspaceSurfacePropsTypes';

export type {
  UseReadyWorkspaceSurfacePropsInput,
  UseReadyWorkspaceSurfacePropsResult,
} from './readyWorkspaceSurfacePropsTypes';

export function useReadyWorkspaceSurfaceProps(
  input: UseReadyWorkspaceSurfacePropsInput,
): UseReadyWorkspaceSurfacePropsResult {
  return useMemo(() => assembleReadyWorkspaceSurfacePropsBundle(input), [input]);
}
