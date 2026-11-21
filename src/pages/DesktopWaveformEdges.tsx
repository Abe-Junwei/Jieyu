import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { DesktopTranscriptionCreatePreview } from './DesktopTranscriptionCreatePreview';
import type { TimeEdge, TimedEdgeUnit } from './desktopTranscriptionEdge';
import type { ShownPreview } from './desktopTranscriptionEdgePointer';

/**
 * Drag handles drawn over the waveform for the main row's segments: the two edges resize,
 * the top grip moves the whole segment. A drag shows a dashed outline of the new range.
 */
export function DesktopWaveformEdges(props: {
  units: readonly TimedEdgeUnit[];
  preview: ShownPreview | null;
  zoomPxPerSec: number;
  scrollLeftPx: number;
  selectedUnitId: string | null;
  selectedUnitIds: readonly string[];
  onEdge: (unitId: string, edge: TimeEdge, event: ReactPointerEvent<HTMLElement>) => void;
  /** `seekSec` is the media time under the press, for a press that never travels. */
  onMove: (unitId: string, event: ReactPointerEvent<HTMLElement>, seekSec: number) => void;
  onContextMenu: (unitId: string, x: number, y: number) => void;
}) {
  const secAt = (event: ReactPointerEvent<HTMLElement>) => {
    const stage = event.currentTarget.closest('.desktop-tx-wave-edges')?.getBoundingClientRect();
    const x = event.clientX - (stage?.left ?? 0) + props.scrollLeftPx;
    return Math.max(0, x / props.zoomPxPerSec);
  };
  const px = (ms: number) => (ms / 1000) * props.zoomPxPerSec - props.scrollLeftPx;
  const frame = (left: number, width: number) =>
    ({ '--wave-left': `${left}px`, '--wave-w': `${width}px` }) as CSSProperties;
  const ghost = (key: string, startMs: number, endMs: number) => (
    <DesktopTranscriptionCreatePreview
      key={key}
      className="desktop-tx-wave-ghost"
      style={frame(px(startMs), Math.max(2, ((endMs - startMs) / 1000) * props.zoomPxPerSec))}
    />
  );
  const preview = props.preview;
  return (
    <div className="desktop-tx-wave-edges" data-testid="desktop-wave-edges">
      {props.units.map((unit) => {
        const width = ((unit.endMs - unit.startMs) / 1000) * props.zoomPxPerSec;
        return (
          <div
            key={unit.id}
            className={`desktop-tx-wave-seg${props.selectedUnitIds.includes(unit.id) ? ' is-selected' : ''}${unit.id !== props.selectedUnitId && props.selectedUnitIds.includes(unit.id) ? ' is-also' : ''}`}
            style={frame(px(unit.startMs), width)}
            data-wave-unit={unit.id}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              props.onContextMenu(unit.id, event.clientX, event.clientY);
            }}
          >
            {unit.id === props.selectedUnitId ? (
              <div
                className="desktop-tx-wave-body"
                data-testid="desktop-wave-body"
                onPointerDown={(event) => props.onMove(unit.id, event, secAt(event))}
              />
            ) : null}
            <div
              className="desktop-tx-wave-grip"
              data-testid="desktop-wave-grip"
              onPointerDown={(event) => props.onMove(unit.id, event, secAt(event))}
            />
            <div
              className="desktop-tx-wave-handle is-start"
              data-testid="desktop-wave-handle-start"
              onPointerDown={(event) => props.onEdge(unit.id, 'start', event)}
            />
            <div
              className="desktop-tx-wave-handle is-end"
              data-testid="desktop-wave-handle-end"
              onPointerDown={(event) => props.onEdge(unit.id, 'end', event)}
            />
          </div>
        );
      })}
      {preview?.unitId != null ? ghost('self', preview.startMs, preview.endMs) : null}
      {preview?.otherId != null && preview.otherStartMs !== null && preview.otherEndMs !== null
        ? ghost('other', preview.otherStartMs, preview.otherEndMs)
        : null}
    </div>
  );
}
