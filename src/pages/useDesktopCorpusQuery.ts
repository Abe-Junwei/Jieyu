import { useState } from 'react';
import {
  createDesktopClient,
  type CorpusQueryCursor,
  type CorpusQueryItem,
} from '../app/desktopProjectReadPageAccess';
import type { DesktopReadHost } from '../desktop/projectReadHost';
import { t, useLocale } from '../i18n';

const PAGE = 20;

type CorpusFilters = {
  text?: string;
  form?: string;
  gloss?: string;
  pos?: string;
  lexemeId?: string;
  senseId?: string;
};

function draftFilters(input: {
  text: string;
  form: string;
  gloss: string;
  pos: string;
  lexemeId: string;
  senseId: string;
}): CorpusFilters | { error: string } {
  const lexeme = input.lexemeId.trim();
  const sense = input.senseId.trim();
  if ((lexeme.length === 0) !== (sense.length === 0)) {
    return { error: 'pair' };
  }
  return {
    ...(input.text.trim().length > 0 ? { text: input.text.trim() } : {}),
    ...(input.form.trim().length > 0 ? { form: input.form.trim() } : {}),
    ...(input.gloss.trim().length > 0 ? { gloss: input.gloss.trim() } : {}),
    ...(input.pos.trim().length > 0 ? { pos: input.pos.trim() } : {}),
    ...(lexeme.length > 0 ? { lexemeId: lexeme, senseId: sense } : {}),
  };
}

export function useDesktopCorpusQuery(host: DesktopReadHost, sessionId: string) {
  const locale = useLocale();
  const [text, setText] = useState('');
  const [form, setForm] = useState('');
  const [gloss, setGloss] = useState('');
  const [pos, setPos] = useState('');
  const [lexemeId, setLexemeId] = useState('');
  const [senseId, setSenseId] = useState('');
  const [items, setItems] = useState<CorpusQueryItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<CorpusQueryCursor | null>(null);
  const [committed, setCommitted] = useState<CorpusFilters | null>(null);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');

  const run = (filters: CorpusFilters, nextCursor: CorpusQueryCursor | null) => {
    setError('');
    void createDesktopClient({ desktopCall: host.desktopCall })
      .queryCorpus(sessionId, {
        ...filters,
        limit: PAGE,
        ...(nextCursor === null ? {} : { cursor: nextCursor }),
      })
      .then((page) => {
        setSearched(true);
        setItems((current) => (nextCursor === null ? page.items : [...current, ...page.items]));
        setHasMore(page.hasMore);
        const last = page.items[page.items.length - 1];
        if (last === undefined) {
          if (nextCursor === null) setCursor(null);
          return;
        }
        setCursor({
          manuscriptId: last.manuscriptId,
          layerId: last.layerId,
          startTime: last.startTime,
          unitId: last.unitId,
        });
      })
      .catch(() => {
        setError(t(locale, 'app.desktopRead.queryFailed'));
      });
  };

  return {
    text,
    setText,
    form,
    setForm,
    gloss,
    setGloss,
    pos,
    setPos,
    lexemeId,
    setLexemeId,
    senseId,
    setSenseId,
    items,
    hasMore,
    searched,
    error,
    search: () => {
      const next = draftFilters({ text, form, gloss, pos, lexemeId, senseId });
      if ('error' in next) {
        setError(t(locale, 'app.desktopRead.querySensePair'));
        return;
      }
      setCommitted(next);
      setCursor(null);
      run(next, null);
    },
    more: () => {
      // Load-more must reuse the filters from the last search, not the draft (#406).
      if (committed === null || cursor === null) return;
      run(committed, cursor);
    },
  };
}
