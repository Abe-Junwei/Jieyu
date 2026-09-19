import { ConfirmDeleteDialog } from '../../components/ConfirmDeleteDialog';
import { t, useLocale } from '../../i18n';
import type { LexiconEntryEditController } from '../useLexiconEntryEditController';

type Props = {
  editor: LexiconEntryEditController;
};

export function LexiconEntryEditForm({ editor }: Props) {
  const locale = useLocale();
  return (
    <form
      className="lexicon-entry-edit"
      data-testid="lexicon-entry-edit"
      onSubmit={(event) => {
        event.preventDefault();
        editor.onSave();
      }}
    >
      <label className="lexicon-entry-edit-field">
        <span>{t(locale, 'workspace.lexicon.edit.lemmaLabel')}</span>
        <input
          className="input lexicon-entry-edit-input"
          data-testid="lexicon-entry-lemma"
          value={editor.fields.lemma}
          onChange={(event) => editor.onFieldChange('lemma', event.target.value)}
        />
      </label>
      <label className="lexicon-entry-edit-field">
        <span>{t(locale, 'workspace.lexicon.edit.glossLabel')}</span>
        <input
          className="input lexicon-entry-edit-input"
          data-testid="lexicon-entry-gloss"
          value={editor.fields.gloss}
          onChange={(event) => editor.onFieldChange('gloss', event.target.value)}
        />
      </label>
      <label className="lexicon-entry-edit-field">
        <span>{t(locale, 'workspace.lexicon.citationLabel')}</span>
        <input
          className="input lexicon-entry-edit-input"
          data-testid="lexicon-entry-citation"
          value={editor.fields.citationForm}
          onChange={(event) => editor.onFieldChange('citationForm', event.target.value)}
        />
      </label>
      <label className="lexicon-entry-edit-field">
        <span>{t(locale, 'workspace.lexicon.languageLabel')}</span>
        <input
          className="input lexicon-entry-edit-input"
          data-testid="lexicon-entry-language"
          value={editor.fields.language}
          onChange={(event) => editor.onFieldChange('language', event.target.value)}
        />
      </label>
      <label className="lexicon-entry-edit-field">
        <span>{t(locale, 'workspace.lexicon.notesTitle')}</span>
        <textarea
          className="input lexicon-entry-edit-notes"
          data-testid="lexicon-entry-notes"
          value={editor.fields.notes}
          onChange={(event) => editor.onFieldChange('notes', event.target.value)}
        />
      </label>
      {editor.error.length > 0 ? (
        <p className="lexicon-workspace-state lexicon-workspace-state-error">{editor.error}</p>
      ) : null}
      {editor.saved ? (
        <p className="lexicon-workspace-state">{t(locale, 'workspace.lexicon.edit.saved')}</p>
      ) : null}
      <div className="lexicon-entry-edit-actions">
        <button
          type="submit"
          className="btn btn-primary"
          data-testid="lexicon-entry-save"
          disabled={editor.saving}
        >
          {t(locale, 'workspace.lexicon.edit.save')}
        </button>
        {editor.creating ? (
          <button
            type="button"
            className="btn"
            data-testid="lexicon-entry-cancel-create"
            onClick={editor.onCancelCreate}
          >
            {t(locale, 'workspace.lexicon.edit.cancelCreate')}
          </button>
        ) : (
          <button
            type="button"
            className="btn"
            data-testid="lexicon-entry-delete"
            disabled={editor.deleting}
            onClick={editor.onRequestDelete}
          >
            {t(locale, 'workspace.lexicon.edit.delete')}
          </button>
        )}
      </div>
      <ConfirmDeleteDialog
        locale={locale}
        open={editor.confirmDelete}
        title={t(locale, 'workspace.lexicon.edit.deleteTitle')}
        description={t(locale, 'workspace.lexicon.edit.deleteConfirm')}
        onCancel={editor.onCancelDelete}
        onConfirm={editor.onConfirmDelete}
      />
    </form>
  );
}
