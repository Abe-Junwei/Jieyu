import { useMemo, type RefObject } from 'react';
import type { LayerDocType, LayerLinkDocType, LayerUnitContentDocType, LayerUnitDocType, OrthographyDocType, SpeakerDocType } from '../db';
import type { TimelineUnit } from '../hooks/transcriptionTypes';
import { useOrthographies } from '../hooks/useOrthographies';
import type { SidePaneSidebarMessages } from '../i18n/sidePaneSidebarMessages';
import { resolveLayerLinkHostTranscriptionLayerId } from '../utils/translationHostLinkQuery';
import { SidePaneSidebarLayerRow } from './SidePaneSidebarLayerRow';
import { SidePaneSidebarSegmentList } from './SidePaneSidebarSegmentList';
import { FolderOpenIcon } from './SvgIcons';

type SidebarHostLink = Pick<LayerLinkDocType, 'layerId' | 'transcriptionLayerKey' | 'hostTranscriptionLayerId' | 'isPreferred'>;

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
  layerLanguageNameById: Map<string, string>;
  layerLinks?: SidebarHostLink[];
  resolveTargetBundleRange: (draggedId: string, dropIndex: number) => BundleRange | null;
  defaultTranscriptionLayerId?: string;
  segmentsByLayer?: ReadonlyMap<string, LayerUnitDocType[]>;
  segmentContentByLayer?: ReadonlyMap<string, ReadonlyMap<string, LayerUnitContentDocType>>;
  unitsOnCurrentMedia?: LayerUnitDocType[];
  speakers?: SpeakerDocType[];
  getUnitTextForLayer?: (unit: LayerUnitDocType, layerId?: string) => string;
  onSelectTimelineUnit?: (unit: TimelineUnit) => void;
  onFocusLayer: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, layerId: string) => void;
  onMouseDown: (e: React.MouseEvent, layer: LayerDocType) => void;
  onKeyboardReorder: (layerId: string, currentIndex: number, direction: 'up' | 'down') => void;
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
  layerLanguageNameById,
  layerLinks = [],
  resolveTargetBundleRange,
  defaultTranscriptionLayerId,
  segmentsByLayer,
  segmentContentByLayer,
  unitsOnCurrentMedia,
  speakers,
  getUnitTextForLayer,
  onSelectTimelineUnit,
  onFocusLayer,
  onContextMenu,
  onMouseDown,
  onKeyboardReorder,
}: SidePaneSidebarOverviewProps) {
  const orthographyLanguageIds = useMemo(
    () => Array.from(new Set(sidePaneRows.map((layer) => layer.languageId).filter((languageId): languageId is string => Boolean(languageId)))),
    [sidePaneRows],
  );
  const orthographies = useOrthographies(orthographyLanguageIds);
  const orthographyById = useMemo<Map<string, OrthographyDocType>>(
    () => new Map(orthographies.map((orthography) => [orthography.id, orthography] as const)),
    [orthographies],
  );

  const transcriptionIdByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const layer of sidePaneRows) {
      if (layer.layerType !== 'transcription') continue;
      const key = layer.key?.trim() ?? '';
      if (key.length === 0 || map.has(key)) continue;
      map.set(key, layer.id);
    }
    return map;
  }, [sidePaneRows]);

  const hostLinksByTranslationLayerId = useMemo(() => {
    const map = new Map<string, SidebarHostLink[]>();
    for (const link of layerLinks) {
      const group = map.get(link.layerId) ?? [];
      group.push(link);
      map.set(link.layerId, group);
    }
    return map;
  }, [layerLinks]);

  const resolveTranslationHostLabel = useMemo(() => {
    return (layerId: string): string => {
      const links = hostLinksByTranslationLayerId.get(layerId) ?? [];
      if (links.length === 0) return '';

      let preferredHostId: string | undefined;
      for (const link of links) {
        if (!link.isPreferred) continue;
        const hostId = resolveLayerLinkHostTranscriptionLayerId(link, transcriptionIdByKey);
        if (hostId.length > 0) {
          preferredHostId = hostId;
          break;
        }
      }

      const dedupedHostIds: string[] = [];
      const seenHostIds = new Set<string>();
      for (const link of links) {
        const hostId = resolveLayerLinkHostTranscriptionLayerId(link, transcriptionIdByKey);
        if (!hostId || seenHostIds.has(hostId)) continue;
        seenHostIds.add(hostId);
        dedupedHostIds.push(hostId);
      }

      if (dedupedHostIds.length === 0) return '';

      const orderedHostIds = preferredHostId
        ? [preferredHostId, ...dedupedHostIds.filter((id) => id !== preferredHostId)]
        : dedupedHostIds;
      const labels = orderedHostIds
        .map((hostId) => {
          const base = layerLanguageNameById.get(hostId) ?? '';
          if (!base) return '';
          return hostId === preferredHostId ? `${base}★` : base;
        })
        .filter((label) => label.length > 0);

      return labels.join(' / ');
    };
  }, [hostLinksByTranslationLayerId, layerLanguageNameById, transcriptionIdByKey]);

  const renderSidePaneItems = () => {
    if (sidePaneRows.length === 0) {
      return (
        <div className="transcription-side-pane-empty">
          <FolderOpenIcon className="transcription-side-pane-empty-icon" />
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
        parentLabel={layer.layerType === 'translation'
          ? resolveTranslationHostLabel(layer.id)
          : (layer.parentLayerId ? (layerLanguageNameById.get(layer.parentLayerId) ?? '') : '')}
        orthographyById={orthographyById}
        messages={messages}
        onFocusLayer={onFocusLayer}
        onContextMenu={onContextMenu}
        onMouseDown={onMouseDown}
        onKeyboardReorder={onKeyboardReorder}
      />
    ));
  };

  return (
    <div
      ref={sidePaneOverviewRef}
      className={`transcription-side-pane-overview ${hasSidePaneHost ? 'transcription-side-pane-overview-portaled' : ''}`}
      data-layer-pane-interactive="true"
    >
      {hasSidePaneHost ? (
        <>
          <section className="app-side-pane-group app-side-pane-layer-group" aria-label={messages.overviewLayerListAria}>
            <div className="app-side-pane-nav app-side-pane-layer-list">
              {renderSidePaneItems()}
            </div>
          </section>
          <SidePaneSidebarSegmentList
            focusedLayerRowId={focusedLayerRowId}
            messages={messages}
            layers={sidePaneRows}
            showReviewPresets={false}
            {...(defaultTranscriptionLayerId !== undefined ? { defaultTranscriptionLayerId } : {})}
            {...(segmentsByLayer !== undefined ? { segmentsByLayer } : {})}
            {...(segmentContentByLayer !== undefined ? { segmentContentByLayer } : {})}
            {...(unitsOnCurrentMedia !== undefined ? { unitsOnCurrentMedia } : {})}
            {...(speakers !== undefined ? { speakers } : {})}
            {...(getUnitTextForLayer !== undefined ? { getUnitTextForLayer } : {})}
            {...(onSelectTimelineUnit !== undefined ? { onSelectTimelineUnit } : {})}
          />
        </>
      ) : (
        renderSidePaneItems()
      )}
    </div>
  );
}
