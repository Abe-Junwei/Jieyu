import type { UseReadyWorkspaceSurfacePropsInput } from './readyWorkspaceSurfacePropsTypes';
import {
  buildReadyWorkspaceSurfaceFlatPropsFromLayeredContext,
  type ReadyWorkspaceSurfaceFlatLayeredContext,
} from './transcriptionReadyWorkspaceSurfaceFlatPropsBuilder';

export type { ReadyWorkspaceSurfaceFlatLayeredContext };

export function buildReadyWorkspaceSurfacePropsOrchestratorInput(input: {
  layeredFlat: ReadyWorkspaceSurfaceFlatLayeredContext;
  layout: UseReadyWorkspaceSurfacePropsInput['layout'];
  waveform: UseReadyWorkspaceSurfacePropsInput['waveform'];
  overlays: UseReadyWorkspaceSurfacePropsInput['overlays'];
  controllers: UseReadyWorkspaceSurfacePropsInput['controllers'];
}): UseReadyWorkspaceSurfacePropsInput {
  return {
    ...buildReadyWorkspaceSurfaceFlatPropsFromLayeredContext(input.layeredFlat),
    layout: input.layout,
    waveform: input.waveform,
    overlays: input.overlays,
    controllers: input.controllers,
  } as UseReadyWorkspaceSurfacePropsInput;
}
