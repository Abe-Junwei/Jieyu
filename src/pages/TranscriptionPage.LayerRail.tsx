import type { ComponentProps, PointerEvent as ReactPointerEvent } from 'react';
import { LayerRailSidebar } from '../components/LayerRailSidebar';
import { SpeakerRailProvider } from '../contexts/SpeakerRailContext';

type LayerRailSidebarProps = ComponentProps<typeof LayerRailSidebar>;
type SpeakerManagement = ComponentProps<typeof SpeakerRailProvider>['speakerManagement'];

interface TranscriptionPageLayerRailProps {
  speakerManagement: SpeakerManagement;
  sidebarProps: LayerRailSidebarProps;
  isLayerRailCollapsed: boolean;
  hoverExpandEnabled: boolean;
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
  hoverExpandEnabled,
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
      <div className="transcription-layer-rail-handle-cluster">
        <div
          className="transcription-layer-rail-hover-zone"
          onMouseEnter={() => {
            if (isLayerRailCollapsed && hoverExpandEnabled) onLayerRailToggle();
          }}
          style={{ display: isLayerRailCollapsed ? undefined : 'none', pointerEvents: hoverExpandEnabled ? 'auto' : 'none' }}
        />
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
          onMouseEnter={() => {
            if (isLayerRailCollapsed && hoverExpandEnabled) onLayerRailToggle();
          }}
          aria-label={isLayerRailCollapsed ? expandLabel : collapseLabel}
          title={isLayerRailCollapsed ? expandLabel : collapseLabel}
        >
          <span className="transcription-panel-toggle-icon" aria-hidden="true">
            <span
              className={`transcription-panel-toggle-triangle ${isLayerRailCollapsed ? 'transcription-panel-toggle-triangle-right' : 'transcription-panel-toggle-triangle-left'}`}
            />
          </span>
        </button>
      </div>
    </>
  );
}
