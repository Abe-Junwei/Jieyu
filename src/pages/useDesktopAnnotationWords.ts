import { useEffect, useState } from 'react';
import { createDesktopClient } from '../app/desktopProjectReadPageAccess';
import type { DesktopReadHost } from '../desktop/projectReadHost';
import { t, useLocale } from '../i18n';

export interface AnnotationWord {
  id: string;
  form: string;
}

export function useDesktopAnnotationWords(
  host: DesktopReadHost | null,
  sessionId: string | null,
  unitId: string | null,
) {
  const locale = useLocale();
  const [words, setWords] = useState<AnnotationWord[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (host === null || sessionId === null || unitId === null) {
      setWords([]);
      return;
    }
    let cancelled = false;
    void createDesktopClient({ desktopCall: host.desktopCall })
      .listWords(sessionId, unitId)
      .then((next) => {
        if (!cancelled) setWords(next);
      })
      .catch(() => {
        if (!cancelled) setError(t(locale, 'app.desktopRead.loadFailed'));
      });
    return () => {
      cancelled = true;
    };
  }, [host, locale, sessionId, unitId]);

  const segment = () => {
    if (host === null || sessionId === null || unitId === null || words.length > 0) return;
    setError('');
    void createDesktopClient({ desktopCall: host.desktopCall })
      .segmentWords(sessionId, unitId)
      .then(setWords)
      .catch(() => {
        setError(t(locale, 'app.desktopRead.loadFailed'));
      });
  };

  return { words, error, segment };
}
