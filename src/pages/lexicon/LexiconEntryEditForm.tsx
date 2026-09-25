import { ConfirmDeleteDialog } from '../../components/ConfirmDeleteDialog';
import { t, useLocale } from '../../i18n';
import {
  canDemoteSense,
  moveSenseSiblingBlock,
  promoteSense,
  senseDepth,
} from '../../utils/lexemeSenseTree';
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
      <button
        type="button"
        className="btn"
        data-testid="lexicon-entry-add-subsense-primary"
        onClick={() => editor.onAddSubsense('primary')}
      >
        {t(locale, 'workspace.lexicon.edit.addSubsense')}
      </button>
      <div className="lexicon-entry-edit-field">
        <span>{t(locale, 'workspace.lexicon.edit.extraSensesLabel')}</span>
        {editor.fields.extraSenses.map((sense, index) => (
          <div
            key={sense.id ?? `extra-sense-${index}`}
            className="lexicon-entry-edit-row"
            data-depth={senseDepth(
              [
                ...(editor.fields.primarySenseId ? [{ id: editor.fields.primarySenseId }] : []),
                ...editor.fields.extraSenses,
              ],
              sense.id ?? '',
            )}
            data-testid={`lexicon-entry-extra-sense-${index}`}
          >
            <label className="lexicon-entry-edit-field">
              <span>{t(locale, 'workspace.lexicon.edit.senseGlossLabel')}</span>
              <input
                className="input lexicon-entry-edit-input"
                data-testid={`lexicon-entry-extra-sense-${index}-gloss`}
                value={sense.gloss}
                onChange={(event) => editor.onExtraSenseChange(index, 'gloss', event.target.value)}
              />
            </label>
            <label className="lexicon-entry-edit-field">
              <span>{t(locale, 'workspace.lexicon.edit.senseDefinitionLabel')}</span>
              <input
                className="input lexicon-entry-edit-input"
                data-testid={`lexicon-entry-extra-sense-${index}-definition`}
                value={sense.definition}
                onChange={(event) =>
                  editor.onExtraSenseChange(index, 'definition', event.target.value)
                }
              />
            </label>
            <button
              type="button"
              className="btn"
              data-testid={`lexicon-entry-add-subsense-${index}`}
              onClick={() => editor.onAddSubsense(index)}
            >
              {t(locale, 'workspace.lexicon.edit.addSubsense')}
            </button>
            <button
              type="button"
              className="btn"
              data-testid={`lexicon-entry-move-sense-up-${index}`}
              disabled={
                moveSenseSiblingBlock(editor.fields.extraSenses, index, -1) ===
                editor.fields.extraSenses
              }
              onClick={() => editor.onMoveExtraSense(index, -1)}
            >
              {t(locale, 'workspace.lexicon.edit.moveSenseUp')}
            </button>
            <button
              type="button"
              className="btn"
              data-testid={`lexicon-entry-move-sense-down-${index}`}
              disabled={
                moveSenseSiblingBlock(editor.fields.extraSenses, index, 1) ===
                editor.fields.extraSenses
              }
              onClick={() => editor.onMoveExtraSense(index, 1)}
            >
              {t(locale, 'workspace.lexicon.edit.moveSenseDown')}
            </button>
            <button
              type="button"
              className="btn"
              data-testid={`lexicon-entry-promote-sense-${index}`}
              disabled={
                promoteSense(
                  editor.fields.extraSenses,
                  index,
                  editor.fields.primarySenseId ?? '',
                ) === editor.fields.extraSenses
              }
              onClick={() => editor.onPromoteExtraSense(index)}
            >
              {t(locale, 'workspace.lexicon.edit.promoteSense')}
            </button>
            <button
              type="button"
              className="btn"
              data-testid={`lexicon-entry-demote-sense-${index}`}
              disabled={
                !canDemoteSense(
                  editor.fields.extraSenses,
                  index,
                  editor.fields.primarySenseId ?? '',
                )
              }
              onClick={() => editor.onDemoteExtraSense(index)}
            >
              {t(locale, 'workspace.lexicon.edit.demoteSense')}
            </button>
            <button
              type="button"
              className="btn"
              data-testid={`lexicon-entry-remove-sense-${index}`}
              onClick={() => editor.onRemoveExtraSense(index)}
            >
              {t(locale, 'workspace.lexicon.edit.removeSense')}
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn"
          data-testid="lexicon-entry-add-sense"
          onClick={editor.onAddExtraSense}
        >
          {t(locale, 'workspace.lexicon.edit.addSense')}
        </button>
      </div>
      <div className="lexicon-entry-edit-field">
        <span>{t(locale, 'workspace.lexicon.edit.formsLabel')}</span>
        {editor.fields.forms.map((form, index) => (
          <div key={form.id ?? `form-${index}`} className="lexicon-entry-edit-row">
            <label className="lexicon-entry-edit-field">
              <span>{t(locale, 'workspace.lexicon.edit.formTranscriptionLabel')}</span>
              <input
                className="input lexicon-entry-edit-input"
                data-testid={`lexicon-entry-form-${index}`}
                value={form.transcription}
                onChange={(event) => editor.onFormChange(index, event.target.value)}
              />
            </label>
            <button
              type="button"
              className="btn"
              data-testid={`lexicon-entry-remove-form-${index}`}
              onClick={() => editor.onRemoveForm(index)}
            >
              {t(locale, 'workspace.lexicon.edit.removeForm')}
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn"
          data-testid="lexicon-entry-add-form"
          onClick={editor.onAddForm}
        >
          {t(locale, 'workspace.lexicon.edit.addForm')}
        </button>
      </div>
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
