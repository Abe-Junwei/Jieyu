import type { AnnotationImportBridgeStrategy } from '../hooks/useImportExport.annotationImport';
import type { TranscriptionPageReadyWorkspaceLayoutProps } from './TranscriptionPage.ReadyWorkspaceLayout';

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
    onOpenProjectSetup: input.onOpenProjectSetup,
    onOpenAudioImport: input.onOpenAudioImport,
    onOpenSpeakerManagementPanel: input.onOpenSpeakerManagementPanel,
    onDeleteCurrentProject: input.onDeleteCurrentProject,
    onDeleteCurrentAudio: input.onDeleteCurrentAudio,
    onImportAnnotationFile: async (file: File, strategy: AnnotationImportBridgeStrategy) => {
      await input.handleImportFile(file, strategy);
    },
    onPreviewProjectArchiveImport: input.onPreviewProjectArchiveImport,
    onImportProjectArchive: input.onImportProjectArchive,
    ...(input.onApplyTextTimeMapping ? { onApplyTextTimeMapping: input.onApplyTextTimeMapping } : {}),
    onExportEaf: input.onExportEaf,
    onExportTextGrid: input.onExportTextGrid,
    onExportTrs: input.onExportTrs,
    onExportFlextext: input.onExportFlextext,
    onExportToolbox: input.onExportToolbox,
    onExportJyt: input.onExportJyt,
    onExportJym: input.onExportJym,
  };
}
