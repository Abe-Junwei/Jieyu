import type { MutableRefObject, RefObject } from 'react';
import type { TimelineReadModel } from '../pages/timelineReadModel';

/**
 * Visible [start, end] window on the primary ruler (seconds in player time,
 * or logical timeline span in text-only shell). Matches `useZoom` `rulerView` state shape.
 */
export interface TimelineRulerViewWindow {
  start: number;
  end: number;
}

/** Authoritative zoom scalars (today split between orchestrator input and `useZoom` input; phase C collapses to one writer). */
export interface TimelineViewportScalars {
  zoomPxPerSec: number;
  logicalTimelineDurationSec: number;
  zoomPercent: number;
  maxZoomPercent: number;
  fitPxPerSec: number;
}

export interface TimelineViewportFrame {
  scrollLeftPx: number;
  pxPerDocSec: number;
  visibleStartSec: number;
  visibleEndSec: number;
}

/**
 * Read-only viewport snapshot: aligns with `TimelineReadModel.zoom` plus `useZoom` ruler output.
 * Phase C `useTimelineViewport` will own updates to these fields before read model recompute.
 */
export interface TimelineViewportProjection extends TimelineViewportScalars {
  rulerView: TimelineRulerViewWindow | null;
  waveformScrollLeft?: number;
  viewportFrame: TimelineViewportFrame;
}

/** Zoom/pan actions implemented by `useZoom` today; re-exported as the control surface of the future viewport hook. */
export interface TimelineViewportZoomControls {
  zoomToPercent: (
    newPercent: number,
    anchorFraction?: number,
    nextMode?: 'fit-all' | 'fit-selection' | 'custom',
  ) => void;
  zoomToUnit: (startTime: number, endTime: number) => void;
}

/** Current `useZoom` return shape; phase C merges with `TimelineViewportScalars` into `TimelineViewportProjection`. */
export type TimelineViewportZoomBridge = TimelineViewportZoomControls & {
  rulerView: TimelineRulerViewWindow | null;
};

/** Acoustic slice of `TimelineReadModel` — single alias so strip contracts track read model drift. */
export type AcousticStripSnapshot = TimelineReadModel['acoustic'];

/** DOM ref slots for strip plugins (`useRef` is MutableRefObject; some callers use RefObject). */
export type StripDomRef<T extends HTMLElement> = RefObject<T | null> | MutableRefObject<T | null>;

/**
 * Narrow contract for the waveform strip / `OrchestratorWaveformContent` boundary (phase B props shrink target).
 * DOM refs stay explicit until WaveSurfer lifecycle is fully behind a plugin façade.
 */
export interface AcousticStripContract {
  /** 完整 read model 声学切片；页顶波形 chrome 映射 `mapAcousticToTimelineChrome` 时用 `shell`+`globalState`（见 `OrchestratorWaveformContent`），tier 宿主仍读合同态 `state`。 */
  acoustic: AcousticStripSnapshot;
  waveCanvasRef: StripDomRef<HTMLDivElement>;
  tierContainerRef: StripDomRef<HTMLDivElement>;
}
