import { useEffect, useRef, useState } from 'react';
import { createDesktopClient } from '../app/desktopProjectReadPageAccess';
import { readOpenProjectSession } from '../desktop/openProjectSession';
import type { DesktopReadHost } from '../desktop/projectReadHost';
import { t, useLocale } from '../i18n';
import {
  applyDesktopLexemeDraft,
  readDesktopLexemeDraft,
  type DesktopLexemeListItem,
} from './lexicon/desktopLexemeDraft';

export function useDesktopLexiconController(host: DesktopReadHost) {
  const locale = useLocale();
  const [sessionId] = useState(readOpenProjectSession);
  const [entries, setEntries] = useState<DesktopLexemeListItem[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [creating, setCreating] = useState(false);
  const [headword, setHeadword] = useState('');
  const [translation, setTranslation] = useState('');
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [ready, setReady] = useState(false);
  const stored = useRef<Record<string, unknown> | null>(null);
  /** Entry id that `stored` / draft fields currently belong to (#430). */
  const loadedId = useRef<string | null>(null);
  const loadSeq = useRef(0);

  useEffect(() => {
    if (sessionId === null) return;
    let cancelled = false;
    void createDesktopClient({ desktopCall: host.desktopCall })
      .listLinkCandidates(sessionId)
      .then((next) => {
        if (!cancelled) setEntries(next);
      })
      .catch(() => {
        if (!cancelled) setError(t(locale, 'app.desktopRead.loadFailed'));
      });
    return () => {
      cancelled = true;
    };
  }, [host, locale, revision, sessionId]);

  const select = (id: string) => {
    if (sessionId === null) return;
    setError('');
    setCreating(false);
    setSelectedId(id);
    // Drop the previous entry immediately so Save cannot retarget it (#430).
    stored.current = null;
    loadedId.current = null;
    setReady(false);
    setHeadword('');
    setTranslation('');
    const seq = ++loadSeq.current;
    void createDesktopClient({ desktopCall: host.desktopCall })
      .getLexemeEntry(sessionId, id)
      .then((entry) => {
        if (seq !== loadSeq.current) return;
        if (entry === null) {
          setError(t(locale, 'app.desktopRead.loadFailed'));
          return;
        }
        stored.current = entry.entry;
        loadedId.current = id;
        const draft = readDesktopLexemeDraft(entry.entry);
        setHeadword(draft.headword);
        setTranslation(draft.translation);
        setReady(true);
      })
      .catch(() => {
        if (seq !== loadSeq.current) return;
        setError(t(locale, 'app.desktopRead.loadFailed'));
      });
  };

  const beginCreate = () => {
    setError('');
    setCreating(true);
    setSelectedId('');
    stored.current = null;
    loadedId.current = null;
    loadSeq.current += 1;
    setReady(true);
    setHeadword('');
    setTranslation('');
  };

  const save = () => {
    if (sessionId === null) return;
    if (headword.trim().length === 0 || translation.trim().length === 0) {
      setError(t(locale, 'workspace.annotation.lexemeCreateEmpty'));
      return;
    }
    setError('');
    const client = createDesktopClient({ desktopCall: host.desktopCall });
    const write = creating
      ? client.saveLexemeEntry(sessionId, {
          entry: {
            headword: headword.trim(),
            senses: [{ headwordTranslations: [{ text: translation.trim() }] }],
          },
        })
      : stored.current === null || loadedId.current === null || loadedId.current !== selectedId
        ? Promise.reject(new Error('lexeme is missing'))
        : client.saveLexemeEntry(sessionId, {
            id: loadedId.current,
            entry: applyDesktopLexemeDraft(stored.current, headword, translation),
          });
    void write
      .then((saved) => {
        stored.current = saved.entry;
        loadedId.current = saved.id;
        const draft = readDesktopLexemeDraft(saved.entry);
        setCreating(false);
        setSelectedId(saved.id);
        setHeadword(draft.headword);
        setTranslation(draft.translation);
        setReady(true);
        setRevision((current) => current + 1);
      })
      .catch((caught: unknown) => {
        const message = caught instanceof Error ? caught.message : '';
        setError(
          message === 'lexeme create is empty'
            ? t(locale, 'workspace.annotation.lexemeCreateEmpty')
            : t(locale, 'workspace.lexicon.edit.saveFailed'),
        );
      });
  };

  return {
    sessionId,
    entries,
    selectedId,
    creating,
    headword,
    translation,
    error,
    ready,
    setHeadword,
    setTranslation,
    select,
    beginCreate,
    save,
  };
}
