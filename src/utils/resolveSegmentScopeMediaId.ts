import type { LayerUnitDocType, MediaItemDocType } from '../db';
import type { TimelineUnit } from '../hooks/transcriptionTypes';
import { isSegmentTimelineUnit, isUnitTimelineUnit } from '../hooks/transcriptionTypes';

/**
 * 与 `resolveSelectedTimelineMedia` 对齐的「segment / segment 内容」加载用媒体 id：
 * 侧栏选中媒体 → 当前 unit 选区宿主行的 mediaId → 列表首条（与 `useTranscriptionMediaSelection` 收敛一致）。
 * Aligns segment DB scope with timeline selection without requiring `segmentsByLayer` first.
 */
export function resolveSegmentScopeMediaId(
  selectedUnitMedia: MediaItemDocType | undefined,
  selectedTimelineUnit: TimelineUnit | null,
  units: ReadonlyArray<LayerUnitDocType>,
  mediaItems: ReadonlyArray<MediaItemDocType>,
): string | undefined {
  const fromSidebar = selectedUnitMedia?.id?.trim() ?? '';
  if (fromSidebar.length > 0) return fromSidebar;

  if (selectedTimelineUnit && isUnitTimelineUnit(selectedTimelineUnit)) {
    const row = units.find((u) => u.id === selectedTimelineUnit.unitId);
    const mid = row?.mediaId?.trim() ?? '';
    if (mid.length > 0) return mid;
  }

  const first = mediaItems[0]?.id?.trim() ?? '';
  return first.length > 0 ? first : undefined;
}

/**
 * 当 segment 图已按某 media 加载后，从当前 segment 选区反推其 `mediaId`（多占位/与首条 media 不一致时收敛作用域）。
 */
export function resolveSegmentMediaIdFromSegmentGraph(
  selectedTimelineUnit: TimelineUnit | null,
  segmentsByLayer: ReadonlyMap<string, ReadonlyArray<Pick<LayerUnitDocType, 'id' | 'mediaId'>>> | undefined,
): string | undefined {
  if (!selectedTimelineUnit || !isSegmentTimelineUnit(selectedTimelineUnit)) return undefined;
  const layerId = selectedTimelineUnit.layerId?.trim() ?? '';
  if (!layerId) return undefined;
  const list = segmentsByLayer?.get(layerId);
  const seg = list?.find((s) => s.id === selectedTimelineUnit.unitId);
  const mid = seg?.mediaId?.trim() ?? '';
  return mid.length > 0 ? mid : undefined;
}
