import { ModalPanel } from '../components/ui/ModalPanel';
import { t, tf, type Locale } from '../i18n';
import type { NotesDialogState } from './useDesktopTranscriptionMetadataController';

export function DesktopTranscriptionNotesDialog(props: {
  locale: Locale;
  state: NotesDialogState;
  onClose: () => void;
  onAdd: () => void;
  onEdit: (noteId: string) => void;
  onDelete: (noteId: string) => void;
  onDraft: (value: string) => void;
  onSave: () => void;
  onBackToList: () => void;
}) {
  const { locale, state } = props;
  if (state === null) return null;

  if (state.mode === 'list') {
    return (
      <ModalPanel
        isOpen
        compact
        className="desktop-tx-notes"
        closeLabel={t(locale, 'app.desktopTranscription.cancel')}
        onClose={props.onClose}
        title={t(locale, 'app.desktopTranscription.notesTitle')}
        footer={
          <button type="button" className="btn btn-secondary" onClick={props.onClose}>
            {t(locale, 'app.desktopTranscription.close')}
          </button>
        }
      >
        <p className="desktop-tx-notes__meta">
          <span>{state.layerName}</span>
          {state.orthographyLabel ? <span>{state.orthographyLabel}</span> : null}
          <span>
            {t(
              locale,
              state.textLayerId === null
                ? 'app.desktopTranscription.notesSegmentScope'
                : 'app.desktopTranscription.notesLayerScope',
            )}
          </span>
        </p>
        <ul className="desktop-tx-notes__list">
          {state.notes.map((note) => (
            <li key={note.id} className="desktop-tx-notes__row">
              <div className="desktop-tx-notes__body">
                <span className="desktop-tx-notes__author">
                  {note.category ?? t(locale, 'app.desktopTranscription.notesDefaultAuthor')}
                </span>
                <span className="desktop-tx-notes__text">{note.text}</span>
              </div>
              <div className="desktop-tx-notes__actions">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => props.onEdit(note.id)}
                >
                  {t(locale, 'app.desktopTranscription.notesEdit')}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => props.onDelete(note.id)}
                >
                  {t(locale, 'app.desktopTranscription.notesDelete')}
                </button>
              </div>
            </li>
          ))}
        </ul>
        <button type="button" className="btn btn-secondary" onClick={props.onAdd}>
          {t(locale, 'app.desktopTranscription.notesAdd')}
        </button>
      </ModalPanel>
    );
  }

  const editing = state.mode === 'edit';
  const batch = state.mode === 'batch';
  return (
    <ModalPanel
      isOpen
      compact
      className="desktop-tx-notes"
      closeLabel={t(locale, 'app.desktopTranscription.cancel')}
      onClose={props.onClose}
      title={
        batch
          ? tf(locale, 'app.desktopTranscription.notesBatchTitle', { count: state.unitIds.length })
          : editing
            ? t(locale, 'app.desktopTranscription.notesEditTitle')
            : t(locale, 'app.desktopTranscription.notesAddTitle')
      }
      footer={
        <>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={state.unitIds.length === 1 ? props.onBackToList : props.onClose}
          >
            {t(locale, 'app.desktopTranscription.cancel')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={state.draft.trim().length === 0}
            onClick={props.onSave}
          >
            {t(locale, 'app.desktopTranscription.notesSave')}
          </button>
        </>
      }
    >
      <p className="desktop-tx-notes__meta">
        <span>{state.layerName}</span>
        {state.orthographyLabel ? <span>{state.orthographyLabel}</span> : null}
        <span>
          {batch
            ? t(locale, 'app.desktopTranscription.notesBatchScope')
            : t(
                locale,
                state.textLayerId === null
                  ? 'app.desktopTranscription.notesSegmentScope'
                  : 'app.desktopTranscription.notesLayerScope',
              )}
        </span>
      </p>
      {state.failed ? (
        <p className="desktop-tx-notes__error" role="alert">
          {t(locale, 'app.desktopTranscription.notesSaveFailed')}
        </p>
      ) : null}
      <label className="desktop-tx-notes__field">
        <span>{t(locale, 'app.desktopTranscription.notesBody')}</span>
        <textarea
          value={state.draft}
          rows={4}
          onChange={(event) => props.onDraft(event.target.value)}
        />
      </label>
    </ModalPanel>
  );
}
