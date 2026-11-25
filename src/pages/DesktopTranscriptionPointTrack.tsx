import { createPortal } from 'react-dom';
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import { t, type Locale } from '../i18n';
import type { PointView } from './desktopTranscriptionPointOps';
import type { DesktopPointTrackApi } from './useDesktopTranscriptionPointController';

export function DesktopTranscriptionPointTrack(props: {
  locale: Locale;
  layerId: string;
  points: readonly PointView[];
  duration: number;
  zoomPxPerSec: number;
  pointsApi: DesktopPointTrackApi;
}) {
  const drag = props.pointsApi.drag;
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
        {drag?.layerId === props.layerId ? (
          <div
            className="desktop-tx-pin is-preview"
            style={{ left: leftPx(drag.timeMs) }}
            aria-hidden
          >
            <span className="desktop-tx-pin__mark" />
          </div>
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
              onDoubleClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                props.pointsApi.editPoint(point.id, point.label);
              }}
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
                      props.pointsApi.commitLabel();
                    } else if (event.key === 'Escape') {
                      event.preventDefault();
                      props.pointsApi.cancelEdit();
                    }
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                />
              ) : point.label.trim().length > 0 ? (
                <span className="desktop-tx-pin__label">{point.label}</span>
              ) : null}
            </div>
          );
        })}
      </div>
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
