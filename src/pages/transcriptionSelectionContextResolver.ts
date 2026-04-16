import type { LayerSegmentDocType, MediaItemDocType, UtteranceDocType } from '../db';

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
  selectedTimelineSegment: LayerSegmentDocType | null,
  selectedTimelineOwnerUnit: UtteranceDocType | null,
): MediaItemDocType | undefined {
  if (selectedUnitMedia) return selectedUnitMedia;
  const mediaId = selectedTimelineSegment?.mediaId ?? selectedTimelineOwnerUnit?.mediaId ?? '';
  return mediaId ? mediaItemById.get(mediaId) : undefined;
}

export function resolveSelectedTimelineRowMeta(
  utterancesOnCurrentMedia: ReadonlyArray<UtteranceDocType>,
  selectedTimelineOwnerUnit: UtteranceDocType | null,
  utterances: ReadonlyArray<UtteranceDocType>,
): SelectedTimelineRowMeta | null {
  if (!selectedTimelineOwnerUnit) return null;

  const rowIndex = utterancesOnCurrentMedia.findIndex((item) => item.id === selectedTimelineOwnerUnit.id);
  if (rowIndex >= 0) {
    const row = utterancesOnCurrentMedia[rowIndex];
    if (!row) return null;
    return {
      rowNumber: rowIndex + 1,
      start: row.startTime,
      end: row.endTime,
    };
  }

  const sameMediaRows = [...utterances]
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
  utterances: ReadonlyArray<UtteranceDocType>,
  segmentsByLayer: ReadonlyMap<string, ReadonlyArray<LayerSegmentDocType>>,
): string[] {
  const ids = new Set<string>();
  for (const utterance of utterances) {
    ids.add(utterance.id);
  }
  for (const segments of segmentsByLayer.values()) {
    for (const segment of segments) {
      ids.add(segment.id);
    }
  }
  return [...ids];
}
