import type { LayerUnitDocType, MediaItemDocType } from '../types/transcriptionDomain.types';

export interface SelectedTimelineRowMeta {
  rowNumber: number;
  start: number;
  end: number;
}

/**
 * 选择上下文纯逻辑 | Pure selection-context logic extracted from the controller.
 */
export function resolveSelectedTimelineMedia(
  selectedUnitMedia: MediaItemDocType | undefined,
  mediaItemById: ReadonlyMap<string, MediaItemDocType>,
  selectedTimelineSegment: LayerUnitDocType | null,
  selectedTimelineOwnerUnit: LayerUnitDocType | null,
): MediaItemDocType | undefined {
  if (selectedUnitMedia) return selectedUnitMedia;
  const mediaId = selectedTimelineSegment?.mediaId ?? selectedTimelineOwnerUnit?.mediaId ?? '';
  return mediaId ? mediaItemById.get(mediaId) : undefined;
}

export function resolveSelectedTimelineRowMeta(
  unitsOnCurrentMedia: ReadonlyArray<LayerUnitDocType>,
  selectedTimelineOwnerUnit: LayerUnitDocType | null,
  units: ReadonlyArray<LayerUnitDocType>,
): SelectedTimelineRowMeta | null {
  if (!selectedTimelineOwnerUnit) return null;

  const rowIndex = unitsOnCurrentMedia.findIndex((item) => item.id === selectedTimelineOwnerUnit.id);
  if (rowIndex >= 0) {
    const row = unitsOnCurrentMedia[rowIndex];
    if (!row) return null;
    return {
      rowNumber: rowIndex + 1,
      start: row.startTime,
      end: row.endTime,
    };
  }

  const sameMediaRows = [...units]
    .filter((item) => item.mediaId === selectedTimelineOwnerUnit.mediaId)
    .sort((a, b) => a.startTime - b.startTime);
  const fallbackIndex = sameMediaRows.findIndex((item) => item.id === selectedTimelineOwnerUnit.id);
  const fallbackRow = fallbackIndex >= 0 ? sameMediaRows[fallbackIndex] : undefined;
  if (!fallbackRow) return null;
  return {
    rowNumber: fallbackIndex + 1,
    start: fallbackRow.startTime,
    end: fallbackRow.endTime,
  };
}

export function collectNoteTimelineUnitIds(
  units: ReadonlyArray<LayerUnitDocType>,
  segmentsByLayer: ReadonlyMap<string, ReadonlyArray<LayerUnitDocType>>,
): string[] {
  const ids = new Set<string>();
  for (const unit of units) {
    ids.add(unit.id);
  }
  for (const segments of segmentsByLayer.values()) {
    for (const segment of segments) {
      ids.add(segment.id);
    }
  }
  return [...ids];
}
