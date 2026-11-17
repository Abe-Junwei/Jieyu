import { useMemo, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { readDesktopProjectHost } from '../desktop/projectReadHost';
import { useDesktopDraftGuard } from '../desktop/useDesktopDraftGuard';
import { t, useLocale } from '../i18n';
import { DesktopDraftLeaveDialog } from './DesktopDraftLeaveDialog';
import { DesktopProjectReadView } from './DesktopProjectReadView';
import { readDesktopCorpusLocate } from './desktopCorpusLocate';
import { useDesktopProjectReadController } from './useDesktopProjectReadController';
import '../styles/pages/desktop-transcription-workspace.css';

function formatTime(seconds: number): string {
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const ms = totalMs % 1000;
  const totalSec = Math.floor(totalMs / 1000);
  const s = totalSec % 60;
  const m = Math.floor(totalSec / 60) % 60;
  const h = Math.floor(totalSec / 3600);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms, 3)}`;
}

export function DesktopTranscriptionWorkspacePage() {
  const locale = useLocale();
  const host = readDesktopProjectHost();
  const [searchParams] = useSearchParams();
  const locate = readDesktopCorpusLocate(searchParams);
  const read = useDesktopProjectReadController(
    host,
    true,
    locate === null ? null : { manuscriptId: locate.manuscriptId, layerId: locate.layerId },
  );
  const [focusUnitId, setFocusUnitId] = useState<string | null>(locate?.unitId ?? null);
  const draft = useDesktopDraftGuard((current) => read.saveText(current.unitId, current.text));

  const selectedUnit = useMemo(() => {
    const id = draft.draft?.unitId ?? focusUnitId;
    if (!id || !read.model) return null;
    return read.model.units.find((unit) => unit.id === id) ?? null;
  }, [draft.draft?.unitId, focusUnitId, read.model]);

  if (host === null) return <Navigate to="/" replace />;

  const selectedManuscript = read.model?.manuscripts.find(
    (item) => item.id === read.model?.manuscriptId,
  );

  return (
    <section className="desktop-tx-workspace" data-testid="desktop-transcription-workspace">
      <header className="desktop-tx-workspace__chrome">
        <h1 className="desktop-tx-workspace__title">
          {t(locale, 'app.desktopTranscription.workspaceTitle')}
        </h1>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => draft.leave(read.openFolder)}
        >
          {t(locale, 'app.desktopRead.openFolder')}
        </button>
      </header>
      {read.projectTitle.length > 0 ? <p>{read.projectTitle}</p> : null}
      {read.error.length > 0 ? <p role="alert">{read.error}</p> : null}

      <div className="desktop-tx-workspace__body">
        <aside
          className="desktop-tx-workspace__context"
          aria-label={t(locale, 'app.desktopTranscription.contextTitle')}
        >
          <h2 className="desktop-tx-workspace__section-title">
            {t(locale, 'app.desktopTranscription.contextTitle')}
          </h2>
          {read.model === null ? (
            <p>{t(locale, 'app.desktopRead.empty')}</p>
          ) : (
            <ul>
              {read.model.manuscripts.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() =>
                      draft.leave(() => {
                        setFocusUnitId(null);
                        read.selectManuscript(item.id);
                      })
                    }
                  >
                    {Object.values(item.title)[0] ?? item.id}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <div className="desktop-tx-workspace__main">
          <p className="desktop-tx-workspace__placeholder">
            {t(locale, 'app.desktopTranscription.waveformPlaceholder')}
          </p>
          {read.model === null ? null : (
            <DesktopProjectReadView
              manuscripts={read.model.manuscripts}
              manuscriptId={read.model.manuscriptId}
              focusUnitId={focusUnitId}
              units={read.model.units}
              notes={read.notes}
              audioUrl={read.model.audioUrl}
              timeMapping={selectedManuscript?.timeMapping ?? null}
              emptyLabel={t(locale, 'app.desktopRead.empty')}
              audioLabel={t(locale, 'app.desktopRead.audio')}
              textLabel={t(locale, 'app.desktopRead.text')}
              saveTextLabel={t(locale, 'app.desktopRead.saveText')}
              undoTextLabel={t(locale, 'app.desktopRead.undoText')}
              splitLabel={t(locale, 'app.desktopRead.split')}
              splitTimeLabel={t(locale, 'app.desktopRead.splitTime')}
              mergeNextLabel={t(locale, 'app.desktopRead.mergeNext')}
              boundaryLabel={t(locale, 'app.desktopRead.boundary')}
              moveBoundaryLabel={t(locale, 'app.desktopRead.moveBoundary')}
              offsetLabel={t(locale, 'app.desktopRead.offset')}
              scaleLabel={t(locale, 'app.desktopRead.scale')}
              saveMappingLabel={t(locale, 'app.desktopRead.saveMapping')}
              noteLabel={t(locale, 'app.desktopRead.note')}
              saveNoteLabel={t(locale, 'app.desktopRead.saveNote')}
              saveTimelineNoteLabel={t(locale, 'app.desktopRead.saveTimelineNote')}
              saveWaveformNoteLabel={t(locale, 'app.desktopRead.saveWaveformNote')}
              onSelectManuscript={read.selectManuscript}
              draft={draft.draft}
              onEditText={draft.edit}
              onComposeText={draft.setComposing}
              onSaveText={() => void draft.commit()}
              onLeaveUnit={(go) => draft.leave(go)}
              onUndoText={read.undoText}
              onSplit={read.splitUnit}
              onMerge={read.mergeUnits}
              onMoveBoundary={read.moveBoundary}
              onSaveMapping={read.saveMapping}
              onSaveNote={read.saveUnitNote}
              onSaveTierNote={read.saveTierNote}
              noteSessionId={read.sessionId}
              noteDesktopCall={host.desktopCall}
              textNoteLabel={t(locale, 'app.desktopRead.textNote')}
              saveTextNoteLabel={t(locale, 'app.desktopRead.saveTextNote')}
            />
          )}
        </div>

        <aside
          className="desktop-tx-workspace__inspector"
          aria-label={t(locale, 'app.desktopTranscription.inspectorTitle')}
        >
          <h2 className="desktop-tx-workspace__section-title">
            {t(locale, 'app.desktopTranscription.inspectorTitle')}
          </h2>
          {selectedUnit === null ? (
            <p>{t(locale, 'app.desktopRead.empty')}</p>
          ) : (
            <dl>
              <div>
                <dt>{t(locale, 'app.desktopRead.boundary')}</dt>
                <dd>
                  {formatTime(selectedUnit.startTime)} – {formatTime(selectedUnit.endTime)}
                </dd>
              </div>
              <div>
                <dt>{t(locale, 'app.desktopRead.text')}</dt>
                <dd>
                  {draft.draft?.unitId === selectedUnit.id ? draft.draft.text : selectedUnit.text}
                </dd>
              </div>
            </dl>
          )}
        </aside>
      </div>

      {draft.prompt === null ? null : (
        <DesktopDraftLeaveDialog
          failed={draft.prompt.failed}
          saving={draft.saving}
          canRetry={draft.canRetry}
          onRetry={draft.retry}
          onDiscard={draft.discard}
          onStay={draft.stay}
        />
      )}
    </section>
  );
}
