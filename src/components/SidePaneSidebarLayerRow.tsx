import { memo } from 'react';
import type { LayerDocType } from '../db';
import type { SidePaneSidebarMessages } from '../i18n/sidePaneSidebarMessages';
import { formatSidePaneLayerLabel, getLayerLabelParts } from '../utils/transcriptionFormatters';

type DragState = {
  draggedId: string;
  draggedLayerIds: string[];
  sourceIndex: number;
  sourceSpan: number;
  sourceType: 'transcription' | 'translation';
} | null;

type SidePaneSidebarLayerRowProps = {
  layer: LayerDocType;
  index: number;
  focusedLayerRowId: string;
  flashLayerRowId: string;
  dragState: DragState;
  dropTargetIndex: number | null;
  boundaryHighlight: 'top' | 'bottom' | null;
  bundleTargetHighlighted: boolean;
  parentLabel: string;
  messages: SidePaneSidebarMessages;
  onFocusLayer: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, layerId: string) => void;
  onMouseDown: (e: React.MouseEvent, layer: LayerDocType) => void;
  onKeyboardReorder: (layerId: string, currentIndex: number, direction: 'up' | 'down') => void;
};

export const SidePaneSidebarLayerRow = memo(function SidePaneSidebarLayerRow({
  layer,
  index,
  focusedLayerRowId,
  flashLayerRowId,
  dragState,
  dropTargetIndex,
  boundaryHighlight,
  bundleTargetHighlighted,
  parentLabel,
  messages,
  onFocusLayer,
  onContextMenu,
  onMouseDown,
  onKeyboardReorder,
}: SidePaneSidebarLayerRowProps) {
  const layerLabel = formatSidePaneLayerLabel(layer);
  const labelParts = getLayerLabelParts(layer);
  const isActiveLayer = layer.id === focusedLayerRowId;
  const isFlashLayer = layer.id === flashLayerRowId;
  const isDragged = dragState?.draggedLayerIds.includes(layer.id) ?? false;
  const showDropIndicator = dropTargetIndex === index && !isDragged;
  const isTranslationLayer = layer.layerType === 'translation';
  const hasDependency = Boolean(parentLabel);

  return (
    <div
      key={layer.id}
      className={[
        'transcription-side-pane-item-row',
        boundaryHighlight === 'top' ? 'transcription-side-pane-item-row-boundary-highlight-top' : '',
        boundaryHighlight === 'bottom' ? 'transcription-side-pane-item-row-boundary-highlight-bottom' : '',
        bundleTargetHighlighted ? 'transcription-side-pane-item-row-bundle-target' : '',
      ].filter(Boolean).join(' ')}
    >
      {showDropIndicator && (
        <div className="transcription-side-pane-drop-indicator" />
      )}
      <button
        type="button"
        className={`transcription-side-pane-item ${isActiveLayer ? 'transcription-side-pane-item-active' : ''} ${isFlashLayer ? 'transcription-side-pane-item-flash' : ''} ${isDragged ? 'transcription-side-pane-item-dragging' : ''} ${isTranslationLayer ? 'transcription-side-pane-item-translation' : 'transcription-side-pane-item-transcription'} ${hasDependency ? 'transcription-side-pane-item-dependent' : ''}`}
        onClick={() => !dragState && onFocusLayer(layer.id)}
        onContextMenu={(event) => onContextMenu(event, layer.id)}
        onMouseDown={(event) => !dragState && onMouseDown(event, layer)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault();
            onKeyboardReorder(layer.id, index, event.key === 'ArrowUp' ? 'up' : 'down');
          }
        }}
        title={layerLabel}
        aria-roledescription={messages.draggableLayerRoleDesc}
      >
        <span className="transcription-side-pane-item-drag-handle" aria-hidden="true">⠇</span>
        <span className="transcription-side-pane-item-chip" aria-hidden="true">
          {isTranslationLayer ? messages.layerTypeTranslationShort : messages.layerTypeTranscriptionShort}
        </span>
        <span className="transcription-side-pane-item-label">
          <strong className="transcription-side-pane-item-type">{labelParts.lang}</strong>
          {labelParts.alias ? <span className="transcription-side-pane-item-alias">{labelParts.alias}</span> : null}
        </span>
      </button>
    </div>
  );
});
