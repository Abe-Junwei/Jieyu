import type { CorpusQueryHit, CorpusTextSpan } from '../app/desktopProjectReadPageAccess';
import type { DesktopReadHost } from '../desktop/projectReadHost';
import { t, tf, useLocale } from '../i18n';
import { useDesktopCorpusQuery } from './useDesktopCorpusQuery';

export function DesktopCorpusQueryPanel(props: {
  host: DesktopReadHost;
  sessionId: string;
  onLocate: (manuscriptId: string, layerId: string, unitId: string) => void;
}) {
  const locale = useLocale();
  const query = useDesktopCorpusQuery(props.host, props.sessionId);
  return (
    <div className="desktop-project-read-query">
      <input
        aria-label={t(locale, 'app.desktopRead.queryText')}
        value={query.text}
        onChange={(event) => query.setText(event.currentTarget.value)}
      />
      <input
        aria-label={t(locale, 'app.desktopRead.queryForm')}
        value={query.form}
        onChange={(event) => query.setForm(event.currentTarget.value)}
      />
      <input
        aria-label={t(locale, 'app.desktopRead.queryGloss')}
        value={query.gloss}
        onChange={(event) => query.setGloss(event.currentTarget.value)}
      />
      <input
        aria-label={t(locale, 'app.desktopRead.queryPos')}
        value={query.pos}
        onChange={(event) => query.setPos(event.currentTarget.value)}
      />
      <input
        aria-label={t(locale, 'app.desktopRead.queryLexeme')}
        value={query.lexemeId}
        onChange={(event) => query.setLexemeId(event.currentTarget.value)}
      />
      <input
        aria-label={t(locale, 'app.desktopRead.querySense')}
        value={query.senseId}
        onChange={(event) => query.setSenseId(event.currentTarget.value)}
      />
      <button type="button" onClick={query.search}>
        {t(locale, 'app.desktopRead.querySearch')}
      </button>
      {query.error.length > 0 ? <p role="alert">{query.error}</p> : null}
      {query.searched && query.items.length === 0 && query.error.length === 0 ? (
        <p>{t(locale, 'app.desktopRead.queryEmpty')}</p>
      ) : null}
      <div className="desktop-project-read-units">
        {query.items.map((item) => (
          <div key={item.unitId}>
            <button
              type="button"
              onClick={() => props.onLocate(item.manuscriptId, item.layerId, item.unitId)}
            >
              <LocatedText
                label={tf(locale, 'app.desktopRead.queryLocate', {
                  time: `${item.startTime.toFixed(1)}–${item.endTime.toFixed(1)}`,
                  text: '\u0000',
                })}
                text={item.text}
                spans={item.textSpans}
              />
            </button>
            {item.hits.map((hit) => (
              <span key={`${hit.kind}:${hit.id}`}>{hitLabel(hit)}</span>
            ))}
          </div>
        ))}
      </div>
      {query.hasMore ? (
        <button type="button" onClick={query.more}>
          {t(locale, 'app.desktopRead.queryMore')}
        </button>
      ) : null}
    </div>
  );
}

function LocatedText(props: { label: string; text: string; spans: readonly CorpusTextSpan[] }) {
  const [before, after] = props.label.split('\u0000');
  return (
    <>
      {before}
      <Highlighted text={props.text} spans={props.spans} />
      {after}
    </>
  );
}

function Highlighted(props: { text: string; spans: readonly CorpusTextSpan[] }) {
  if (props.spans.length === 0) return props.text;
  const parts: (string | { start: number; end: number })[] = [];
  let cursor = 0;
  for (const span of props.spans) {
    if (span.start > cursor) parts.push(props.text.slice(cursor, span.start));
    parts.push(span);
    cursor = span.end;
  }
  if (cursor < props.text.length) parts.push(props.text.slice(cursor));
  return parts.map((part) =>
    typeof part === 'string' ? (
      part
    ) : (
      <mark key={part.start}>{props.text.slice(part.start, part.end)}</mark>
    ),
  );
}

function hitLabel(hit: CorpusQueryHit): string {
  const form = hit.form.default ?? Object.values(hit.form)[0] ?? '';
  const gloss = Object.values(hit.gloss).join(' ');
  const sense =
    hit.lexemeId !== undefined && hit.senseId !== undefined ? `${hit.lexemeId}/${hit.senseId}` : '';
  return [form, gloss, hit.pos ?? '', sense].filter((part) => part.length > 0).join(' ');
}
