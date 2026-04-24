import type { BuildReadyWorkspaceStagePropsInput } from './transcriptionReadyWorkspacePropsBuilders';
import { canDeleteCurrentAudio } from './transcriptionMediaGuards';

export type BuildReadyWorkspaceStagePropsInputFromControllers = Omit<
  BuildReadyWorkspaceStagePropsInput,
  | 'selectedMediaId'
  | 'canDeleteAudio'
  | 'onOpenProjectSetup'
  | 'onOpenAudioImport'
  | 'onOpenSpeakerManagementPanel'
  | 'onDeleteCurrentProject'
  | 'onDeleteCurrentAudio'
  | 'handleImportFile'
  | 'onPreviewProjectArchiveImport'
  | 'onImportProjectArchive'
  | 'onApplyTextTimeMapping'
  | 'onExportEaf'
  | 'onExportTextGrid'
  | 'onExportTrs'
  | 'onExportFlextext'
  | 'onExportToolbox'
  | 'onExportJyt'
  | 'onExportJym'
  | 'mediaFileInputRef'
  | 'onDirectMediaImport'
  | 'activeWaveformUnitId'
> & {
  selectedTimelineMedia?: { id: string } | null;
  selectedMediaUrl?: string | null;
  setShowProjectSetup: (next: boolean) => void;
  setShowAudioImport: (next: boolean) => void;
  speakerController: {
    handleOpenSpeakerManagementPanel: BuildReadyWorkspaceStagePropsInput['onOpenSpeakerManagementPanel'];
  };
  projectMediaController: {
    handleDeleteCurrentProject: BuildReadyWorkspaceStagePropsInput['onDeleteCurrentProject'];
    handleDeleteCurrentAudio: BuildReadyWorkspaceStagePropsInput['onDeleteCurrentAudio'];
    mediaFileInputRef: BuildReadyWorkspaceStagePropsInput['mediaFileInputRef'];
    handleDirectMediaImport: BuildReadyWorkspaceStagePropsInput['onDirectMediaImport'];
  };
  importExportController: {
    handleImportFile: BuildReadyWorkspaceStagePropsInput['handleImportFile'];
    previewProjectArchiveImport: BuildReadyWorkspaceStagePropsInput['onPreviewProjectArchiveImport'];
    importProjectArchive: BuildReadyWorkspaceStagePropsInput['onImportProjectArchive'];
    handleExportEaf: BuildReadyWorkspaceStagePropsInput['onExportEaf'];
    handleExportTextGrid: BuildReadyWorkspaceStagePropsInput['onExportTextGrid'];
    handleExportTrs: BuildReadyWorkspaceStagePropsInput['onExportTrs'];
    handleExportFlextext: BuildReadyWorkspaceStagePropsInput['onExportFlextext'];
    handleExportToolbox: BuildReadyWorkspaceStagePropsInput['onExportToolbox'];
    handleExportJyt: BuildReadyWorkspaceStagePropsInput['onExportJyt'];
    handleExportJym: BuildReadyWorkspaceStagePropsInput['onExportJym'];
  };
  applyTextTimeMapping: NonNullable<BuildReadyWorkspaceStagePropsInput['onApplyTextTimeMapping']>;
  segmentScopeMediaId?: string;
  activeWaveformRegionId?: string | null;
};

export function buildReadyWorkspaceStagePropsInput(
  input: BuildReadyWorkspaceStagePropsInputFromControllers,
): BuildReadyWorkspaceStagePropsInput {
  const {
    selectedTimelineMedia,
    selectedMediaUrl,
    setShowProjectSetup,
    setShowAudioImport,
    speakerController,
    projectMediaController,
    importExportController,
    applyTextTimeMapping,
    segmentScopeMediaId,
    activeWaveformRegionId,
    ...rest
  } = input;

  return {
    ...rest,
    selectedMediaId: selectedTimelineMedia?.id ?? null,
    canDeleteAudio: canDeleteCurrentAudio({
      hasSelectedTimelineMedia: Boolean(selectedTimelineMedia),
      selectedMediaUrl,
    }),
    onOpenProjectSetup: () => setShowProjectSetup(true),
    onOpenAudioImport: () => setShowAudioImport(true),
    onOpenSpeakerManagementPanel: speakerController.handleOpenSpeakerManagementPanel,
    onDeleteCurrentProject: projectMediaController.handleDeleteCurrentProject,
    onDeleteCurrentAudio: projectMediaController.handleDeleteCurrentAudio,
    handleImportFile: importExportController.handleImportFile,
    onPreviewProjectArchiveImport: importExportController.previewProjectArchiveImport,
    onImportProjectArchive: importExportController.importProjectArchive,
    onApplyTextTimeMapping: async (mappingInput) => {
      await applyTextTimeMapping({
        ...mappingInput,
        ...(segmentScopeMediaId ? { sourceMediaId: segmentScopeMediaId } : {}),
      });
    },
    onExportEaf: importExportController.handleExportEaf,
    onExportTextGrid: importExportController.handleExportTextGrid,
    onExportTrs: importExportController.handleExportTrs,
    onExportFlextext: importExportController.handleExportFlextext,
    onExportToolbox: importExportController.handleExportToolbox,
    onExportJyt: importExportController.handleExportJyt,
    onExportJym: importExportController.handleExportJym,
    mediaFileInputRef: projectMediaController.mediaFileInputRef,
    onDirectMediaImport: projectMediaController.handleDirectMediaImport,
    activeWaveformUnitId: activeWaveformRegionId || null,
  };
}
