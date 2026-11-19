import { t, tf, type Locale } from '../i18n';
import type { TimeEdge } from './desktopTranscriptionEdge';

export function DesktopTranscriptionEdgeChrome(props: {
  locale: Locale;
  place: { index: number; total: number } | null;
  start: string;
  end: string;
  saved: boolean;
  hasMedia: boolean;
  reason: string | null;
  tip: { text: string; x: number; y: number } | null;
  menu: { x: number; y: number } | null;
  deletePrompt: { tokens: number; notes: number } | null;
  onEdit: (edge: TimeEdge, value: string) => void;
  onFlush: (edge: TimeEdge) => void;
  onCloseMenu: () => void;
  onLink: () => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}) {
  const { locale } = props;
  return (
    <>
      {props.place === null ? null : (
        <div className="desktop-tx-status" data-testid="desktop-edge-status">
          <span>{tf(locale, 'app.desktopTranscription.segmentPlace', props.place)}</span>
          <input
            className="desktop-tx-time"
            aria-label={t(locale, 'app.desktopTranscription.timeStart')}
            value={props.start}
            onChange={(event) => props.onEdit('start', event.target.value)}
            onBlur={() => props.onFlush('start')}
          />
          <span aria-hidden="true">{'\u2013'}</span>
          <input
            className="desktop-tx-time"
            aria-label={t(locale, 'app.desktopTranscription.timeEnd')}
            value={props.end}
            onChange={(event) => props.onEdit('end', event.target.value)}
            onBlur={() => props.onFlush('end')}
          />
          {props.saved ? <span>{t(locale, 'app.desktopTranscription.draftSaved')}</span> : null}
          {props.hasMedia ? null : (
            <span>{t(locale, 'app.desktopTranscription.noMediaLinked')}</span>
          )}
          {props.reason === null ? null : (
            <span className="desktop-tx-status__reason">{props.reason}</span>
          )}
        </div>
      )}
      {props.tip === null ? null : (
        <div className="desktop-tx-snap" style={{ left: props.tip.x, top: props.tip.y }}>
          {props.tip.text}
        </div>
      )}
      {props.menu === null ? null : (
        <>
          <button
            type="button"
            className="desktop-tx-menu-backdrop"
            aria-label={t(locale, 'app.desktopTranscription.cancel')}
            onClick={props.onCloseMenu}
          />
          <div
            className="desktop-tx-menu desktop-tx-menu-fixed"
            style={{ left: props.menu.x, top: props.menu.y }}
            role="menu"
          >
            <button type="button" role="menuitem" onClick={props.onLink}>
              {t(locale, 'app.desktopTranscription.linkBoundary')}
            </button>
            <button type="button" role="menuitem" onClick={props.onAskDelete}>
              {t(locale, 'app.desktopTranscription.deleteSegment')}
            </button>
          </div>
        </>
      )}
      {props.deletePrompt === null ? null : (
        <div className="dialog-overlay">
          <div
            role="dialog"
            aria-labelledby="desktop-tx-delete-title"
            className="dialog-card desktop-tx-delete"
          >
            <h2 id="desktop-tx-delete-title">
              {t(locale, 'app.desktopTranscription.deleteSegment')}
            </h2>
            <p>{tf(locale, 'app.desktopTranscription.deleteBody', props.deletePrompt)}</p>
            <button type="button" className="btn btn-danger" onClick={props.onConfirmDelete}>
              {t(locale, 'app.desktopTranscription.deleteConfirm')}
            </button>
            <button type="button" onClick={props.onCancelDelete}>
              {t(locale, 'app.desktopTranscription.cancel')}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
