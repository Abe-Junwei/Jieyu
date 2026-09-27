import { t, type Locale } from '../../i18n';
import {
  canDemoteSense,
  moveSenseSiblingBlock,
  promoteSense,
  senseDepth,
} from '../../utils/lexemeSenseTree';
import type { LexiconEntryEditController } from '../useLexiconEntryEditController';
import { LexiconSenseExampleFields } from './LexiconSenseExampleFields';

export function LexiconExtraSenseEditor({
  editor,
  locale,
}: {
  editor: LexiconEntryEditController;
  locale: Locale;
}) {
  return (
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
              onChange={(event) => editor.onExtraSenseChange(index, 'category', event.target.value)}
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
            <span>{t(locale, 'workspace.lexicon.edit.senseSemanticDomainsLabel')}</span>
            <textarea
              className="input lexicon-entry-edit-input"
              data-testid={`lexicon-entry-extra-sense-${index}-semantic-domains`}
              rows={3}
              placeholder={t(locale, 'workspace.lexicon.edit.semanticDomainsHint')}
              value={sense.semanticDomains ?? ''}
              onChange={(event) =>
                editor.onExtraSenseChange(index, 'semanticDomains', event.target.value)
              }
            />
          </label>
          <label className="lexicon-entry-edit-field">
            <span>{t(locale, 'workspace.lexicon.edit.sensePhonologyNoteLabel')}</span>
            <input
              className="input lexicon-entry-edit-input"
              data-testid={`lexicon-entry-extra-sense-${index}-phonology-note`}
              value={sense.phonologyNote ?? ''}
              onChange={(event) =>
                editor.onExtraSenseChange(index, 'phonologyNote', event.target.value)
              }
            />
          </label>
          <label className="lexicon-entry-edit-field">
            <span>{t(locale, 'workspace.lexicon.edit.senseSemanticsNoteLabel')}</span>
            <input
              className="input lexicon-entry-edit-input"
              data-testid={`lexicon-entry-extra-sense-${index}-semantics-note`}
              value={sense.semanticsNote ?? ''}
              onChange={(event) =>
                editor.onExtraSenseChange(index, 'semanticsNote', event.target.value)
              }
            />
          </label>
          <label className="lexicon-entry-edit-field">
            <span>{t(locale, 'workspace.lexicon.edit.senseSociolinguisticsNoteLabel')}</span>
            <input
              className="input lexicon-entry-edit-input"
              data-testid={`lexicon-entry-extra-sense-${index}-sociolinguistics-note`}
              value={sense.sociolinguisticsNote ?? ''}
              onChange={(event) =>
                editor.onExtraSenseChange(index, 'sociolinguisticsNote', event.target.value)
              }
            />
          </label>
          <label className="lexicon-entry-edit-field">
            <span>{t(locale, 'workspace.lexicon.edit.senseSourceNoteLabel')}</span>
            <input
              className="input lexicon-entry-edit-input"
              data-testid={`lexicon-entry-extra-sense-${index}-source-note`}
              value={sense.sourceNote ?? ''}
              onChange={(event) =>
                editor.onExtraSenseChange(index, 'sourceNote', event.target.value)
              }
            />
          </label>
          <label className="lexicon-entry-edit-field">
            <span>{t(locale, 'workspace.lexicon.edit.senseUsagesLabel')}</span>
            <textarea
              className="input lexicon-entry-edit-input"
              data-testid={`lexicon-entry-extra-sense-${index}-usages`}
              rows={3}
              placeholder={t(locale, 'workspace.lexicon.edit.usagesHint')}
              value={sense.usages ?? ''}
              onChange={(event) => editor.onExtraSenseChange(index, 'usages', event.target.value)}
            />
          </label>
          <label className="lexicon-entry-edit-field">
            <span>{t(locale, 'workspace.lexicon.edit.senseSenseTypeLabel')}</span>
            <input
              className="input lexicon-entry-edit-input"
              data-testid={`lexicon-entry-extra-sense-${index}-sense-type`}
              value={sense.senseType ?? ''}
              onChange={(event) =>
                editor.onExtraSenseChange(index, 'senseType', event.target.value)
              }
            />
          </label>
          <label className="lexicon-entry-edit-field">
            <span>{t(locale, 'workspace.lexicon.edit.senseAcademicDomainsLabel')}</span>
            <textarea
              className="input lexicon-entry-edit-input"
              data-testid={`lexicon-entry-extra-sense-${index}-academic-domains`}
              rows={3}
              placeholder={t(locale, 'workspace.lexicon.edit.academicDomainsHint')}
              value={sense.academicDomains ?? ''}
              onChange={(event) =>
                editor.onExtraSenseChange(index, 'academicDomains', event.target.value)
              }
            />
          </label>
          <label className="lexicon-entry-edit-field">
            <span>{t(locale, 'workspace.lexicon.edit.senseAnthropologyCategoriesLabel')}</span>
            <textarea
              className="input lexicon-entry-edit-input"
              data-testid={`lexicon-entry-extra-sense-${index}-anthropology-categories`}
              rows={3}
              placeholder={t(locale, 'workspace.lexicon.edit.anthropologyCategoriesHint')}
              value={sense.anthropologyCategories ?? ''}
              onChange={(event) =>
                editor.onExtraSenseChange(index, 'anthropologyCategories', event.target.value)
              }
            />
          </label>
          <label className="lexicon-entry-edit-field">
            <span>{t(locale, 'workspace.lexicon.edit.senseSenseStatusLabel')}</span>
            <input
              className="input lexicon-entry-edit-input"
              data-testid={`lexicon-entry-extra-sense-${index}-sense-status`}
              value={sense.senseStatus ?? ''}
              onChange={(event) =>
                editor.onExtraSenseChange(index, 'senseStatus', event.target.value)
              }
            />
          </label>
          <label className="lexicon-entry-edit-field">
            <span>{t(locale, 'workspace.lexicon.edit.senseDialectLabelsLabel')}</span>
            <textarea
              className="input lexicon-entry-edit-input"
              data-testid={`lexicon-entry-extra-sense-${index}-dialect-labels`}
              rows={3}
              placeholder={t(locale, 'workspace.lexicon.edit.dialectLabelsHint')}
              value={sense.dialectLabels ?? ''}
              onChange={(event) =>
                editor.onExtraSenseChange(index, 'dialectLabels', event.target.value)
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
          <LexiconSenseExampleFields
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
              promoteSense(editor.fields.extraSenses, index, editor.fields.primarySenseId ?? '') ===
              editor.fields.extraSenses
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
              !canDemoteSense(editor.fields.extraSenses, index, editor.fields.primarySenseId ?? '')
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
  );
}
