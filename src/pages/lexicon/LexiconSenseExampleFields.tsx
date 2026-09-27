import { t, type Locale } from '../../i18n';
import type { LexiconExampleDraft } from './saveLexiconEntry';

export function LexiconSenseExampleFields({
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
