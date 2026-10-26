import { Navigate } from 'react-router-dom';
import { featureFlags } from '../ai/config/featureFlags';
import { readDesktopProjectHost } from '../desktop/projectReadHost';
import { t, useLocale } from '../i18n';
import { DesktopProjectReadView } from './DesktopProjectReadView';
import { ProjectCustomFieldManager } from './ProjectCustomFieldManager';
import { useDesktopProjectReadController } from './useDesktopProjectReadController';
import '../styles/pages/desktop-project-read.css';

export function DesktopProjectReadPage() {
  const locale = useLocale();
  const host = readDesktopProjectHost();
  const read = useDesktopProjectReadController(host);

  if (host === null) return <Navigate to="/" replace />;

  const selected = read.model?.manuscripts.find((item) => item.id === read.model?.manuscriptId);

  return (
    <section className="desktop-project-read">
      <button type="button" className="btn btn-primary" onClick={read.openFolder}>
        {t(locale, 'app.desktopRead.openFolder')}
      </button>
      {read.error.length > 0 ? <p role="alert">{read.error}</p> : null}
      {read.model === null ? null : (
        <DesktopProjectReadView
          manuscripts={read.model.manuscripts}
          manuscriptId={read.model.manuscriptId}
          units={read.model.units}
          notes={read.notes}
          audioUrl={read.model.audioUrl}
          timeMapping={selected?.timeMapping ?? null}
          emptyLabel={t(locale, 'app.desktopRead.empty')}
          audioLabel={t(locale, 'app.desktopRead.audio')}
          textLabel={t(locale, 'app.desktopRead.text')}
          saveTextLabel={t(locale, 'app.desktopRead.saveText')}
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
          onSaveText={read.saveText}
          onMoveBoundary={read.moveBoundary}
          onSaveMapping={read.saveMapping}
          onSaveNote={read.saveUnitNote}
          onSaveTierNote={read.saveTierNote}
        />
      )}
      {featureFlags.projectCustomFieldsEnabled && read.sessionId !== null ? (
        <ProjectCustomFieldManager desktopCall={host.desktopCall} sessionId={read.sessionId} />
      ) : null}
    </section>
  );
}
