/**
 * 选中层的有内容语段列表 | Segment list with content for the focused layer
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { LayerSegmentContentDocType, LayerSegmentDocType } from '../db';
import type { SidePaneSidebarMessages } from '../i18n/sidePaneSidebarMessages';
import { LayerSegmentQueryService } from '../services/LayerSegmentQueryService';
import { formatTime } from '../utils/transcriptionFormatters';

interface SidePaneSidebarSegmentListProps {
  focusedLayerRowId: string;
  messages: SidePaneSidebarMessages;
}

interface SegmentItem {
  segment: LayerSegmentDocType;
  content: LayerSegmentContentDocType | undefined;
}

export function SidePaneSidebarSegmentList({
  focusedLayerRowId,
  messages,
}: SidePaneSidebarSegmentListProps) {
  const [items, setItems] = useState<SegmentItem[]>([]);
  const [filterText, setFilterText] = useState('');

  const loadSegments = useCallback(async (layerId: string) => {
    if (!layerId) {
      setItems([]);
      return;
    }
    const segments = await LayerSegmentQueryService.listSegmentsByLayerId(layerId);
    if (segments.length === 0) {
      setItems([]);
      return;
    }
    const segmentIds = segments.map((s) => s.id);
    const contents = await LayerSegmentQueryService.listSegmentContentsBySegmentIds(segmentIds, { layerId });

    // 按 segmentId 取最新 content | Pick latest content per segmentId
    const contentBySegmentId = new Map<string, LayerSegmentContentDocType>();
    for (const c of contents) {
      const existing = contentBySegmentId.get(c.segmentId);
      if (!existing || c.updatedAt >= existing.updatedAt) {
        contentBySegmentId.set(c.segmentId, c);
      }
    }

    const result: SegmentItem[] = segments.map((seg) => ({
      segment: seg,
      content: contentBySegmentId.get(seg.id),
    }));
    setItems(result);
  }, []);

  useEffect(() => {
    void loadSegments(focusedLayerRowId);
  }, [focusedLayerRowId, loadSegments]);

  const filtered = useMemo(() => {
    if (!filterText.trim()) return items;
    const keyword = filterText.trim().toLowerCase();
    return items.filter((item) => item.content?.text?.toLowerCase().includes(keyword));
  }, [items, filterText]);

  return (
    <section className="app-side-pane-group app-side-pane-segment-list-group" aria-label={messages.segmentListAria}>
      <div className="app-side-pane-group-toggle app-side-pane-group-toggle-static" role="presentation">
        <span className="app-side-pane-section-title">{messages.segmentListTitle}</span>
      </div>
      <div className="app-side-pane-segment-list-filter">
        <input
          type="text"
          className="app-side-pane-segment-list-filter-input"
          placeholder={messages.segmentListFilterPlaceholder}
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          aria-label={messages.segmentListFilterPlaceholder}
        />
      </div>
      <div className="app-side-pane-segment-list-scroll">
        {filtered.length === 0 ? (
          <div className="app-side-pane-segment-list-empty">{messages.segmentListNoSegments}</div>
        ) : (
          <ul className="app-side-pane-segment-list">
            {filtered.map((item) => {
              const text = item.content?.text?.trim();
              return (
                <li key={item.segment.id} className={`app-side-pane-segment-list-item${text ? '' : ' app-side-pane-segment-list-item-empty'}`}>
                  <span className="app-side-pane-segment-list-item-time">
                    {messages.segmentListTimeRange(formatTime(item.segment.startTime), formatTime(item.segment.endTime))}
                  </span>
                  {text
                    ? <span className="app-side-pane-segment-list-item-text">{text}</span>
                    : <span className="app-side-pane-segment-list-item-text app-side-pane-segment-list-item-text-empty">{messages.segmentListEmpty}</span>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
