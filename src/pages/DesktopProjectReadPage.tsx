import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { featureFlags } from '../ai/config/featureFlags';
import {
  createDesktopClient,
  type DueDeletionReminder,
  type ManuscriptDeletePreview,
} from '../app/desktopProjectReadPageAccess';
import { readDesktopProjectHost } from '../desktop/projectReadHost';
import { t, useLocale } from '../i18n';
import { DesktopCorpusQueryPanel } from './DesktopCorpusQueryPanel';
import { DesktopDeletionReminderDialog } from './DesktopDeletionReminderDialog';
import { DesktopManuscriptDeleteDialog } from './DesktopManuscriptDeleteDialog';
import { DesktopProjectReadView } from './DesktopProjectReadView';
import { ProjectCustomFieldManager } from './ProjectCustomFieldManager';
import { canConfirmManuscriptDelete } from './desktopManuscriptDelete';
import { useDesktopProjectReadController } from './useDesktopProjectReadController';
import '../styles/pages/desktop-project-read.css';

export function DesktopProjectReadPage() {
  const locale = useLocale();
  const host = readDesktopProjectHost();
  const read = useDesktopProjectReadController(host);
  const [focusUnitId, setFocusUnitId] = useState<string | null>(null);
  const [deletePreview, setDeletePreview] = useState<ManuscriptDeletePreview | null>(null);
  const [dueReminders, setDueReminders] = useState<DueDeletionReminder[] | null>(null);

  if (host === null) return <Navigate to="/" replace />;

  const selected = read.model?.manuscripts.find((item) => item.id === read.model?.manuscriptId);

  return (
    <section className="desktop-project-read">
      <button type="button" className="btn btn-primary" onClick={read.openFolder}>
        {t(locale, 'app.desktopRead.openFolder')}
      </button>
      {read.error.length > 0 ? <p role="alert">{read.error}</p> : null}
      {read.model === null || host === null || read.sessionId === null ? null : (
        <DesktopCorpusQueryPanel
          host={host}
          sessionId={read.sessionId}
          onLocate={(manuscriptId, layerId, unitId) => {
            setFocusUnitId(unitId);
            if (read.model?.manuscriptId !== manuscriptId || read.model.layerId !== layerId) {
              read.selectManuscript(manuscriptId, layerId);
            }
          }}
        />
      )}
      {read.model === null ? null : (
        <DesktopProjectReadView
          manuscripts={read.model.manuscripts}
          manuscriptId={read.model.manuscriptId}
          focusUnitId={focusUnitId}
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
      {read.model?.manuscriptId == null || host === null || read.sessionId === null ? null : (
        <button
          type="button"
          onClick={() => {
            const sessionId = read.sessionId;
            const manuscriptId = read.model?.manuscriptId;
            if (sessionId === null || manuscriptId == null) return;
            void createDesktopClient({ desktopCall: host.desktopCall })
              .previewManuscriptDelete(sessionId, manuscriptId)
              .then(setDeletePreview)
              .catch(() => setDeletePreview(null));
          }}
        >
          {t(locale, 'app.desktopRead.deleteManuscript')}
        </button>
      )}
      {read.model === null || host === null || read.sessionId === null ? null : (
        <button
          type="button"
          onClick={() => {
            const sessionId = read.sessionId;
            if (sessionId === null) return;
            void createDesktopClient({ desktopCall: host.desktopCall })
              .listDueReminders(sessionId)
              .then(setDueReminders)
              .catch(() => setDueReminders(null));
          }}
        >
          {t(locale, 'app.desktopRead.reminderOpen')}
        </button>
      )}
      {dueReminders === null || host === null || read.sessionId === null ? null : (
        <DesktopDeletionReminderDialog
          items={dueReminders}
          onClose={() => setDueReminders(null)}
          onShown={(item) => {
            const sessionId = read.sessionId;
            if (sessionId === null) return;
            const client = createDesktopClient({ desktopCall: host.desktopCall });
            if (item.target === 'manuscript') {
              void client.showManuscriptReminder(sessionId, item.id);
              return;
            }
            if (item.target === 'media') {
              void client.showRecordingReminder(sessionId, item.id);
              return;
            }
            const unreachable: never = item.target;
            return unreachable;
          }}
        />
      )}
      {deletePreview === null || host === null || read.sessionId === null ? null : (
        <DesktopManuscriptDeleteDialog
          preview={deletePreview}
          onCancel={() => setDeletePreview(null)}
          onConfirm={() => {
            const sessionId = read.sessionId;
            if (sessionId === null || !canConfirmManuscriptDelete(deletePreview)) return;
            const id = deletePreview.id;
            void createDesktopClient({ desktopCall: host.desktopCall })
              .deleteManuscript(sessionId, id)
              .then(() => {
                setDeletePreview(null);
                read.selectManuscript(id);
              })
              .catch(() => setDeletePreview(null));
          }}
        />
      )}
      {featureFlags.projectCustomFieldsEnabled && read.sessionId !== null ? (
        <ProjectCustomFieldManager desktopCall={host.desktopCall} sessionId={read.sessionId} />
      ) : null}
    </section>
  );
}
