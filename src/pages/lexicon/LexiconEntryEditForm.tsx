import { ConfirmDeleteDialog } from '../../components/ConfirmDeleteDialog';
import { t, useLocale, type Locale } from '../../i18n';
import {
  canDemoteSense,
  moveSenseSiblingBlock,
  promoteSense,
  senseDepth,
} from '../../utils/lexemeSenseTree';
import type { LexiconExampleDraft } from './saveLexiconEntry';
import type { LexiconEntryEditController } from '../useLexiconEntryEditController';

type Props = {
  editor: LexiconEntryEditController;
};

function SenseExampleFields({
  locale,
  examples,
  idPrefix,
  onChange,
  onAdd,
  onRemove,
}: {
  locale: Locale;
  examples: LexiconExampleDraft[];
  idPrefix: string;
  onChange: (index: number, field: 'source' | 'translation', value: string) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div className="lexicon-entry-edit-field">
      {examples.map((example, index) => (
        <div key={`${idPrefix}-example-${index}`} className="lexicon-entry-edit-field">
          <label className="lexicon-entry-edit-field">
            <span>{t(locale, 'workspace.lexicon.edit.exampleSourceLabel')}</span>
            <input
              className="input lexicon-entry-edit-input"
              data-testid={`${idPrefix}-example-${index}-source`}
              value={example.source}
              onChange={(event) => onChange(index, 'source', event.target.value)}
            />
          </label>
          <label className="lexicon-entry-edit-field">
            <span>{t(locale, 'workspace.lexicon.edit.exampleTranslationLabel')}</span>
            <input
              className="input lexicon-entry-edit-input"
              data-testid={`${idPrefix}-example-${index}-translation`}
              value={example.translation ?? ''}
              onChange={(event) => onChange(index, 'translation', event.target.value)}
            />
          </label>
          <button
            type="button"
            className="btn"
            data-testid={`${idPrefix}-remove-example-${index}`}
            onClick={() => onRemove(index)}
          >
            {t(locale, 'workspace.lexicon.edit.removeExample')}
          </button>
        </div>
      ))}
      <button type="button" className="btn" data-testid={`${idPrefix}-add-example`} onClick={onAdd}>
        {t(locale, 'workspace.lexicon.edit.addExample')}
      </button>
    </div>
  );
}

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
        <span>{t(locale, 'workspace.lexicon.edit.categoryLabel')}</span>
        <input
          className="input lexicon-entry-edit-input"
          data-testid="lexicon-entry-category"
          value={editor.fields.category}
          onChange={(event) => editor.onFieldChange('category', event.target.value)}
        />
      </label>
      <label className="lexicon-entry-edit-field">
        <span>{t(locale, 'workspace.lexicon.edit.scientificNameLabel')}</span>
        <input
          className="input lexicon-entry-edit-input"
          data-testid="lexicon-entry-scientific-name"
          value={editor.fields.scientificName}
          onChange={(event) => editor.onFieldChange('scientificName', event.target.value)}
        />
      </label>
      <label className="lexicon-entry-edit-field">
        <span>{t(locale, 'workspace.lexicon.edit.anthropologyNoteLabel')}</span>
        <input
          className="input lexicon-entry-edit-input"
          data-testid="lexicon-entry-anthropology-note"
          value={editor.fields.anthropologyNote}
          onChange={(event) => editor.onFieldChange('anthropologyNote', event.target.value)}
        />
      </label>
      <label className="lexicon-entry-edit-field">
        <span>{t(locale, 'workspace.lexicon.edit.discourseNoteLabel')}</span>
        <input
          className="input lexicon-entry-edit-input"
          data-testid="lexicon-entry-discourse-note"
          value={editor.fields.discourseNote}
          onChange={(event) => editor.onFieldChange('discourseNote', event.target.value)}
        />
      </label>
      <label className="lexicon-entry-edit-field">
        <span>{t(locale, 'workspace.lexicon.edit.encyclopedicNoteLabel')}</span>
        <input
          className="input lexicon-entry-edit-input"
          data-testid="lexicon-entry-encyclopedic-note"
          value={editor.fields.encyclopedicNote}
          onChange={(event) => editor.onFieldChange('encyclopedicNote', event.target.value)}
        />
      </label>
      <label className="lexicon-entry-edit-field">
        <span>{t(locale, 'workspace.lexicon.edit.grammarNoteLabel')}</span>
        <input
          className="input lexicon-entry-edit-input"
          data-testid="lexicon-entry-grammar-note"
          value={editor.fields.grammarNote}
          onChange={(event) => editor.onFieldChange('grammarNote', event.target.value)}
        />
      </label>
      <SenseExampleFields
        locale={locale}
        examples={editor.fields.examples}
        idPrefix="lexicon-entry"
        onChange={(index, field, value) => editor.onExampleChange('primary', index, field, value)}
        onAdd={() => editor.onAddExample('primary')}
        onRemove={(index) => editor.onRemoveExample('primary', index)}
      />
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
              <span>{t(locale, 'workspace.lexicon.edit.senseCategoryLabel')}</span>
              <input
                className="input lexicon-entry-edit-input"
                data-testid={`lexicon-entry-extra-sense-${index}-category`}
                value={sense.category ?? ''}
                onChange={(event) =>
                  editor.onExtraSenseChange(index, 'category', event.target.value)
                }
              />
            </label>
            <label className="lexicon-entry-edit-field">
              <span>{t(locale, 'workspace.lexicon.edit.senseScientificNameLabel')}</span>
              <input
                className="input lexicon-entry-edit-input"
                data-testid={`lexicon-entry-extra-sense-${index}-scientific-name`}
                value={sense.scientificName ?? ''}
                onChange={(event) =>
                  editor.onExtraSenseChange(index, 'scientificName', event.target.value)
                }
              />
            </label>
            <label className="lexicon-entry-edit-field">
              <span>{t(locale, 'workspace.lexicon.edit.senseAnthropologyNoteLabel')}</span>
              <input
                className="input lexicon-entry-edit-input"
                data-testid={`lexicon-entry-extra-sense-${index}-anthropology-note`}
                value={sense.anthropologyNote ?? ''}
                onChange={(event) =>
                  editor.onExtraSenseChange(index, 'anthropologyNote', event.target.value)
                }
              />
            </label>
            <label className="lexicon-entry-edit-field">
              <span>{t(locale, 'workspace.lexicon.edit.senseDiscourseNoteLabel')}</span>
              <input
                className="input lexicon-entry-edit-input"
                data-testid={`lexicon-entry-extra-sense-${index}-discourse-note`}
                value={sense.discourseNote ?? ''}
                onChange={(event) =>
                  editor.onExtraSenseChange(index, 'discourseNote', event.target.value)
                }
              />
            </label>
            <label className="lexicon-entry-edit-field">
              <span>{t(locale, 'workspace.lexicon.edit.senseEncyclopedicNoteLabel')}</span>
              <input
                className="input lexicon-entry-edit-input"
                data-testid={`lexicon-entry-extra-sense-${index}-encyclopedic-note`}
                value={sense.encyclopedicNote ?? ''}
                onChange={(event) =>
                  editor.onExtraSenseChange(index, 'encyclopedicNote', event.target.value)
                }
              />
            </label>
            <label className="lexicon-entry-edit-field">
              <span>{t(locale, 'workspace.lexicon.edit.senseGrammarNoteLabel')}</span>
              <input
                className="input lexicon-entry-edit-input"
                data-testid={`lexicon-entry-extra-sense-${index}-grammar-note`}
                value={sense.grammarNote ?? ''}
                onChange={(event) =>
                  editor.onExtraSenseChange(index, 'grammarNote', event.target.value)
                }
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
            <SenseExampleFields
              locale={locale}
              examples={sense.examples ?? []}
              idPrefix={`lexicon-entry-extra-sense-${index}`}
              onChange={(exampleIndex, field, value) =>
                editor.onExampleChange(index, exampleIndex, field, value)
              }
              onAdd={() => editor.onAddExample(index)}
              onRemove={(exampleIndex) => editor.onRemoveExample(index, exampleIndex)}
            />
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
        <span>{t(locale, 'workspace.lexicon.pronunciationLabel')}</span>
        <input
          className="input lexicon-entry-edit-input"
          data-testid="lexicon-entry-pronunciation"
          value={editor.fields.pronunciation}
          onChange={(event) => editor.onFieldChange('pronunciation', event.target.value)}
        />
      </label>
      <label className="lexicon-entry-edit-field">
        <span>{t(locale, 'workspace.lexicon.edit.etymologyFormLabel')}</span>
        <input
          className="input lexicon-entry-edit-input"
          data-testid="lexicon-entry-etymology-form"
          value={editor.fields.etymologyForm}
          onChange={(event) => editor.onFieldChange('etymologyForm', event.target.value)}
        />
      </label>
      <label className="lexicon-entry-edit-field">
        <span>{t(locale, 'workspace.lexicon.edit.etymologyGlossLabel')}</span>
        <input
          className="input lexicon-entry-edit-input"
          data-testid="lexicon-entry-etymology-gloss"
          value={editor.fields.etymologyGloss}
          onChange={(event) => editor.onFieldChange('etymologyGloss', event.target.value)}
        />
      </label>
      <label className="lexicon-entry-edit-field">
        <span>{t(locale, 'workspace.lexicon.edit.etymologySourceLabel')}</span>
        <input
          className="input lexicon-entry-edit-input"
          data-testid="lexicon-entry-etymology-source"
          value={editor.fields.etymologySourceLanguage}
          onChange={(event) => editor.onFieldChange('etymologySourceLanguage', event.target.value)}
        />
      </label>
      <label className="lexicon-entry-edit-field">
        <span>{t(locale, 'workspace.lexicon.literalMeaningLabel')}</span>
        <input
          className="input lexicon-entry-edit-input"
          data-testid="lexicon-entry-literal-meaning"
          value={editor.fields.literalMeaning}
          onChange={(event) => editor.onFieldChange('literalMeaning', event.target.value)}
        />
      </label>
      <label className="lexicon-entry-edit-field">
        <span>{t(locale, 'workspace.lexicon.bibliographyLabel')}</span>
        <input
          className="input lexicon-entry-edit-input"
          data-testid="lexicon-entry-bibliography"
          value={editor.fields.bibliography}
          onChange={(event) => editor.onFieldChange('bibliography', event.target.value)}
        />
      </label>
      <label className="lexicon-entry-edit-field">
        <span>{t(locale, 'workspace.lexicon.restrictionsLabel')}</span>
        <input
          className="input lexicon-entry-edit-input"
          data-testid="lexicon-entry-restrictions"
          value={editor.fields.restrictions}
          onChange={(event) => editor.onFieldChange('restrictions', event.target.value)}
        />
      </label>
      <label className="lexicon-entry-edit-field">
        <span>{t(locale, 'workspace.lexicon.summaryDefinitionLabel')}</span>
        <input
          className="input lexicon-entry-edit-input"
          data-testid="lexicon-entry-summary-definition"
          value={editor.fields.summaryDefinition}
          onChange={(event) => editor.onFieldChange('summaryDefinition', event.target.value)}
        />
      </label>
      <label className="lexicon-entry-edit-field">
        <span>{t(locale, 'workspace.lexicon.lexemeTypeLabel')}</span>
        <input
          className="input lexicon-entry-edit-input"
          data-testid="lexicon-entry-lexeme-type"
          value={editor.fields.lexemeType}
          onChange={(event) => editor.onFieldChange('lexemeType', event.target.value)}
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
