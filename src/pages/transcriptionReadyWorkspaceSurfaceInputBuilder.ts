import type {
  BuildReadyWorkspaceConflictReviewDrawerPropsInput,
  BuildReadyWorkspaceLayoutStyleInput,
} from './transcriptionReadyWorkspacePropsBuilders';
export {
  buildReadyWorkspaceSidePanePropsInput,
  type BuildReadyWorkspaceSidePanePropsInputFromControllers,
} from './transcriptionReadyWorkspaceSidePaneInputBuilder';

export {
  buildReadyWorkspaceOverlaysPropsInput,
  type BuildReadyWorkspaceOverlaysPropsInputFromControllers,
} from './transcriptionReadyWorkspaceOverlaysInputBuilder';

export {
  buildReadyWorkspaceWaveformContentPropsInput,
  type BuildReadyWorkspaceWaveformContentPropsInputFromControllers,
} from './transcriptionReadyWorkspaceWaveformInputBuilder';

export {
  buildReadyWorkspaceStagePropsInput,
  type BuildReadyWorkspaceStagePropsInputFromControllers,
} from './transcriptionReadyWorkspaceStagePropsInputBuilder';

export type BuildReadyWorkspaceConflictReviewDrawerPropsInputFromControllers = {
  tickets: BuildReadyWorkspaceConflictReviewDrawerPropsInput['tickets'];
  applyRemoteConflictTicket: BuildReadyWorkspaceConflictReviewDrawerPropsInput['onApplyRemoteConflictTicket'];
  keepLocalConflictTicket: BuildReadyWorkspaceConflictReviewDrawerPropsInput['onKeepLocalConflictTicket'];
  postponeConflictTicket: BuildReadyWorkspaceConflictReviewDrawerPropsInput['onPostponeConflictTicket'];
};

export function buildReadyWorkspaceConflictReviewDrawerPropsInput(
  input: BuildReadyWorkspaceConflictReviewDrawerPropsInputFromControllers,
): BuildReadyWorkspaceConflictReviewDrawerPropsInput {
  return {
    tickets: input.tickets,
    onApplyRemoteConflictTicket: input.applyRemoteConflictTicket,
    onKeepLocalConflictTicket: input.keepLocalConflictTicket,
    onPostponeConflictTicket: input.postponeConflictTicket,
  };
}

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