import type { BuildReadyWorkspaceLayoutStyleInput } from './transcriptionReadyWorkspacePropsBuilders';

export type BuildReadyWorkspaceLayoutStyleInputFromProps = {
  uiFontScale: number;
  adaptiveDialogWidth: number;
  adaptiveDialogCompactWidth: number;
  adaptiveDialogWideWidth: number;
  aiPanelWidth: number;
  isAiPanelCollapsed: boolean;
  laneLabelWidth: number;
  isTimelineLaneHeaderCollapsed: boolean;
  selectedMediaUrl: string | null | undefined;
  selectedMediaIsVideo: boolean;
  videoLayoutMode: string;
  videoRightPanelWidth: number;
};

export function buildReadyWorkspaceLayoutStyleInput(
  input: BuildReadyWorkspaceLayoutStyleInputFromProps,
): BuildReadyWorkspaceLayoutStyleInput {
  return {
    uiFontScale: input.uiFontScale,
    adaptiveDialogWidth: input.adaptiveDialogWidth,
    adaptiveDialogCompactWidth: input.adaptiveDialogCompactWidth,
    adaptiveDialogWideWidth: input.adaptiveDialogWideWidth,
    aiPanelWidth: input.aiPanelWidth,
    isAiPanelCollapsed: input.isAiPanelCollapsed,
    laneLabelWidth: input.laneLabelWidth,
    isTimelineLaneHeaderCollapsed: input.isTimelineLaneHeaderCollapsed,
    ...(input.selectedMediaUrl !== undefined ? { selectedMediaUrl: input.selectedMediaUrl } : {}),
    selectedMediaIsVideo: input.selectedMediaIsVideo,
    videoLayoutMode: input.videoLayoutMode,
    videoRightPanelWidth: input.videoRightPanelWidth,
  };
}
