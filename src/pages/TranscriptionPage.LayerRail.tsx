import type { ComponentProps, PointerEvent as ReactPointerEvent } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { LayerRailSidebar } from '../components/LayerRailSidebar';
import { SpeakerRailProvider } from '../contexts/SpeakerRailContext';

type LayerRailSidebarProps = ComponentProps<typeof LayerRailSidebar>;
type SpeakerManagement = ComponentProps<typeof SpeakerRailProvider>['speakerManagement'];

interface TranscriptionPageLayerRailProps {
  speakerManagement: SpeakerManagement;
  sidebarProps: LayerRailSidebarProps;
  isLayerRailCollapsed: boolean;
  onLayerRailResizeStart: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onLayerRailToggle: () => void;
  resizeLabel: string;
  expandLabel: string;
  collapseLabel: string;
}

export function TranscriptionPageLayerRail({
  speakerManagement,
  sidebarProps,
  isLayerRailCollapsed,
  onLayerRailResizeStart,
  onLayerRailToggle,
  resizeLabel,
  expandLabel,
  collapseLabel,
}: TranscriptionPageLayerRailProps) {
  return (
    <>
      <SpeakerRailProvider speakerManagement={speakerManagement}>
        <LayerRailSidebar {...sidebarProps} />
      </SpeakerRailProvider>
      <div
        className="transcription-layer-rail-resizer"
        onPointerDown={onLayerRailResizeStart}
        role="separator"
        aria-orientation="vertical"
        aria-label={resizeLabel}
      />
      <button
        type="button"
        className="transcription-layer-rail-toggle"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onLayerRailToggle}
        aria-label={isLayerRailCollapsed ? expandLabel : collapseLabel}
        title={isLayerRailCollapsed ? expandLabel : collapseLabel}
      >
        {isLayerRailCollapsed
          ? <ChevronRight size={14} aria-hidden="true" />
          : <ChevronLeft size={14} aria-hidden="true" />}
      </button>
    </>
  );
}
