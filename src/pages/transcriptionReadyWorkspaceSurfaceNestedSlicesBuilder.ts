import type { UseReadyWorkspaceSurfacePropsInput } from './useReadyWorkspaceSurfaceProps';

export function buildReadyWorkspaceSurfaceLayoutSlice(input: {
  uiFontScale: number;
  adaptiveDialogWidth: number;
  adaptiveDialogCompactWidth: number;
  adaptiveDialogWideWidth: number;
  aiPanelWidth: number;
  isAiPanelCollapsed: boolean;
  laneLabelWidth: number;
  isTimelineLaneHeaderCollapsed: boolean;
  selectedMediaUrl: unknown;
  selectedMediaIsVideo: boolean;
  videoLayoutMode: string;
  videoRightPanelWidth: number;
}): UseReadyWorkspaceSurfacePropsInput['layout'] {
  return input;
}

export function buildReadyWorkspaceSurfaceControllersSlice(input: {
  speaker: unknown;
  trackDisplay: unknown;
  timeline: unknown;
  batch: unknown;
  projectMedia: unknown;
  importExport: unknown;
  playbackKeyboard: unknown;
  annotation: unknown;
  selfCertainty: unknown;
  speakerActionScope: unknown;
}): UseReadyWorkspaceSurfacePropsInput['controllers'] {
  return input;
}

export function buildReadyWorkspaceSurfaceWaveformSlice(
  input: Record<string, unknown>,
): Record<string, unknown> {
  return input;
}

export function buildReadyWorkspaceSurfaceOverlaysSlice(
  input: Record<string, unknown>,
): Record<string, unknown> {
  return input;
}
