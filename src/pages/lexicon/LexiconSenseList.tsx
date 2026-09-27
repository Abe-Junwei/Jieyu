import { t, useLocale } from '../../i18n';
import type { LexemeDocType, MultiLangString } from '../../types/jieyuDbDocTypes';
import { readSenseId, senseDepth } from '../../utils/lexemeSenseTree';

function formatMultilang(record: MultiLangString | undefined): string {
  if (!record) return '';
  return Object.values(record)
    .map((value) => value.trim())
    .filter(Boolean)
    .join(' / ');
}

export function LexiconSenseList({
  lexemeId,
  senses,
}: {
  lexemeId: string;
  senses: LexemeDocType['senses'];
}) {
  const locale = useLocale();
  return (
    <ol className="lexicon-workspace-sense-list">
      {senses.map((sense, index) => (
        <li
          key={readSenseId(sense) || `${lexemeId}-sense-${index}`}
          className="lexicon-workspace-sense-item"
          data-depth={senseDepth(senses, readSenseId(sense))}
          data-testid={`lexicon-workspace-sense-${index}`}
        >
          <strong>{formatMultilang(sense.gloss) || t(locale, 'workspace.lexicon.notSet')}</strong>
          {formatMultilang(sense.definition) ? <p>{formatMultilang(sense.definition)}</p> : null}
          {sense.category ? (
            <span data-testid={`lexicon-workspace-sense-${index}-category`}>{sense.category}</span>
          ) : null}
          {sense.scientificName ? (
            <span data-testid={`lexicon-workspace-sense-${index}-scientific-name`}>
              {sense.scientificName}
            </span>
          ) : null}
          {sense.anthropologyNote ? (
            <span data-testid={`lexicon-workspace-sense-${index}-anthropology-note`}>
              {sense.anthropologyNote}
            </span>
          ) : null}
          {sense.discourseNote ? (
            <span data-testid={`lexicon-workspace-sense-${index}-discourse-note`}>
              {sense.discourseNote}
            </span>
          ) : null}
          {sense.encyclopedicNote ? (
            <span data-testid={`lexicon-workspace-sense-${index}-encyclopedic-note`}>
              {sense.encyclopedicNote}
            </span>
          ) : null}
          {sense.grammarNote ? (
            <span data-testid={`lexicon-workspace-sense-${index}-grammar-note`}>
              {sense.grammarNote}
            </span>
          ) : null}
          {(sense.semanticDomains?.length ?? 0) > 0 ? (
            <span data-testid={`lexicon-workspace-sense-${index}-semantic-domains`}>
              {sense.semanticDomains?.join(' · ')}
            </span>
          ) : null}
          {sense.phonologyNote ? (
            <span data-testid={`lexicon-workspace-sense-${index}-phonology-note`}>
              {sense.phonologyNote}
            </span>
          ) : null}
          {sense.semanticsNote ? (
            <span data-testid={`lexicon-workspace-sense-${index}-semantics-note`}>
              {sense.semanticsNote}
            </span>
          ) : null}
          {sense.sociolinguisticsNote ? (
            <span data-testid={`lexicon-workspace-sense-${index}-sociolinguistics-note`}>
              {sense.sociolinguisticsNote}
            </span>
          ) : null}
          {sense.sourceNote ? (
            <span data-testid={`lexicon-workspace-sense-${index}-source-note`}>
              {sense.sourceNote}
            </span>
          ) : null}
          {(sense.usages?.length ?? 0) > 0 ? (
            <span data-testid={`lexicon-workspace-sense-${index}-usages`}>
              {sense.usages?.join(' · ')}
            </span>
          ) : null}
          {sense.senseType ? (
            <span data-testid={`lexicon-workspace-sense-${index}-sense-type`}>
              {sense.senseType}
            </span>
          ) : null}
          {(sense.academicDomains?.length ?? 0) > 0 ? (
            <span data-testid={`lexicon-workspace-sense-${index}-academic-domains`}>
              {sense.academicDomains?.join(' · ')}
            </span>
          ) : null}
          {(sense.examples ?? []).map((example, exampleIndex) => (
            <span
              key={`${readSenseId(sense)}-example-${exampleIndex}`}
              data-testid={`lexicon-workspace-sense-${index}-example-${exampleIndex}`}
            >
              {example.translation ? `${example.source} / ${example.translation}` : example.source}
            </span>
          ))}
        </li>
      ))}
    </ol>
  );
}
