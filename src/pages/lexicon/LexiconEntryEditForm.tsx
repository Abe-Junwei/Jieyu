import { ConfirmDeleteDialog } from '../../components/ConfirmDeleteDialog';
import { t, useLocale } from '../../i18n';
import type { LexiconSenseDraft } from '../../utils/dmlexEntry';
import type { LexiconEntryEditController } from '../useLexiconEntryEditController';

type Props = {
  editor: LexiconEntryEditController;
};

function draftDepth(senses: readonly LexiconSenseDraft[], index: number): number {
  let depth = 0;
  let parent = senses[index]?.parentId ?? '';
  const seen = new Set<string>();
  while (parent.length > 0 && depth < 8 && !seen.has(parent)) {
    seen.add(parent);
    depth += 1;
    const row = senses.find((sense) => sense.id === parent);
    parent = row?.parentId ?? '';
  }
  return depth;
}

function TextField({
  label,
  testId,
  value,
  onChange,
}: {
  label: string;
  testId: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="lexicon-entry-edit-field">
      <span>{label}</span>
      <input
        className="input lexicon-entry-edit-input"
        data-testid={testId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
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
      <TextField
        label={t(locale, 'workspace.lexicon.edit.headwordLabel')}
        testId="lexicon-entry-headword"
        value={editor.fields.headword}
        onChange={(value) => editor.onFieldChange('headword', value)}
      />
      <TextField
        label={t(locale, 'workspace.lexicon.edit.homographNumberLabel')}
        testId="lexicon-entry-homograph-number"
        value={editor.fields.homographNumber}
        onChange={(value) => editor.onFieldChange('homographNumber', value)}
      />
      <TextField
        label={t(locale, 'workspace.lexicon.edit.partsOfSpeechLabel')}
        testId="lexicon-entry-parts-of-speech"
        value={editor.fields.partsOfSpeech}
        onChange={(value) => editor.onFieldChange('partsOfSpeech', value)}
      />
      <TextField
        label={t(locale, 'workspace.lexicon.edit.labelsLabel')}
        testId="lexicon-entry-labels"
        value={editor.fields.labels}
        onChange={(value) => editor.onFieldChange('labels', value)}
      />
      <TextField
        label={t(locale, 'workspace.lexicon.edit.pronunciationLabel')}
        testId="lexicon-entry-pronunciation"
        value={editor.fields.pronunciation}
        onChange={(value) => editor.onFieldChange('pronunciation', value)}
      />
      <TextField
        label={t(locale, 'workspace.lexicon.edit.inflectedFormLabel')}
        testId="lexicon-entry-inflected-forms"
        value={editor.fields.inflectedForms}
        onChange={(value) => editor.onFieldChange('inflectedForms', value)}
      />
      <TextField
        label={t(locale, 'workspace.lexicon.edit.etymonLabel')}
        testId="lexicon-entry-etymon"
        value={editor.fields.etymon}
        onChange={(value) => editor.onFieldChange('etymon', value)}
      />
      <TextField
        label={t(locale, 'workspace.lexicon.edit.noteLabel')}
        testId="lexicon-entry-note"
        value={editor.fields.note}
        onChange={(value) => editor.onFieldChange('note', value)}
      />
      <TextField
        label={t(locale, 'workspace.lexicon.edit.homographLinkLabel')}
        testId="lexicon-entry-homograph"
        value={editor.fields.homographEntryId}
        onChange={(value) => editor.onFieldChange('homographEntryId', value)}
      />
      {editor.fields.senses.map((sense, index) => {
        const depth = String(draftDepth(editor.fields.senses, index));
        return (
          <div
            key={sense.id || `sense-${index}`}
            className="lexicon-entry-edit-row"
            data-depth={depth}
            data-testid={`lexicon-entry-sense-${index}`}
          >
            <TextField
              label={t(locale, 'workspace.lexicon.edit.indicatorLabel')}
              testId={`lexicon-entry-sense-${index}-indicator`}
              value={sense.indicator}
              onChange={(value) => editor.onSenseChange(index, 'indicator', value)}
            />
            <TextField
              label={t(locale, 'workspace.lexicon.edit.translationLabel')}
              testId={
                index === 0
                  ? 'lexicon-entry-translation'
                  : `lexicon-entry-sense-${index}-translation`
              }
              value={sense.translation}
              onChange={(value) => editor.onSenseChange(index, 'translation', value)}
            />
            <TextField
              label={t(locale, 'workspace.lexicon.edit.explanationLabel')}
              testId={`lexicon-entry-sense-${index}-explanation`}
              value={sense.explanation}
              onChange={(value) => editor.onSenseChange(index, 'explanation', value)}
            />
            <TextField
              label={t(locale, 'workspace.lexicon.edit.definitionLabel')}
              testId={`lexicon-entry-sense-${index}-definition`}
              value={sense.definition}
              onChange={(value) => editor.onSenseChange(index, 'definition', value)}
            />
            <TextField
              label={t(locale, 'workspace.lexicon.edit.exampleLabel')}
              testId={`lexicon-entry-sense-${index}-example`}
              value={sense.example}
              onChange={(value) => editor.onSenseChange(index, 'example', value)}
            />
            <TextField
              label={t(locale, 'workspace.lexicon.edit.exampleTranslationLabel')}
              testId={`lexicon-entry-sense-${index}-example-translation`}
              value={sense.exampleTranslation}
              onChange={(value) => editor.onSenseChange(index, 'exampleTranslation', value)}
            />
            <TextField
              label={t(locale, 'workspace.lexicon.edit.exampleSegmentLabel')}
              testId={`lexicon-entry-sense-${index}-example-segment`}
              value={sense.exampleSegmentId}
              onChange={(value) => editor.onSenseChange(index, 'exampleSegmentId', value)}
            />
            <TextField
              label={t(locale, 'workspace.lexicon.edit.senseNoteLabel')}
              testId={`lexicon-entry-sense-${index}-note`}
              value={sense.note}
              onChange={(value) => editor.onSenseChange(index, 'note', value)}
            />
            <div className="lexicon-entry-edit-actions">
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
                onClick={() => editor.onMoveSense(index, -1)}
              >
                {t(locale, 'workspace.lexicon.edit.moveSenseUp')}
              </button>
              <button
                type="button"
                className="btn"
                data-testid={`lexicon-entry-move-sense-down-${index}`}
                onClick={() => editor.onMoveSense(index, 1)}
              >
                {t(locale, 'workspace.lexicon.edit.moveSenseDown')}
              </button>
              <button
                type="button"
                className="btn"
                data-testid={`lexicon-entry-remove-sense-${index}`}
                onClick={() => editor.onRemoveSense(index)}
              >
                {t(locale, 'workspace.lexicon.edit.removeSense')}
              </button>
            </div>
          </div>
        );
      })}
      <button
        type="button"
        className="btn"
        data-testid="lexicon-entry-add-sense"
        onClick={editor.onAddSense}
      >
        {t(locale, 'workspace.lexicon.edit.addSense')}
      </button>
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
