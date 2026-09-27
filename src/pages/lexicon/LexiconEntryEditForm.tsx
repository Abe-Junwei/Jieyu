import { ConfirmDeleteDialog } from '../../components/ConfirmDeleteDialog';
import { t, useLocale } from '../../i18n';
import type { LexiconEntryEditController } from '../useLexiconEntryEditController';
import { LexiconExtraSenseEditor } from './LexiconExtraSenseEditor';
import { LexiconSenseExampleFields } from './LexiconSenseExampleFields';

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
      <label className="lexicon-entry-edit-field">
        <span>{t(locale, 'workspace.lexicon.edit.semanticDomainsLabel')}</span>
        <textarea
          className="input lexicon-entry-edit-input"
          data-testid="lexicon-entry-semantic-domains"
          rows={3}
          placeholder={t(locale, 'workspace.lexicon.edit.semanticDomainsHint')}
          value={editor.fields.semanticDomains}
          onChange={(event) => editor.onFieldChange('semanticDomains', event.target.value)}
        />
      </label>
      <label className="lexicon-entry-edit-field">
        <span>{t(locale, 'workspace.lexicon.edit.phonologyNoteLabel')}</span>
        <input
          className="input lexicon-entry-edit-input"
          data-testid="lexicon-entry-phonology-note"
          value={editor.fields.phonologyNote}
          onChange={(event) => editor.onFieldChange('phonologyNote', event.target.value)}
        />
      </label>
      <label className="lexicon-entry-edit-field">
        <span>{t(locale, 'workspace.lexicon.edit.semanticsNoteLabel')}</span>
        <input
          className="input lexicon-entry-edit-input"
          data-testid="lexicon-entry-semantics-note"
          value={editor.fields.semanticsNote}
          onChange={(event) => editor.onFieldChange('semanticsNote', event.target.value)}
        />
      </label>
      <label className="lexicon-entry-edit-field">
        <span>{t(locale, 'workspace.lexicon.edit.sociolinguisticsNoteLabel')}</span>
        <input
          className="input lexicon-entry-edit-input"
          data-testid="lexicon-entry-sociolinguistics-note"
          value={editor.fields.sociolinguisticsNote}
          onChange={(event) => editor.onFieldChange('sociolinguisticsNote', event.target.value)}
        />
      </label>
      <label className="lexicon-entry-edit-field">
        <span>{t(locale, 'workspace.lexicon.edit.sourceNoteLabel')}</span>
        <input
          className="input lexicon-entry-edit-input"
          data-testid="lexicon-entry-source-note"
          value={editor.fields.sourceNote}
          onChange={(event) => editor.onFieldChange('sourceNote', event.target.value)}
        />
      </label>
      <label className="lexicon-entry-edit-field">
        <span>{t(locale, 'workspace.lexicon.edit.usagesLabel')}</span>
        <textarea
          className="input lexicon-entry-edit-input"
          data-testid="lexicon-entry-usages"
          rows={3}
          placeholder={t(locale, 'workspace.lexicon.edit.usagesHint')}
          value={editor.fields.usages}
          onChange={(event) => editor.onFieldChange('usages', event.target.value)}
        />
      </label>
      <label className="lexicon-entry-edit-field">
        <span>{t(locale, 'workspace.lexicon.edit.senseTypeLabel')}</span>
        <input
          className="input lexicon-entry-edit-input"
          data-testid="lexicon-entry-sense-type"
          value={editor.fields.senseType}
          onChange={(event) => editor.onFieldChange('senseType', event.target.value)}
        />
      </label>
      <label className="lexicon-entry-edit-field">
        <span>{t(locale, 'workspace.lexicon.edit.academicDomainsLabel')}</span>
        <textarea
          className="input lexicon-entry-edit-input"
          data-testid="lexicon-entry-academic-domains"
          rows={3}
          placeholder={t(locale, 'workspace.lexicon.edit.academicDomainsHint')}
          value={editor.fields.academicDomains}
          onChange={(event) => editor.onFieldChange('academicDomains', event.target.value)}
        />
      </label>
      <label className="lexicon-entry-edit-field">
        <span>{t(locale, 'workspace.lexicon.edit.anthropologyCategoriesLabel')}</span>
        <textarea
          className="input lexicon-entry-edit-input"
          data-testid="lexicon-entry-anthropology-categories"
          rows={3}
          placeholder={t(locale, 'workspace.lexicon.edit.anthropologyCategoriesHint')}
          value={editor.fields.anthropologyCategories}
          onChange={(event) => editor.onFieldChange('anthropologyCategories', event.target.value)}
        />
      </label>
      <label className="lexicon-entry-edit-field">
        <span>{t(locale, 'workspace.lexicon.edit.senseStatusLabel')}</span>
        <input
          className="input lexicon-entry-edit-input"
          data-testid="lexicon-entry-sense-status"
          value={editor.fields.senseStatus}
          onChange={(event) => editor.onFieldChange('senseStatus', event.target.value)}
        />
      </label>
      <label className="lexicon-entry-edit-field">
        <span>{t(locale, 'workspace.lexicon.edit.dialectLabelsLabel')}</span>
        <textarea
          className="input lexicon-entry-edit-input"
          data-testid="lexicon-entry-dialect-labels"
          rows={3}
          placeholder={t(locale, 'workspace.lexicon.edit.dialectLabelsHint')}
          value={editor.fields.dialectLabels}
          onChange={(event) => editor.onFieldChange('dialectLabels', event.target.value)}
        />
      </label>
      <label className="lexicon-entry-edit-field">
        <span>{t(locale, 'workspace.lexicon.edit.senseRestrictionsLabel')}</span>
        <input
          className="input lexicon-entry-edit-input"
          data-testid="lexicon-entry-sense-restrictions"
          value={editor.fields.senseRestrictions}
          onChange={(event) => editor.onFieldChange('senseRestrictions', event.target.value)}
        />
      </label>
      <LexiconSenseExampleFields
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
      <LexiconExtraSenseEditor editor={editor} locale={locale} />
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
