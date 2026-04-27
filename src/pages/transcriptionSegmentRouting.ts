import type { LayerDocType } from '../types/jieyuDbDocTypes';

export type SegmentEditMode = 'unit' | 'independent-segment' | 'time-subdivision';

export interface SegmentRoutingResult {
  layer: LayerDocType | undefined;
  segmentSourceLayer: LayerDocType | undefined;
  sourceLayerId: string;
  editMode: SegmentEditMode;
}

export interface SegmentTimelineRoutingResult extends SegmentRoutingResult {
  usesSegmentTimeline: boolean;
}