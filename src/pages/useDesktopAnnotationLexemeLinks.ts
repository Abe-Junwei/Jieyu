import { useEffect, useRef, useState } from 'react';
import { createDesktopClient } from '../app/desktopProjectReadPageAccess';
import type { DesktopReadHost } from '../desktop/projectReadHost';
import { t, useLocale } from '../i18n';

export interface AnnotationTokenLink {
  tokenId: string;
  lexemeId: string;
  senseId: string;
  headword: string | null;
}

export interface AnnotationSenseChoice {
  id: string;
  label: string;
}

export function useDesktopAnnotationLexemeLinks(
  host: DesktopReadHost | null,
  sessionId: string | null,
  unitId: string | null,
) {
  const locale = useLocale();
  const [links, setLinks] = useState<AnnotationTokenLink[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [choices, setChoices] = useState<{
    tokenId: string;
    lexemeId: string;
    senses: AnnotationSenseChoice[];
  } | null>(null);
  const [error, setError] = useState('');
  const request = useRef(0);

  useEffect(() => {
    if (host === null || sessionId === null || unitId === null) {
      setLinks([]);
      setChoices(null);
      return;
    }
    const id = ++request.current;
    let cancelled = false;
    void createDesktopClient({ desktopCall: host.desktopCall })
      .listTokenLinks(sessionId, unitId)
      .then((next) => {
        if (!cancelled && id === request.current) setLinks(next);
      })
      .catch(() => {
        if (!cancelled && id === request.current) setError(t(locale, 'app.desktopRead.loadFailed'));
      });
    return () => {
      cancelled = true;
    };
  }, [host, locale, sessionId, unitId]);

  const reload = (session: string, unit: string, id: number) => {
    if (host === null) return;
    void createDesktopClient({ desktopCall: host.desktopCall })
      .listTokenLinks(session, unit)
      .then((next) => {
        if (id === request.current) setLinks(next);
      })
      .catch(() => {
        if (id === request.current) setError(t(locale, 'app.desktopRead.loadFailed'));
      });
  };

  const fail = (caught: unknown) => {
    const message = caught instanceof Error ? caught.message : '';
    if (message === 'lexeme link has no match' || message === 'lexeme link is ambiguous') {
      setError(t(locale, 'workspace.annotation.lexemeLinkMiss'));
      return;
    }
    if (message === 'lexeme has no sense') {
      setError(t(locale, 'workspace.annotation.lexemeLinkNoSense'));
      return;
    }
    setError(t(locale, 'app.desktopRead.loadFailed'));
  };

  const submit = (tokenId: string) => {
    if (host === null || sessionId === null || unitId === null) return;
    const query = drafts[tokenId] ?? '';
    if (query.trim().length === 0) {
      setError(t(locale, 'workspace.annotation.lexemeLinkMiss'));
      return;
    }
    setError('');
    const id = ++request.current;
    const client = createDesktopClient({ desktopCall: host.desktopCall });
    void client
      .matchLexemeLink(sessionId, query)
      .then((hit) => {
        if (id !== request.current) return;
        if (hit.senses.length > 1) {
          setChoices({ tokenId, lexemeId: hit.id, senses: hit.senses });
          return;
        }
        const sense = hit.senses[0];
        if (sense === undefined) {
          setError(t(locale, 'workspace.annotation.lexemeLinkNoSense'));
          return;
        }
        setChoices(null);
        return client
          .replaceTokenLink(sessionId, { tokenId, lexemeId: hit.id, senseId: sense.id })
          .then(() => {
            reload(sessionId, unitId, id);
          });
      })
      .catch((caught: unknown) => {
        if (id === request.current) fail(caught);
      });
  };

  const choose = (tokenId: string, senseId: string) => {
    if (host === null || sessionId === null || unitId === null || choices?.tokenId !== tokenId) {
      return;
    }
    setError('');
    const id = ++request.current;
    void createDesktopClient({ desktopCall: host.desktopCall })
      .replaceTokenLink(sessionId, { tokenId, lexemeId: choices.lexemeId, senseId })
      .then(() => {
        if (id !== request.current) return;
        setChoices(null);
        reload(sessionId, unitId, id);
      })
      .catch((caught: unknown) => {
        if (id === request.current) fail(caught);
      });
  };

  const clear = (tokenId: string) => {
    if (host === null || sessionId === null || unitId === null) return;
    setError('');
    const id = ++request.current;
    void createDesktopClient({ desktopCall: host.desktopCall })
      .clearTokenLink(sessionId, tokenId)
      .then(() => {
        if (id !== request.current) return;
        setChoices(null);
        reload(sessionId, unitId, id);
      })
      .catch((caught: unknown) => {
        if (id === request.current) fail(caught);
      });
  };

  return { links, drafts, setDrafts, choices, error, submit, choose, clear };
}
