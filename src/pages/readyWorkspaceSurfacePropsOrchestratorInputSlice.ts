import type { ReadyWorkspaceSurfaceFlatLayeredContext } from './transcriptionReadyWorkspaceSurfaceFlatPropsBuilder';
import { buildReadyWorkspaceSurfacePropsOrchestratorInput } from './transcriptionReadyWorkspaceSurfacePropsOrchestratorInputBuilder';
import {
  buildReadyWorkspaceSurfaceControllersSlice,
  buildReadyWorkspaceSurfaceLayoutSlice,
  buildReadyWorkspaceSurfaceOverlaysSlice,
  buildReadyWorkspaceSurfaceWaveformSlice,
} from './transcriptionReadyWorkspaceSurfaceNestedSlicesBuilder';
import type { UseReadyWorkspaceSurfacePropsInput } from './useReadyWorkspaceSurfaceProps';

type LayoutSliceInput = Parameters<typeof buildReadyWorkspaceSurfaceLayoutSlice>[0];
type WaveformSliceInput = Parameters<typeof buildReadyWorkspaceSurfaceWaveformSlice>[0];
type OverlaysSliceInput = Parameters<typeof buildReadyWorkspaceSurfaceOverlaysSlice>[0];
type ControllersSliceInput = Parameters<typeof buildReadyWorkspaceSurfaceControllersSlice>[0];

export type ReadyWorkspaceSurfacePropsOrchestratorInputSliceArgs = {
  layeredFlat: ReadyWorkspaceSurfaceFlatLayeredContext;
  layoutInput: LayoutSliceInput;
  waveformInput: WaveformSliceInput;
  overlaysInput: OverlaysSliceInput;
  controllersInput: ControllersSliceInput;
};

/** Bundles layered flat context + nested surface slices into `useReadyWorkspaceSurfaceProps` input (ReadyWorkspace orchestration). */
export function buildReadyWorkspaceSurfacePropsOrchestratorInputSlice(
  args: ReadyWorkspaceSurfacePropsOrchestratorInputSliceArgs,
): UseReadyWorkspaceSurfacePropsInput {
  return buildReadyWorkspaceSurfacePropsOrchestratorInput({
    layeredFlat: args.layeredFlat,
    layout: buildReadyWorkspaceSurfaceLayoutSlice(args.layoutInput),
    waveform: buildReadyWorkspaceSurfaceWaveformSlice(args.waveformInput),
    overlays: buildReadyWorkspaceSurfaceOverlaysSlice(args.overlaysInput),
    controllers: buildReadyWorkspaceSurfaceControllersSlice(args.controllersInput),
  });
}
