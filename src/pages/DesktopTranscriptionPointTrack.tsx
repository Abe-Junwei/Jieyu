import { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';
import { t, type Locale } from '../i18n';
import type { PointView } from './desktopTranscriptionPointOps';
import type { DesktopPointTrackApi } from './useDesktopTranscriptionPointController';

/** A1 readout: m:ss.mmm */
export function formatPointReadout(timeMs: number): string {
  const ms = Math.max(0, Math.round(timeMs));
  const frac = ms % 1000;
  const totalSec = Math.floor(ms / 1000);
  const s = totalSec % 60;
  const m = Math.floor(totalSec / 60);
  return `${m}:${String(s).padStart(2, '0')}.${String(frac).padStart(3, '0')}`;
}

export function DesktopTranscriptionPointTrack(props: {
  locale: Locale;
  layerId: string;
  points: readonly PointView[];
  duration: number;
  zoomPxPerSec: number;
  pointsApi: DesktopPointTrackApi;
}) {
  const drag = props.pointsApi.drag;
  const selectedOnLane =
    props.pointsApi.selected?.layerId === props.layerId ? props.pointsApi.selected : null;
  const guideTimeMs =
    drag?.layerId === props.layerId
      ? drag.timeMs
      : selectedOnLane
        ? (props.points.find((p) => p.id === selectedOnLane.pointId)?.timeMs ?? null)
        : null;
  const msAt = (clientX: number) => {
    const track = document.querySelector(
      `.desktop-tx-lane[data-layer-id="${CSS.escape(props.layerId)}"] .desktop-tx-lane__track`,
    );
    if (!(track instanceof HTMLElement) || props.zoomPxPerSec <= 0) return 0;
    const rect = track.getBoundingClientRect();
    return Math.round(((clientX - rect.left) / props.zoomPxPerSec) * 1000);
  };
  const leftPx = (timeMs: number) =>
    props.zoomPxPerSec > 0 ? (timeMs / 1000) * props.zoomPxPerSec : 0;

  return (
    <>
      <div
        className="desktop-tx-lane__track desktop-tx-point-track"
        style={props.zoomPxPerSec > 0 ? { width: props.duration * props.zoomPxPerSec } : undefined}
        onPointerDown={(event) => props.pointsApi.onTrackPointerDown(event, props.layerId, msAt)}
      >
        {props.points.length === 0 ? (
          <span className="desktop-tx-point-track__hint" aria-hidden>
            {t(props.locale, 'app.desktopTranscription.pointEmptyHint')}
          </span>
        ) : null}
        {props.points.map((point) => {
          const selected =
            props.pointsApi.selected?.layerId === props.layerId &&
            props.pointsApi.selected.pointId === point.id;
          const editing = props.pointsApi.editingId === point.id;
          const timeMs = props.pointsApi.shownTimeMs(point, props.layerId);
          const dragging = drag?.pointId === point.id && drag.layerId === props.layerId;
          return (
            <div
              key={point.id}
              className={`desktop-tx-pin${selected ? ' is-selected' : ''}${
                dragging ? ' is-dragging' : ''
              }`}
              data-point-id={point.id}
              style={{ left: leftPx(timeMs) }}
              onPointerDown={(event: ReactPointerEvent<HTMLElement>) =>
                props.pointsApi.onPointPointerDown(event, props.layerId, point, msAt)
              }
              onContextMenu={(event: ReactMouseEvent<HTMLElement>) =>
                props.pointsApi.onPointContextMenu(event, props.layerId, point)
              }
            >
              <button
                type="button"
                className="desktop-tx-pin__mark"
                aria-label={
                  point.label.trim().length > 0
                    ? point.label
                    : t(props.locale, 'app.desktopTranscription.pointUntitled')
                }
                aria-pressed={selected}
              />
              {editing ? (
                <input
                  className="desktop-tx-pin__input"
                  value={props.pointsApi.draft}
                  autoFocus
                  onChange={(event) => props.pointsApi.setDraft(event.target.value)}
                  onBlur={() => props.pointsApi.commitLabel()}
                  onKeyDown={(event) => {
                    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      event.stopPropagation();
                      props.pointsApi.commitLabel();
                    } else if (event.key === 'Escape') {
                      event.preventDefault();
                      event.stopPropagation();
                      props.pointsApi.cancelEdit();
                    }
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                />
              ) : point.label.trim().length > 0 ? (
                <span
                  className="desktop-tx-pin__label"
                  onPointerDown={(event) =>
                    props.pointsApi.onLabelPointerDown(event, props.layerId, point)
                  }
                >
                  {point.label}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
      {guideTimeMs !== null ? (
        <PointGuide
          layerId={props.layerId}
          timeMs={guideTimeMs}
          zoomPxPerSec={props.zoomPxPerSec}
          dragging={drag?.layerId === props.layerId}
        />
      ) : null}
      {props.pointsApi.menu?.layerId === props.layerId
        ? createPortal(
            <PointMenu
              locale={props.locale}
              x={props.pointsApi.menu.x}
              y={props.pointsApi.menu.y}
              onClose={props.pointsApi.closeMenu}
              onEdit={() => {
                const pointId = props.pointsApi.menu?.pointId;
                const point = props.points.find((row) => row.id === pointId);
                if (point === undefined) return;
                props.pointsApi.closeMenu();
                props.pointsApi.editPoint(point.id, point.label);
              }}
              onSeek={props.pointsApi.seekSelected}
              onDelete={props.pointsApi.deleteSelected}
            />,
            document.body,
          )
        : null}
    </>
  );
}

/** Guide: wave top → point-lane top (does not enter the event/point layer). */
function PointGuide(props: {
  layerId: string;
  timeMs: number;
  zoomPxPerSec: number;
  dragging: boolean;
}) {
  const [box, setBox] = useState<{ left: number; top: number; height: number } | null>(null);

  useLayoutEffect(() => {
    const measure = () => {
      const wave = document.querySelector('.desktop-tx-wave');
      const lane = document.querySelector(
        `.desktop-tx-lane[data-layer-id="${CSS.escape(props.layerId)}"]`,
      );
      const track = lane?.querySelector('.desktop-tx-point-track');
      if (!(wave instanceof HTMLElement) || !(track instanceof HTMLElement)) {
        setBox(null);
        return;
      }
      const wr = wave.getBoundingClientRect();
      const lr = lane instanceof HTMLElement ? lane.getBoundingClientRect() : null;
      const tr = track.getBoundingClientRect();
      // Stop at the top of the point lane — guide does not paint into 事件层.
      const bottom = lr?.top ?? tr.top;
      const height = bottom - wr.top;
      if (!(height > 2) || !(props.zoomPxPerSec > 0)) {
        setBox(null);
        return;
      }
      const left = tr.left + (props.timeMs / 1000) * props.zoomPxPerSec;
      setBox({ left, top: wr.top, height });
    };
    measure();
    window.addEventListener('resize', measure);
    const tiers = document.querySelector('.desktop-tx-tiers');
    tiers?.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      tiers?.removeEventListener('scroll', measure, true);
    };
  }, [props.layerId, props.timeMs, props.zoomPxPerSec]);

  if (box === null) return null;
  return createPortal(
    <div
      className={`desktop-tx-point-guide${props.dragging ? ' is-drag' : ''}`}
      style={
        {
          '--point-guide-left': `${box.left}px`,
          '--point-guide-top': `${box.top}px`,
          '--point-guide-height': `${box.height}px`,
        } as CSSProperties
      }
      aria-hidden
    >
      {props.dragging ? (
        <span className="desktop-tx-pin__readout">{formatPointReadout(props.timeMs)}</span>
      ) : null}
    </div>,
    document.body,
  );
}

function PointMenu(props: {
  locale: Locale;
  x: number;
  y: number;
  onClose: () => void;
  onEdit: () => void;
  onSeek: () => void;
  onDelete: () => void;
}) {
  return (
    <>
      <button
        type="button"
        className="desktop-tx-menu__dismiss"
        aria-label={t(props.locale, 'app.desktopTranscription.pointMenuClose')}
        onClick={props.onClose}
      />
      <div
        className="desktop-tx-menu desktop-tx-point-menu"
        role="menu"
        style={{ left: props.x, top: props.y }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <button type="button" role="menuitem" onClick={props.onEdit}>
          {t(props.locale, 'app.desktopTranscription.pointEditLabel')}
        </button>
        <button type="button" role="menuitem" onClick={props.onSeek}>
          {t(props.locale, 'app.desktopTranscription.pointSeek')}
        </button>
        <div className="desktop-tx-menu__rule" role="separator" />
        <button type="button" role="menuitem" className="is-danger" onClick={props.onDelete}>
          {t(props.locale, 'app.desktopTranscription.pointDelete')}
        </button>
      </div>
    </>
  );
}
