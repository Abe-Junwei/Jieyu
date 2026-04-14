import type { RefObject } from 'react';
import type { LayerDocType } from '../db';
import type { SidePaneSidebarMessages } from '../i18n/sidePaneSidebarMessages';
import { SidePaneSidebarLayerRow } from './SidePaneSidebarLayerRow';
import { SidePaneSidebarFocusedLayerInspector } from './SidePaneSidebarFocusedLayerInspector';

type DragState = {
  draggedId: string;
  draggedLayerIds: string[];
  sourceIndex: number;
  sourceSpan: number;
  sourceType: 'transcription' | 'translation';
} | null;

type BundleRange = {
  rootId: string;
  start: number;
  end: number;
};

interface SidePaneSidebarOverviewProps {
  sidePaneOverviewRef: RefObject<HTMLDivElement | null>;
  hasSidePaneHost: boolean;
  messages: SidePaneSidebarMessages;
  sidePaneRows: LayerDocType[];
  dragState: DragState;
  dropTargetIndex: number | null;
  focusedLayerRowId: string;
  flashLayerRowId: string;
  bundleRootIds: Set<string>;
  bundleBoundaryIndexes: number[];
  layerLabelById: Map<string, string>;
  deletableLayers: LayerDocType[];
  focusedLayer: LayerDocType | null;
  focusedLayerParentKey: string;
  independentRootLayers: LayerDocType[];
  resolveTargetBundleRange: (draggedId: string, dropIndex: number) => BundleRange | null;
  onFocusLayer: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, layerId: string) => void;
  onMouseDown: (e: React.MouseEvent, layer: LayerDocType) => void;
  onKeyboardReorder: (layerId: string, currentIndex: number, direction: 'up' | 'down') => void;
  onOpenDeletePanel: (layerId: string) => void;
  onChangeLayerParent: (transcriptionKey: string, translationId: string) => void;
}

export function SidePaneSidebarOverview({
  sidePaneOverviewRef,
  hasSidePaneHost,
  messages,
  sidePaneRows,
  dragState,
  dropTargetIndex,
  focusedLayerRowId,
  flashLayerRowId,
  bundleRootIds,
  bundleBoundaryIndexes,
  layerLabelById,
  deletableLayers,
  focusedLayer,
  focusedLayerParentKey,
  independentRootLayers,
  resolveTargetBundleRange,
  onFocusLayer,
  onContextMenu,
  onMouseDown,
  onKeyboardReorder,
  onOpenDeletePanel,
  onChangeLayerParent,
}: SidePaneSidebarOverviewProps) {
  const renderSidePaneItems = () => {
    if (sidePaneRows.length === 0) {
      return (
        <div className="transcription-side-pane-empty">
          <span className="transcription-side-pane-empty-icon">📂</span>
          <span>{messages.emptyLayerHint}</span>
          <span className="transcription-side-pane-empty-hint" aria-hidden="true">←</span>
        </div>
      );
    }
    const targetBundleRange = dragState && dropTargetIndex !== null
      ? resolveTargetBundleRange(dragState.draggedId, dropTargetIndex)
      : null;
    const bundleBoundaryHighlight = dragState && dropTargetIndex !== null && bundleRootIds.has(dragState.draggedId) && bundleBoundaryIndexes.includes(dropTargetIndex) && dropTargetIndex !== dragState.sourceIndex
      ? (dropTargetIndex >= sidePaneRows.length
          ? { index: sidePaneRows.length - 1, position: 'bottom' as const }
          : { index: dropTargetIndex, position: 'top' as const })
      : null;
    return sidePaneRows.map((layer, index) => (
      <SidePaneSidebarLayerRow
        key={layer.id}
        layer={layer}
        index={index}
        focusedLayerRowId={focusedLayerRowId}
        flashLayerRowId={flashLayerRowId}
        dragState={dragState}
        dropTargetIndex={dropTargetIndex}
        boundaryHighlight={bundleBoundaryHighlight?.index === index ? bundleBoundaryHighlight.position : null}
        bundleTargetHighlighted={Boolean(targetBundleRange && index >= targetBundleRange.start && index < targetBundleRange.end)}
        parentLabel={layer.parentLayerId ? (layerLabelById.get(layer.parentLayerId) ?? '') : ''}
        messages={messages}
        onFocusLayer={onFocusLayer}
        onContextMenu={onContextMenu}
        onMouseDown={onMouseDown}
        onKeyboardReorder={onKeyboardReorder}
      />
    ));
  };

  const inspectorNode = (
    <SidePaneSidebarFocusedLayerInspector
      focusedLayer={focusedLayer}
      messages={messages}
      deletableLayers={deletableLayers}
      focusedLayerParentKey={focusedLayerParentKey}
      independentRootLayers={independentRootLayers}
      onOpenDeletePanel={onOpenDeletePanel}
      onChangeLayerParent={onChangeLayerParent}
    />
  );

  return (
    <div
      ref={sidePaneOverviewRef}
      className={`transcription-side-pane-overview ${hasSidePaneHost ? 'transcription-side-pane-overview-portaled' : ''}`}
      data-layer-pane-interactive="true"
    >
      {hasSidePaneHost ? (
        <>
          <section className="app-side-pane-group app-side-pane-layer-group" aria-label={messages.overviewLayerListAria}>
            <div className="app-side-pane-group-toggle app-side-pane-group-toggle-static" role="presentation">
              <span className="app-side-pane-section-title">{messages.overviewLayerListTitle}</span>
            </div>
            <div className="app-side-pane-nav app-side-pane-layer-list">
              {renderSidePaneItems()}
            </div>
          </section>
          <section className="app-side-pane-group app-side-pane-layer-group" aria-label={messages.overviewCurrentLayerCardAria}>
            <div className="app-side-pane-group-toggle app-side-pane-group-toggle-static" role="presentation">
              <span className="app-side-pane-section-title">{messages.overviewCurrentLayerTitle}</span>
            </div>
            <div className="app-side-pane-nav app-side-pane-layer-inspector-wrap">
              {inspectorNode}
            </div>
          </section>
        </>
      ) : (
        <>
          {renderSidePaneItems()}
          {inspectorNode}
        </>
      )}
    </div>
  );
}
