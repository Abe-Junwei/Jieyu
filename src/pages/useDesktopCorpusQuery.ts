import { useState } from 'react';
import { createDesktopClient } from '../app/desktopProjectReadPageAccess';
import type { CorpusQueryCursor, CorpusQueryItem } from '../db/desktop/corpusQuery';
import type { DesktopReadHost } from '../desktop/projectReadHost';
import { t, useLocale } from '../i18n';

const PAGE = 20;

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
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');

  const run = (nextCursor: CorpusQueryCursor | null) => {
    const lexeme = lexemeId.trim();
    const sense = senseId.trim();
    if ((lexeme.length === 0) !== (sense.length === 0)) {
      setError(t(locale, 'app.desktopRead.querySensePair'));
      return;
    }
    setError('');
    const filters = {
      ...(text.trim().length > 0 ? { text: text.trim() } : {}),
      ...(form.trim().length > 0 ? { form: form.trim() } : {}),
      ...(gloss.trim().length > 0 ? { gloss: gloss.trim() } : {}),
      ...(pos.trim().length > 0 ? { pos: pos.trim() } : {}),
      ...(lexeme.length > 0 ? { lexemeId: lexeme, senseId: sense } : {}),
    };
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
        if (last === undefined) return;
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
    search: () => run(null),
    more: () => {
      if (cursor !== null) run(cursor);
    },
  };
}
