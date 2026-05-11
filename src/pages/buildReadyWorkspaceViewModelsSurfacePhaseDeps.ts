import type { Locale } from '../i18n';

type TranscriptionDataReturn = ReturnType<
  typeof import('../hooks/useTranscriptionData').useTranscriptionData
>;
type DomainShellReturn = ReturnType<
  typeof import('./useReadyWorkspaceDomainShellPhase').useReadyWorkspaceDomainShellPhase
>;
type PreBootstrapReturn = ReturnType<
  typeof import('./useReadyWorkspacePreBootstrapChromePhase').useReadyWorkspacePreBootstrapChromePhase
>;
type BootstrapReturn = ReturnType<
  typeof import('./useReadyWorkspaceReadyPhaseBootstrap').useReadyWorkspaceReadyPhaseBootstrap
>;
type WaveformBridgeReturn = ReturnType<
  typeof import('./useReadyWorkspaceWaveformBridgePhase').useReadyWorkspaceWaveformBridgePhase
>;
type SelectionAiReturn = ReturnType<
  typeof import('./useReadyWorkspaceSelectionAndAiPrepPhase').useReadyWorkspaceSelectionAndAiPrepPhase
>;
type TimelineAssistantReturn = ReturnType<
  typeof import('./useReadyWorkspaceTimelineAssistantPlaybackPhase').useReadyWorkspaceTimelineAssistantPlaybackPhase
>;
type SidebarTrackReturn = ReturnType<
  typeof import('./useReadyWorkspaceSidebarAndTrackPhase').useReadyWorkspaceSidebarAndTrackPhase
>;

export interface BuildReadyWorkspaceViewModelsSurfacePhaseDeps {
  data: TranscriptionDataReturn;
  domainShell: DomainShellReturn;
  locale: Locale;
  pre: PreBootstrapReturn;
  bootstrap: BootstrapReturn;
  waveform: WaveformBridgeReturn;
  selectionAi: SelectionAiReturn;
  timeline: TimelineAssistantReturn;
  sidebar: SidebarTrackReturn;
}
