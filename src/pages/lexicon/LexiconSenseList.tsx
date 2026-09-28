import type { DmlexRelation, DmlexSense, JieyuLexemeExtras } from '../../db/dmlexTypes';
import { t, useLocale } from '../../i18n';
import { senseTreeDepth } from '../../utils/dmlexEntry';

export function LexiconSenseList({
  senses,
  extras,
  relations,
}: {
  senses: readonly DmlexSense[];
  extras?: JieyuLexemeExtras;
  relations?: readonly DmlexRelation[];
}) {
  const locale = useLocale();
  const notSet = t(locale, 'workspace.lexicon.notSet');
  return (
    <ol className="lexicon-workspace-sense-list">
      {senses.map((sense, index) => {
        const id = sense.id ?? '';
        const depth = id.length > 0 ? senseTreeDepth(id, relations ?? []) : 0;
        const translation = sense.headwordTranslations?.[0]?.text ?? '';
        const explanation = sense.headwordExplanations?.[0]?.text ?? '';
        const definition = sense.definitions?.[0]?.text ?? '';
        const example = sense.examples?.[0];
        const note = extras?.notes?.find((row) => row.owner === 'sense' && row.ref === id)?.text;
        return (
          <li
            key={id || `sense-${index}`}
            className="lexicon-workspace-sense-item"
            data-depth={String(depth)}
            data-testid={`lexicon-workspace-sense-${index}`}
          >
            <p data-testid={`lexicon-workspace-sense-${index}-translation`}>
              {translation || notSet}
            </p>
            {definition.length > 0 ? <p>{definition}</p> : null}
            {explanation.length > 0 ? <p>{explanation}</p> : null}
            {example ? (
              <p data-testid={`lexicon-workspace-sense-${index}-example`}>
                {example.text}
                {example.exampleTranslations?.[0]?.text
                  ? ` — ${example.exampleTranslations[0].text}`
                  : ''}
              </p>
            ) : null}
            {note ? <p data-testid={`lexicon-workspace-sense-${index}-note`}>{note}</p> : null}
          </li>
        );
      })}
    </ol>
  );
}
