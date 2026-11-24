import { createPortal } from 'react-dom';
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

const DELETE_COUNTS: Record<Exclude<keyof UnitDeletePreview, 'fingerprint'>, DictKey> = {
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
  tip: { text: string; x: number; y: number } | null;
  edgeFocus: ReturnType<typeof edgeFocusKind> | null;
  conflicts: Record<TimeEdge, TimeConflict | null>;
  stale: { action: 'undo' | 'redo' } | null;
  menu: {
    x: number;
    y: number;
    layerName?: string;
    sub?: true;
    canLink: boolean;
    skipped: boolean;
  } | null;
  deletePrompt: { unitIds: string[]; counts: UnitDeletePreview; textLayerId?: string } | null;
  onRebase: (edge: TimeEdge) => void;
  onDiscardDraft: (edge: TimeEdge) => void;
  onDropStale: () => void;
  onEdit: (edge: TimeEdge, value: string) => void;
  onFlush: (edge: TimeEdge) => void;
  onCloseMenu: () => void;
  onLink: () => void;
  onClearText: () => void;
  onToggleSkip: () => void;
  onAskDelete: () => void;
  onAskSplit?: () => void;
  canMerge?: boolean;
  onAskMerge?: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
  speakers?: {
    recent: readonly { id: string; name: string }[];
    rest: readonly { id: string; name: string }[];
    currentId: string | null;
    onAssign: (speakerId: string) => void;
    onClear: () => void;
  };
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
      {props.menu === null
        ? null
        : createPortal(
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
                <button type="button" role="menuitem" onClick={props.onToggleSkip}>
                  {t(
                    locale,
                    props.menu.skipped
                      ? 'transcription.wave.unskipProcessing'
                      : 'transcription.wave.skipProcessing',
                  )}
                </button>
                {props.menu.layerName === undefined ? null : (
                  <button type="button" role="menuitem" onClick={props.onClearText}>
                    {tf(locale, 'app.desktopTranscription.clearLayerText', {
                      layer: props.menu.layerName,
                    })}
                  </button>
                )}
                {props.speakers === undefined ? null : (
                  <>
                    <div className="desktop-tx-menu__rule" role="separator" />
                    {props.speakers.recent.map((speaker) => (
                      <button
                        key={speaker.id}
                        type="button"
                        role="menuitem"
                        onClick={() => props.speakers?.onAssign(speaker.id)}
                      >
                        {speaker.id === props.speakers?.currentId
                          ? tf(locale, 'app.desktopTranscription.speakerCurrent', {
                              name: speaker.name,
                            })
                          : speaker.name}
                      </button>
                    ))}
                    {props.speakers.recent.length > 0 && props.speakers.rest.length > 0 ? (
                      <div className="desktop-tx-menu__rule" role="separator" />
                    ) : null}
                    {props.speakers.rest.map((speaker) => (
                      <button
                        key={speaker.id}
                        type="button"
                        role="menuitem"
                        onClick={() => props.speakers?.onAssign(speaker.id)}
                      >
                        {speaker.name}
                      </button>
                    ))}
                    <button type="button" role="menuitem" onClick={props.speakers.onClear}>
                      {t(locale, 'app.desktopTranscription.speakerClear')}
                    </button>
                  </>
                )}
                {props.menu.layerName !== undefined && props.menu.sub !== true ? null : (
                  <>
                    <button type="button" role="menuitem" onClick={props.onAskDelete}>
                      {t(
                        locale,
                        props.menu.sub === true
                          ? 'app.desktopTranscription.deleteSubSegment'
                          : 'app.desktopTranscription.deleteSegment',
                      )}
                    </button>
                    {props.onAskSplit === undefined ? null : (
                      <button type="button" role="menuitem" onClick={props.onAskSplit}>
                        {t(locale, 'app.desktopTranscription.splitSegment')}
                      </button>
                    )}
                    {props.onAskMerge === undefined ? null : (
                      <button
                        type="button"
                        role="menuitem"
                        disabled={props.canMerge !== true}
                        onClick={props.onAskMerge}
                      >
                        {t(locale, 'app.desktopTranscription.mergeNext')}
                        <span className="desktop-tx-menu__key">⌘M</span>
                      </button>
                    )}
                  </>
                )}
              </div>
            </>,
            document.body,
          )}
      {props.deletePrompt === null ? null : (
        <ModalPanel
          isOpen
          compact
          className="desktop-tx-delete"
          closeLabel={t(locale, 'app.desktopTranscription.cancel')}
          onClose={props.onCancelDelete}
          title={t(
            locale,
            props.deletePrompt.textLayerId === undefined
              ? 'app.desktopTranscription.deleteSegment'
              : 'app.desktopTranscription.clearConfirm',
          )}
          footer={
            <>
              <button type="button" className="btn btn-danger" onClick={props.onConfirmDelete}>
                {props.deletePrompt.textLayerId !== undefined
                  ? t(locale, 'app.desktopTranscription.clearAction')
                  : props.deletePrompt.unitIds.length > 1
                    ? tf(locale, 'app.desktopTranscription.deleteConfirmMany', {
                        count: props.deletePrompt.unitIds.length,
                      })
                    : t(locale, 'app.desktopTranscription.deleteConfirm')}
              </button>
              <button
                autoFocus
                type="button"
                className="btn btn-secondary"
                onClick={props.onCancelDelete}
              >
                {t(locale, 'app.desktopTranscription.cancel')}
              </button>
            </>
          }
        >
          <p>
            {props.deletePrompt.textLayerId !== undefined
              ? t(locale, 'app.desktopTranscription.clearExplain')
              : props.deletePrompt.unitIds.length > 1
                ? tf(
                    locale,
                    Object.values(props.deletePrompt.counts).some(
                      (count) => typeof count === 'number' && count > 0,
                    )
                      ? 'app.desktopTranscription.deleteBodyMany'
                      : 'app.desktopTranscription.deleteBodyManySolo',
                    {
                      count: props.deletePrompt.unitIds.length,
                    },
                  )
                : t(
                    locale,
                    Object.values(props.deletePrompt.counts).some(
                      (count) => typeof count === 'number' && count > 0,
                    )
                      ? 'app.desktopTranscription.deleteBody'
                      : 'app.desktopTranscription.deleteBodySolo',
                  )}
          </p>
          <DeleteCounts locale={locale} counts={props.deletePrompt.counts} />
        </ModalPanel>
      )}
    </>
  );
}

function DeleteCounts(props: { locale: Locale; counts: UnitDeletePreview }) {
  const shown = (Object.keys(DELETE_COUNTS) as (keyof typeof DELETE_COUNTS)[]).filter(
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
