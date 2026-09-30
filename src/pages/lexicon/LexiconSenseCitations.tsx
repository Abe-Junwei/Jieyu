import { useQuery } from '@tanstack/react-query';
import { t, useLocale } from '../../i18n';
import type { OccurrenceCitation } from '../annotation/annotationOccurrenceCitation';
import { loadOccurrenceCitationDisplays } from './loadOccurrenceCitationDisplays';

export function LexiconSenseCitations({
  senseId,
  citations,
  onDelete,
}: {
  senseId: string;
  citations: readonly OccurrenceCitation[];
  onDelete: (tokenId: string) => void;
}) {
  const locale = useLocale();
  const mine = citations.filter((citation) => citation.senseId === senseId);
  const query = useQuery({
    queryKey: ['occurrence-citation-display', senseId, mine],
    enabled: mine.length > 0,
    queryFn: () => loadOccurrenceCitationDisplays(mine),
  });
  if (mine.length === 0) return null;
  const rows =
    query.data ??
    mine.map((citation) => ({
      ...citation,
      surface: '',
      translation: '',
      status: 'live' as const,
    }));
  return (
    <ul className="lexicon-workspace-citation-list">
      {rows.map((row) => (
        <li key={row.tokenId} data-testid={`lexicon-occurrence-${row.tokenId}`}>
          <span>{row.surface.length > 0 ? row.surface : row.unitId}</span>
          {row.translation.length > 0 ? <span>{` — ${row.translation}`}</span> : null}
          {row.status === 'broken' ? (
            <span data-testid={`lexicon-occurrence-${row.tokenId}-broken`}>
              {t(locale, 'workspace.lexicon.occurrenceCitationBroken')}
            </span>
          ) : null}
          <button type="button" onClick={() => onDelete(row.tokenId)}>
            {t(locale, 'workspace.lexicon.occurrenceCitationDelete')}
          </button>
        </li>
      ))}
    </ul>
  );
}
