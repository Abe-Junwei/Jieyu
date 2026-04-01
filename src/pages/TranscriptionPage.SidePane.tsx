import type { ComponentProps } from 'react';
import { SidePaneSidebar } from '../components/SidePaneSidebar';
import { SpeakerRailProvider } from '../contexts/SpeakerRailContext';

type SidePaneSidebarProps = ComponentProps<typeof SidePaneSidebar>;
type SpeakerManagement = ComponentProps<typeof SpeakerRailProvider>['speakerManagement'];

interface TranscriptionPageSidePaneProps {
  speakerManagement: SpeakerManagement;
  selectedUtteranceIds: Set<string>;
  handleAssignSpeakerToSelectedRouted: () => Promise<void>;
  handleClearSpeakerOnSelectedRouted: () => Promise<void>;
  sidebarProps: SidePaneSidebarProps;
}

export function TranscriptionPageSidePane({
  speakerManagement,
  selectedUtteranceIds,
  handleAssignSpeakerToSelectedRouted,
  handleClearSpeakerOnSelectedRouted,
  sidebarProps,
}: TranscriptionPageSidePaneProps) {
  return (
    <>
      <SpeakerRailProvider
        speakerManagement={speakerManagement}
        selectedUtteranceIds={selectedUtteranceIds}
        handleAssignSpeakerToSelectedRouted={handleAssignSpeakerToSelectedRouted}
        handleClearSpeakerOnSelectedRouted={handleClearSpeakerOnSelectedRouted}
      >
        <SidePaneSidebar {...sidebarProps} />
      </SpeakerRailProvider>
    </>
  );
}
