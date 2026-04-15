import type { ComponentProps } from 'react';
import { SidePaneSidebar } from '../components/SidePaneSidebar';
import { SpeakerRailProvider } from '../contexts/SpeakerRailContext';

type SidePaneSidebarProps = ComponentProps<typeof SidePaneSidebar>;
type SpeakerManagement = ComponentProps<typeof SpeakerRailProvider>['speakerManagement'];

interface TranscriptionPageSidePaneProps {
  speakerManagement: SpeakerManagement;
  selectedUnitIds: Set<string>;
  handleAssignSpeakerToSelectedRouted: () => Promise<void>;
  handleClearSpeakerOnSelectedRouted: () => Promise<void>;
  sidebarProps: SidePaneSidebarProps;
}

export function TranscriptionPageSidePane({
  speakerManagement,
  selectedUnitIds,
  handleAssignSpeakerToSelectedRouted,
  handleClearSpeakerOnSelectedRouted,
  sidebarProps,
}: TranscriptionPageSidePaneProps) {
  return (
    <>
      <SpeakerRailProvider
        speakerManagement={speakerManagement}
        selectedUnitIds={selectedUnitIds}
        handleAssignSpeakerToSelectedRouted={handleAssignSpeakerToSelectedRouted}
        handleClearSpeakerOnSelectedRouted={handleClearSpeakerOnSelectedRouted}
      >
        <SidePaneSidebar {...sidebarProps} />
      </SpeakerRailProvider>
    </>
  );
}
