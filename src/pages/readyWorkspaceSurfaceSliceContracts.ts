/**
 * ReadyWorkspace surface nested slice contracts (Phase B):
 * - B1: overlays + speaker controllers
 * - B2: waveform slice (minus shell-merged playerBridge / locale / …)
 * - B3: layout slice uses `BuildReadyWorkspaceLayoutStyleInputFromProps` on `UseReadyWorkspaceSurfacePropsInput.layout`
 *   (see `transcriptionReadyWorkspaceSurfaceNestedSlicesBuilder`); stage builder input uses
 *   `BuildReadyWorkspaceStagePropsInputFromControllers` at the `useReadyWorkspaceSurfaceProps` call site.
 */

import type { BuildReadyWorkspaceOverlaysPropsInputFromControllers } from './transcriptionReadyWorkspaceOverlaysInputBuilder';
import type { BuildReadyWorkspaceStagePropsInputFromControllers } from './transcriptionReadyWorkspaceStagePropsInputBuilder';
import type { BuildReadyWorkspaceWaveformContentPropsInputFromControllers } from './transcriptionReadyWorkspaceWaveformInputBuilder';
import type {
  ReadyWorkspaceSidePaneSpeakerActionScopeContract,
  ReadyWorkspaceSidePaneSpeakerControllerContract,
} from './transcriptionReadyWorkspaceSidePaneInputBuilder';

/** Overlays domain: input shape before `buildReadyWorkspaceOverlaysPropsInput` adds close handlers. */
export type ReadyWorkspaceSurfaceOverlaysSliceContract =
  BuildReadyWorkspaceOverlaysPropsInputFromControllers;

/**
 * Refs carried on the waveform slice for stage layout wiring (not modeled on FromControllers).
 */
export type ReadyWorkspaceSurfaceWaveformSliceStageRefs = {
  waveformSectionRef: unknown;
  workspaceRef: unknown;
  listMainRef: unknown;
};

/**
 * Waveform slice: nested orchestrator payload. Excludes fields merged in `useReadyWorkspaceSurfaceProps`
 * from top-level input (`locale`, `i.player` → `playerBridge`, etc.).
 */
export type ReadyWorkspaceSurfaceWaveformSliceContract = Omit<
  BuildReadyWorkspaceWaveformContentPropsInputFromControllers,
  | 'playerBridge'
  | 'locale'
  | 'unitsOnCurrentMedia'
  | 'getUnitTextForLayer'
  | 'selectedMediaUrl'
  | 'snapGuideNearSide'
> &
  ReadyWorkspaceSurfaceWaveformSliceStageRefs;

/**
 * Controllers slice: speaker + speakerActionScope are contract-typed (side pane + stage shell entry).
 * `speaker` intersects stage `handleOpenSpeakerManagementPanel`; other keys remain `unknown`.
 */
export type ReadyWorkspaceSurfaceControllersSliceContract = {
  speaker: ReadyWorkspaceSidePaneSpeakerControllerContract &
    Pick<
      BuildReadyWorkspaceStagePropsInputFromControllers['speakerController'],
      'handleOpenSpeakerManagementPanel'
    >;
  speakerActionScope: ReadyWorkspaceSidePaneSpeakerActionScopeContract;
  selfCertainty: unknown;
  timeline: unknown;
  batch: unknown;
  projectMedia: unknown;
  importExport: unknown;
  playbackKeyboard: unknown;
  annotation: unknown;
  trackDisplay: unknown;
};
