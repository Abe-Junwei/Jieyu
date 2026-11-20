import { ModalPanel } from '../components/ui/ModalPanel';
import { t, tf, type DictKey, type Locale } from '../i18n';
import type { UnitDeletePreview } from '../app/desktopProjectReadPageAccess';
import type { TimeEdge, edgeFocusKind } from './desktopTranscriptionEdge';
import type { TimeConflict } from './desktopTranscriptionEdgeSession';
import { formatPlaybackTime } from './useDesktopTranscriptionMediaController';

const EDGE_FOCUS: Record<ReturnType<typeof edgeFocusKind>, DictKey> = {
  start: 'app.desktopTranscription.edgeFocusStart',
  end: 'app.desktopTranscription.edgeFocusEnd',
  sharedNext: 'app.desktopTranscription.edgeFocusSharedNext',
  sharedPrev: 'app.desktopTranscription.edgeFocusSharedPrev',
};

const DELETE_COUNTS: Record<keyof UnitDeletePreview, DictKey> = {
  linkedTexts: 'app.desktopTranscription.deleteCount.linkedTexts',
  tokens: 'app.desktopTranscription.deleteCount.tokens',
  morphemes: 'app.desktopTranscription.deleteCount.morphemes',
  notes: 'app.desktopTranscription.deleteCount.notes',
  lexemeLinks: 'app.desktopTranscription.deleteCount.lexemeLinks',
  analysisCandidates: 'app.desktopTranscription.deleteCount.analysisCandidates',
  customFieldValues: 'app.desktopTranscription.deleteCount.customFieldValues',
  drafts: 'app.desktopTranscription.deleteCount.drafts',
  receptionRecords: 'app.desktopTranscription.deleteCount.receptionRecords',
};

export function DesktopTranscriptionEdgeChrome(props: {
  locale: Locale;
  place: { index: number; total: number } | null;
  start: string;
  end: string;
  saved: boolean;
  hasMedia: boolean;
  reason: string | null;
  tip: { text: string; x: number; y: number } | null;
  edgeFocus: ReturnType<typeof edgeFocusKind> | null;
  conflicts: Record<TimeEdge, TimeConflict | null>;
  stale: { action: 'undo' | 'redo' } | null;
  menu: { x: number; y: number; layerName?: string; sub?: true; canLink: boolean } | null;
  deletePrompt: UnitDeletePreview | null;
  onRebase: (edge: TimeEdge) => void;
  onDiscardDraft: (edge: TimeEdge) => void;
  onDropStale: () => void;
  onEdit: (edge: TimeEdge, value: string) => void;
  onFlush: (edge: TimeEdge) => void;
  onCloseMenu: () => void;
  onLink: () => void;
  onClearText: () => void;
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
          {props.edgeFocus === null ? null : (
            <span className="desktop-tx-status__focus" data-testid="desktop-edge-focus">
              {t(locale, EDGE_FOCUS[props.edgeFocus])}
            </span>
          )}
          {props.reason === null ? null : (
            <span className="desktop-tx-status__reason">{props.reason}</span>
          )}
          {(['start', 'end'] as const).map((edge) => {
            const conflict = props.conflicts[edge];
            if (conflict === null) return null;
            return (
              <div
                key={edge}
                className="desktop-tx-conflict"
                role="group"
                aria-label={t(
                  locale,
                  edge === 'start'
                    ? 'app.desktopTranscription.timeStart'
                    : 'app.desktopTranscription.timeEnd',
                )}
              >
                <span>
                  {tf(locale, 'app.desktopTranscription.draftConflictCurrent', {
                    time: formatPlaybackTime(conflict.currentMs / 1000),
                  })}
                </span>
                <span>
                  {tf(locale, 'app.desktopTranscription.draftConflictInput', {
                    raw: conflict.rawInput,
                  })}
                </span>
                <button type="button" className="btn" onClick={() => props.onRebase(edge)}>
                  {t(locale, 'app.desktopTranscription.draftConflictRebase')}
                </button>
                <button type="button" className="btn" onClick={() => props.onDiscardDraft(edge)}>
                  {t(locale, 'app.desktopTranscription.draftConflictDiscard')}
                </button>
              </div>
            );
          })}
        </div>
      )}
      {props.stale === null ? null : (
        <div className="desktop-tx-stale" role="alert" data-testid="desktop-edge-stale">
          <span>{t(locale, 'app.desktopTranscription.edgeStale')}</span>
          <button type="button" className="btn" onClick={props.onDropStale}>
            {t(
              locale,
              props.stale.action === 'undo'
                ? 'app.desktopTranscription.dropUndo'
                : 'app.desktopTranscription.dropRedo',
            )}
          </button>
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
            {props.menu.canLink ? (
              <button type="button" role="menuitem" onClick={props.onLink}>
                {t(locale, 'app.desktopTranscription.linkBoundary')}
              </button>
            ) : null}
            {props.menu.layerName === undefined ? null : (
              <button type="button" role="menuitem" onClick={props.onClearText}>
                {tf(locale, 'app.desktopTranscription.clearLayerText', {
                  layer: props.menu.layerName,
                })}
              </button>
            )}
            {props.menu.layerName !== undefined && props.menu.sub !== true ? null : (
              <button type="button" role="menuitem" onClick={props.onAskDelete}>
                {t(
                  locale,
                  props.menu.sub === true
                    ? 'app.desktopTranscription.deleteSubSegment'
                    : 'app.desktopTranscription.deleteSegment',
                )}
              </button>
            )}
          </div>
        </>
      )}
      {props.deletePrompt === null ? null : (
        <ModalPanel
          isOpen
          compact
          className="desktop-tx-delete"
          closeLabel={t(locale, 'app.desktopTranscription.cancel')}
          onClose={props.onCancelDelete}
          title={t(locale, 'app.desktopTranscription.deleteSegment')}
          footer={
            <>
              <button type="button" className="btn btn-danger" onClick={props.onConfirmDelete}>
                {t(locale, 'app.desktopTranscription.deleteConfirm')}
              </button>
              <button type="button" className="btn btn-secondary" onClick={props.onCancelDelete}>
                {t(locale, 'app.desktopTranscription.cancel')}
              </button>
            </>
          }
        >
          <p>{t(locale, 'app.desktopTranscription.deleteBody')}</p>
          <DeleteCounts locale={locale} counts={props.deletePrompt} />
        </ModalPanel>
      )}
    </>
  );
}

function DeleteCounts(props: { locale: Locale; counts: UnitDeletePreview }) {
  const shown = (Object.keys(DELETE_COUNTS) as (keyof UnitDeletePreview)[]).filter(
    (key) => props.counts[key] > 0,
  );
  if (shown.length === 0) return null;
  return (
    <ul className="desktop-tx-delete__counts">
      {shown.map((key) => (
        <li key={key}>{tf(props.locale, DELETE_COUNTS[key], { count: props.counts[key] })}</li>
      ))}
    </ul>
  );
}
