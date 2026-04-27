import type { AnnotationImportBridgeStrategy } from '../hooks/useImportExport.annotationImport';
import type { TranscriptionPageReadyWorkspaceLayoutProps } from './TranscriptionPage.ReadyWorkspaceLayout';
import { recordTranscriptionKeyboardAction } from '../utils/transcriptionKeyboardActionTelemetry';

type ReadyWorkspaceProjectHubProps = TranscriptionPageReadyWorkspaceLayoutProps['readyStageProps']['projectHubProps'];

export type BuildReadyWorkspaceProjectHubPropsInput = {
  currentProjectLabel: ReadyWorkspaceProjectHubProps['currentProjectLabel'];
  selectedMediaId?: ReadyWorkspaceProjectHubProps['selectedMediaId'];
  activeTextTimelineMode: ReadyWorkspaceProjectHubProps['activeTextTimelineMode'];
  activeTextTimeMapping: ReadyWorkspaceProjectHubProps['activeTextTimeMapping'];
  canDeleteProject: ReadyWorkspaceProjectHubProps['canDeleteProject'];
  canDeleteAudio: ReadyWorkspaceProjectHubProps['canDeleteAudio'];
  onOpenProjectSetup: ReadyWorkspaceProjectHubProps['onOpenProjectSetup'];
  onOpenAudioImport: ReadyWorkspaceProjectHubProps['onOpenAudioImport'];
  onOpenSpeakerManagementPanel: ReadyWorkspaceProjectHubProps['onOpenSpeakerManagementPanel'];
  onDeleteCurrentProject: ReadyWorkspaceProjectHubProps['onDeleteCurrentProject'];
  onDeleteCurrentAudio: ReadyWorkspaceProjectHubProps['onDeleteCurrentAudio'];
  handleImportFile: (file: File, strategy: AnnotationImportBridgeStrategy) => Promise<void>;
  onPreviewProjectArchiveImport: ReadyWorkspaceProjectHubProps['onPreviewProjectArchiveImport'];
  onImportProjectArchive: ReadyWorkspaceProjectHubProps['onImportProjectArchive'];
  onApplyTextTimeMapping: ReadyWorkspaceProjectHubProps['onApplyTextTimeMapping'];
  onExportEaf: ReadyWorkspaceProjectHubProps['onExportEaf'];
  onExportTextGrid: ReadyWorkspaceProjectHubProps['onExportTextGrid'];
  onExportTrs: ReadyWorkspaceProjectHubProps['onExportTrs'];
  onExportFlextext: ReadyWorkspaceProjectHubProps['onExportFlextext'];
  onExportToolbox: ReadyWorkspaceProjectHubProps['onExportToolbox'];
  onExportJyt: ReadyWorkspaceProjectHubProps['onExportJyt'];
  onExportJym: ReadyWorkspaceProjectHubProps['onExportJym'];
};

export function buildReadyWorkspaceProjectHubProps(
  input: BuildReadyWorkspaceProjectHubPropsInput,
): ReadyWorkspaceProjectHubProps {
  return {
    currentProjectLabel: input.currentProjectLabel,
    selectedMediaId: input.selectedMediaId ?? null,
    activeTextTimelineMode: input.activeTextTimelineMode ?? null,
    activeTextTimeMapping: input.activeTextTimeMapping ?? null,
    canDeleteProject: input.canDeleteProject,
    canDeleteAudio: input.canDeleteAudio,
    onOpenProjectSetup: () => {
      recordTranscriptionKeyboardAction('toolbarOpenProjectSetup');
      input.onOpenProjectSetup();
    },
    onOpenAudioImport: () => {
      recordTranscriptionKeyboardAction('toolbarOpenAudioImport');
      input.onOpenAudioImport();
    },
    onOpenSpeakerManagementPanel: () => {
      recordTranscriptionKeyboardAction('toolbarOpenSpeakerManagementPanel');
      input.onOpenSpeakerManagementPanel();
    },
    onDeleteCurrentProject: () => {
      recordTranscriptionKeyboardAction('deleteTranscriptionProject');
      input.onDeleteCurrentProject();
    },
    onDeleteCurrentAudio: () => {
      recordTranscriptionKeyboardAction('deleteTimelineAudio');
      input.onDeleteCurrentAudio();
    },
    onImportAnnotationFile: async (file: File, strategy: AnnotationImportBridgeStrategy) => {
      recordTranscriptionKeyboardAction('toolbarImportAnnotationFile');
      await input.handleImportFile(file, strategy);
    },
    onPreviewProjectArchiveImport: async (file: File) => {
      recordTranscriptionKeyboardAction('toolbarPreviewProjectArchiveImport');
      return input.onPreviewProjectArchiveImport(file);
    },
    onImportProjectArchive: async (file: File, strategy) => {
      recordTranscriptionKeyboardAction('toolbarImportProjectArchive');
      return input.onImportProjectArchive(file, strategy);
    },
    ...(input.onApplyTextTimeMapping
      ? {
        onApplyTextTimeMapping: async (mappingInput) => {
          recordTranscriptionKeyboardAction('toolbarApplyTextTimeMapping');
          await input.onApplyTextTimeMapping!(mappingInput);
        },
      }
      : {}),
    onExportEaf: () => {
      recordTranscriptionKeyboardAction('toolbarExportEaf');
      input.onExportEaf();
    },
    onExportTextGrid: () => {
      recordTranscriptionKeyboardAction('toolbarExportTextGrid');
      input.onExportTextGrid();
    },
    onExportTrs: () => {
      recordTranscriptionKeyboardAction('toolbarExportTrs');
      input.onExportTrs();
    },
    onExportFlextext: () => {
      recordTranscriptionKeyboardAction('toolbarExportFlextext');
      input.onExportFlextext();
    },
    onExportToolbox: () => {
      recordTranscriptionKeyboardAction('toolbarExportToolbox');
      input.onExportToolbox();
    },
    onExportJyt: async () => {
      recordTranscriptionKeyboardAction('toolbarExportJyt');
      await input.onExportJyt();
    },
    onExportJym: async () => {
      recordTranscriptionKeyboardAction('toolbarExportJym');
      await input.onExportJym();
    },
  };
}
