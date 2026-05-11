import type { BuildReadyWorkspaceViewModelsInputArgs } from './readyWorkspaceViewModelsInputBuilder';
import { buildReadyWorkspaceViewModelsTailFireAndForgetHandlers } from './readyWorkspaceViewModelsTailFireAndForgetHandlers';
import { useReadyWorkspaceAudioCaptureController } from './useReadyWorkspaceAudioCaptureController';

type TailFields = BuildReadyWorkspaceViewModelsInputArgs['tail'];

type AudioCaptureControllers = ReturnType<typeof useReadyWorkspaceAudioCaptureController>;

type TailSliceInjectedKeys =
  | keyof ReturnType<typeof buildReadyWorkspaceViewModelsTailFireAndForgetHandlers>
  | 'showExportMenu'
  | 'exportMenuRef'
  | 'setShowExportMenu'
  | 'handleExportJyt'
  | 'handleExportJym'
  | 'handleImportFile'
  | 'handleDeleteCurrentAudio'
  | 'handleDeleteCurrentProject'
  | 'handleAutoSegment'
  | 'autoSegmentBusy'
  | 'searchableItems'
  | 'assistantRuntimeProps'
  | 'analysisRuntimeProps'
  | 'speakerDialogStateRouted'
  | 'speakerSavingRouted'
  | 'closeSpeakerDialogRouted'
  | 'confirmSpeakerDialogRouted'
  | 'updateSpeakerDialogDraftNameRouted'
  | 'updateSpeakerDialogTargetKeyRouted'
  | 'handleProjectSetupSubmit'
  | 'handleAudioImport'
  | 'audioImportDisposition'
  | 'mediaFileInputRef'
  | 'audioDeleteConfirm'
  | 'setAudioDeleteConfirm'
  | 'handleConfirmAudioDelete'
  | 'projectDeleteConfirm'
  | 'setProjectDeleteConfirm'
  | 'handleConfirmProjectDelete'
  | 'handleSearchReplace'
  | 'handleGlobalPlayPauseAction';

export type ReadyWorkspaceViewModelsTailRestInput = Omit<TailFields, TailSliceInjectedKeys>;

export type ReadyWorkspaceViewModelsTailSliceInput = {
  importExportController: AudioCaptureControllers['importExportController'];
  projectMediaController: AudioCaptureControllers['projectMediaController'];
  assistantSidebarController: Pick<TailFields, 'assistantRuntimeProps' | 'analysisRuntimeProps'>;
  speakerController: Pick<
    TailFields,
    | 'speakerDialogStateRouted'
    | 'speakerSavingRouted'
    | 'closeSpeakerDialogRouted'
    | 'confirmSpeakerDialogRouted'
    | 'updateSpeakerDialogDraftNameRouted'
    | 'updateSpeakerDialogTargetKeyRouted'
  >;
  timelineSyncController: Pick<TailFields, 'handleSearchReplace'>;
  playbackKeyboardController: Pick<TailFields, 'handleGlobalPlayPauseAction'>;
  workspaceRest: ReadyWorkspaceViewModelsTailRestInput;
};

/** Assembles orchestrator `tail` fields from controllers + workspace-local rest (ReadyWorkspace Phase B). */
export function buildReadyWorkspaceViewModelsTailSlice(
  input: ReadyWorkspaceViewModelsTailSliceInput,
): TailFields {
  const {
    importExportController,
    projectMediaController,
    assistantSidebarController,
    speakerController,
    timelineSyncController,
    playbackKeyboardController,
    workspaceRest,
  } = input;
  return {
    ...workspaceRest,
    ...buildReadyWorkspaceViewModelsTailFireAndForgetHandlers({
      importExportController,
      projectMediaController,
    }),
    showExportMenu: importExportController.showExportMenu,
    exportMenuRef: importExportController.exportMenuRef,
    setShowExportMenu: importExportController.setShowExportMenu,
    handleExportJyt: importExportController.handleExportJyt,
    handleExportJym: importExportController.handleExportJym,
    handleImportFile: importExportController.handleImportFile,
    handleDeleteCurrentAudio: projectMediaController.handleDeleteCurrentAudio,
    handleDeleteCurrentProject: projectMediaController.handleDeleteCurrentProject,
    handleAutoSegment: projectMediaController.handleAutoSegment,
    autoSegmentBusy: projectMediaController.autoSegmentBusy,
    searchableItems: projectMediaController.searchableItems,
    assistantRuntimeProps: assistantSidebarController.assistantRuntimeProps,
    analysisRuntimeProps: assistantSidebarController.analysisRuntimeProps,
    speakerDialogStateRouted: speakerController.speakerDialogStateRouted,
    speakerSavingRouted: speakerController.speakerSavingRouted,
    closeSpeakerDialogRouted: speakerController.closeSpeakerDialogRouted,
    confirmSpeakerDialogRouted: speakerController.confirmSpeakerDialogRouted,
    updateSpeakerDialogDraftNameRouted: speakerController.updateSpeakerDialogDraftNameRouted,
    updateSpeakerDialogTargetKeyRouted: speakerController.updateSpeakerDialogTargetKeyRouted,
    handleProjectSetupSubmit: projectMediaController.handleProjectSetupSubmit,
    handleAudioImport: projectMediaController.handleAudioImport,
    audioImportDisposition: projectMediaController.audioImportDisposition,
    mediaFileInputRef: projectMediaController.mediaFileInputRef,
    audioDeleteConfirm: projectMediaController.audioDeleteConfirm,
    setAudioDeleteConfirm: projectMediaController.setAudioDeleteConfirm,
    handleConfirmAudioDelete: projectMediaController.handleConfirmAudioDelete,
    projectDeleteConfirm: projectMediaController.projectDeleteConfirm,
    setProjectDeleteConfirm: projectMediaController.setProjectDeleteConfirm,
    handleConfirmProjectDelete: projectMediaController.handleConfirmProjectDelete,
    handleSearchReplace: timelineSyncController.handleSearchReplace,
    handleGlobalPlayPauseAction: playbackKeyboardController.handleGlobalPlayPauseAction,
  };
}
