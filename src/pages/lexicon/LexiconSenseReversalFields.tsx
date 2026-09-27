import { t, type Locale } from '../../i18n';
import type { SenseReversal, SenseReversalNode } from '../../types/jieyuDbDocTypes';
import {
  reversalDraftsWithAdded,
  reversalDraftsWithAddedMain,
  reversalDraftsWithField,
  reversalDraftsWithMainText,
  reversalDraftsWithout,
  reversalDraftsWithoutMain,
} from '../../utils/senseReversals';

function ReversalMainFields({
  node,
  depth,
  idPrefix,
  locale,
  onText,
  onRemove,
}: {
  node: SenseReversalNode;
  depth: number;
  idPrefix: string;
  locale: Locale;
  onText: (depth: number, value: string) => void;
  onRemove: (depth: number) => void;
}) {
  return (
    <div className="lexicon-entry-edit-reversal-main">
      <label className="lexicon-entry-edit-field">
        <span>{t(locale, 'workspace.lexicon.edit.reversalMainLabel')}</span>
        <input
          className="input lexicon-entry-edit-input"
          data-testid={`${idPrefix}-main-${depth}`}
          value={node.text}
          onChange={(event) => onText(depth, event.target.value)}
        />
      </label>
      <button
        type="button"
        className="btn"
        data-testid={`${idPrefix}-remove-main-${depth}`}
        onClick={() => onRemove(depth)}
      >
        {t(locale, 'workspace.lexicon.edit.removeReversalMain')}
      </button>
      {node.main ? (
        <ReversalMainFields
          node={node.main}
          depth={depth + 1}
          idPrefix={idPrefix}
          locale={locale}
          onText={onText}
          onRemove={onRemove}
        />
      ) : null}
    </div>
  );
}

export function LexiconSenseReversalFields({
  locale,
  reversals,
  idPrefix,
  labelKey,
  onChange,
}: {
  locale: Locale;
  reversals: SenseReversal[];
  idPrefix: string;
  labelKey: 'workspace.lexicon.edit.reversalsLabel' | 'workspace.lexicon.edit.senseReversalsLabel';
  onChange: (reversals: SenseReversal[]) => void;
}) {
  return (
    <div className="lexicon-entry-edit-field">
      <span>{t(locale, labelKey)}</span>
      {reversals.map((reversal, index) => {
        const rowPrefix = `${idPrefix}-reversal-${index}`;
        return (
          <div key={rowPrefix} className="lexicon-entry-edit-field">
            <label className="lexicon-entry-edit-field">
              <span>{t(locale, 'workspace.lexicon.edit.reversalLangLabel')}</span>
              <input
                className="input lexicon-entry-edit-input"
                data-testid={`${rowPrefix}-lang`}
                value={reversal.lang}
                onChange={(event) =>
                  onChange(reversalDraftsWithField(reversals, index, 'lang', event.target.value))
                }
              />
            </label>
            <label className="lexicon-entry-edit-field">
              <span>{t(locale, 'workspace.lexicon.edit.reversalTextLabel')}</span>
              <input
                className="input lexicon-entry-edit-input"
                data-testid={`${rowPrefix}-text`}
                value={reversal.text}
                onChange={(event) =>
                  onChange(reversalDraftsWithField(reversals, index, 'text', event.target.value))
                }
              />
            </label>
            {reversal.main ? (
              <ReversalMainFields
                node={reversal.main}
                depth={0}
                idPrefix={rowPrefix}
                locale={locale}
                onText={(depth, value) =>
                  onChange(reversalDraftsWithMainText(reversals, index, depth, value))
                }
                onRemove={(depth) => onChange(reversalDraftsWithoutMain(reversals, index, depth))}
              />
            ) : null}
            <button
              type="button"
              className="btn"
              data-testid={`${rowPrefix}-add-main`}
              onClick={() => onChange(reversalDraftsWithAddedMain(reversals, index))}
            >
              {t(locale, 'workspace.lexicon.edit.addReversalMain')}
            </button>
            <button
              type="button"
              className="btn"
              data-testid={`${rowPrefix}-remove`}
              onClick={() => onChange(reversalDraftsWithout(reversals, index))}
            >
              {t(locale, 'workspace.lexicon.edit.removeReversal')}
            </button>
          </div>
        );
      })}
      <button
        type="button"
        className="btn"
        data-testid={`${idPrefix}-add-reversal`}
        onClick={() => onChange(reversalDraftsWithAdded(reversals))}
      >
        {t(locale, 'workspace.lexicon.edit.addReversal')}
      </button>
    </div>
  );
}
