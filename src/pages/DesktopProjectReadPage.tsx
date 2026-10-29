import { useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { featureFlags } from '../ai/config/featureFlags';
import {
  createDesktopClient,
  type DueDeletionReminder,
  type ManuscriptDeletePreview,
} from '../app/desktopProjectReadPageAccess';
import { readDesktopProjectHost } from '../desktop/projectReadHost';
import { t, useLocale } from '../i18n';
import { DesktopConversationPanel } from './DesktopConversationPanel';
import { DesktopCorpusQueryPanel } from './DesktopCorpusQueryPanel';
import { DesktopExchangePanel } from './DesktopExchangePanel';
import { DesktopDailyBackupPanel } from './DesktopDailyBackupPanel';
import { DesktopDeletionReminderDialog } from './DesktopDeletionReminderDialog';
import { DesktopManuscriptDeleteDialog } from './DesktopManuscriptDeleteDialog';
import { DesktopMediaReregisterPanel } from './DesktopMediaReregisterPanel';
import { DesktopProjectReadView } from './DesktopProjectReadView';
import { DesktopScopeNote } from './DesktopScopeNote';
import { DesktopSpeakerCatalogPanel } from './DesktopSpeakerCatalogPanel';
import { DesktopTranscriptionAcceptPanel } from './DesktopTranscriptionAcceptPanel';
import { ProjectCustomFieldManager } from './ProjectCustomFieldManager';
import { canConfirmManuscriptDelete } from './desktopManuscriptDelete';
import { readDesktopCorpusLocate } from './desktopCorpusLocate';
import { useDesktopProjectReadController } from './useDesktopProjectReadController';
import '../styles/pages/desktop-project-read.css';

export function DesktopProjectReadPage() {
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
  const [deletePreview, setDeletePreview] = useState<ManuscriptDeletePreview | null>(null);
  const [dueReminders, setDueReminders] = useState<DueDeletionReminder[] | null>(null);

  if (host === null) return <Navigate to="/" replace />;

  const selected = read.model?.manuscripts.find((item) => item.id === read.model?.manuscriptId);

  return (
    <section className="desktop-project-read">
      <button type="button" className="btn btn-primary" onClick={read.openFolder}>
        {t(locale, 'app.desktopRead.openFolder')}
      </button>
      {read.projectTitle.length > 0 ? <p>{read.projectTitle}</p> : null}
      {read.error.length > 0 ? <p role="alert">{read.error}</p> : null}
      {read.sessionId === null ||
      host.chooseImportFile === undefined ||
      host.chooseExportFile === undefined ? null : (
        <DesktopExchangePanel
          sessionId={read.sessionId}
          manuscriptId={read.model?.manuscriptId ?? null}
          desktopCall={host.desktopCall}
          chooseImportFile={host.chooseImportFile}
          chooseExportFile={host.chooseExportFile}
          onImported={read.refresh}
        />
      )}
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
      {read.sessionId === null ? null : (
        <DesktopConversationPanel host={host} sessionId={read.sessionId} />
      )}
      {read.model === null || host === null || read.sessionId === null ? null : (
        <DesktopSpeakerCatalogPanel
          host={host}
          sessionId={read.sessionId}
          units={read.model.units}
          onAssigned={read.refresh}
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
          onSaveText={read.saveText}
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
      {read.sessionId === null ? null : (
        <DesktopScopeNote
          sessionId={read.sessionId}
          desktopCall={host.desktopCall}
          scope={{ kind: 'project' }}
          label={t(locale, 'app.desktopRead.projectNote')}
          saveLabel={t(locale, 'app.desktopRead.saveProjectNote')}
        />
      )}
      {read.sessionId === null || selected === undefined ? null : (
        <DesktopScopeNote
          sessionId={read.sessionId}
          desktopCall={host.desktopCall}
          scope={{ kind: 'manuscript', manuscriptId: selected.id }}
          label={`${t(locale, 'app.desktopRead.manuscriptNote')}: ${manuscriptTitle(selected.title, locale)}`}
          saveLabel={`${t(locale, 'app.desktopRead.saveManuscriptNote')}: ${manuscriptTitle(selected.title, locale)}`}
        />
      )}
      {read.sessionId === null || read.model?.layerId == null ? null : (
        <DesktopScopeNote
          sessionId={read.sessionId}
          desktopCall={host.desktopCall}
          scope={{ kind: 'layer', layerId: read.model.layerId }}
          label={t(locale, 'app.desktopRead.layerNote')}
          saveLabel={t(locale, 'app.desktopRead.saveLayerNote')}
        />
      )}
      {read.sessionId === null ? null : (
        <DesktopMediaReregisterPanel sessionId={read.sessionId} desktopCall={host.desktopCall} />
      )}
      {read.model?.manuscriptId == null || host === null || read.sessionId === null ? null : (
        <DesktopTranscriptionAcceptPanel
          sessionId={read.sessionId}
          manuscriptId={read.model.manuscriptId}
          desktopCall={host.desktopCall}
          onAccepted={() => read.refresh()}
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
      {read.sessionId === null ||
      host.listDailyBackups === undefined ||
      host.restoreDailyBackup === undefined ? null : (
        <DesktopDailyBackupPanel
          sessionId={read.sessionId}
          listDailyBackups={host.listDailyBackups}
          restoreDailyBackup={host.restoreDailyBackup}
        />
      )}
      {dueReminders === null || host === null || read.sessionId === null ? null : (
        <DesktopDeletionReminderDialog
          items={dueReminders}
          onClose={() => setDueReminders(null)}
          onPurge={(id) => {
            const sessionId = read.sessionId;
            if (sessionId === null || host === null) return Promise.reject(new Error('missing'));
            return createDesktopClient({ desktopCall: host.desktopCall })
              .purgeManuscript(sessionId, id)
              .then(() => {
                setDueReminders(null);
                return read.refresh();
              });
          }}
          onRemoveFile={(id) => {
            const sessionId = read.sessionId;
            if (sessionId === null || host === null) return Promise.reject(new Error('missing'));
            return createDesktopClient({ desktopCall: host.desktopCall })
              .finishMediaCleanup(sessionId, id, crypto.randomUUID())
              .then((result) => {
                if (result.state !== 'confirmed') throw new Error('media file was not removed');
                setDueReminders(null);
                return read.refresh();
              });
          }}
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

function manuscriptTitle(title: Record<string, string>, locale: string): string {
  return title[locale] ?? Object.values(title)[0] ?? '';
}
