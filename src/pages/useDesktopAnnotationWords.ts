import { useEffect, useRef, useState } from 'react';
import { createDesktopClient } from '../app/desktopProjectReadPageAccess';
import type { DesktopReadHost } from '../desktop/projectReadHost';
import { t, useLocale } from '../i18n';

export interface AnnotationWord {
  id: string;
  form: string;
  gloss: Record<string, string>;
  pos: string;
}

export interface AnnotationMorpheme {
  id: string;
  tokenId: string;
  form: string;
}

export function useDesktopAnnotationWords(
  host: DesktopReadHost | null,
  sessionId: string | null,
  unitId: string | null,
) {
  const locale = useLocale();
  const glossKey = locale === 'zh-CN' ? 'zh' : 'en';
  const [words, setWords] = useState<AnnotationWord[]>([]);
  const [morphemes, setMorphemes] = useState<AnnotationMorpheme[]>([]);
  const [error, setError] = useState('');
  const request = useRef(0);

  useEffect(() => {
    if (host === null || sessionId === null || unitId === null) {
      setWords([]);
      setMorphemes([]);
      return;
    }
    const id = ++request.current;
    let cancelled = false;
    const client = createDesktopClient({ desktopCall: host.desktopCall });
    void Promise.all([client.listWords(sessionId, unitId), client.listMorphemes(sessionId, unitId)])
      .then(([nextWords, nextMorphemes]) => {
        if (cancelled || id !== request.current) return;
        setWords(nextWords);
        setMorphemes(nextMorphemes);
      })
      .catch(() => {
        if (!cancelled && id === request.current) setError(t(locale, 'app.desktopRead.loadFailed'));
      });
    return () => {
      cancelled = true;
    };
  }, [host, locale, sessionId, unitId]);

  const segment = () => {
    if (host === null || sessionId === null || unitId === null || words.length > 0) return;
    setError('');
    const id = ++request.current;
    void createDesktopClient({ desktopCall: host.desktopCall })
      .segmentWords(sessionId, unitId)
      .then((next) => {
        if (id === request.current) setWords(next);
      })
      .catch(() => {
        setError(t(locale, 'app.desktopRead.loadFailed'));
      });
  };

  const segmentMorphemes = () => {
    if (
      host === null ||
      sessionId === null ||
      unitId === null ||
      words.length === 0 ||
      morphemes.length > 0
    ) {
      return;
    }
    if (!words.some((word) => /[-=]/.test(word.form))) {
      setError(t(locale, 'workspace.annotation.morphemeSplitError'));
      return;
    }
    setError('');
    const id = ++request.current;
    void createDesktopClient({ desktopCall: host.desktopCall })
      .segmentMorphemes(sessionId, unitId)
      .then((next) => {
        if (id === request.current) setMorphemes(next);
      })
      .catch(() => {
        setError(t(locale, 'app.desktopRead.loadFailed'));
      });
  };

  const writeWord = (current: string, value: string, changes: unknown[]) => {
    if (host === null || sessionId === null || unitId === null || current === value) return;
    const id = ++request.current;
    const client = createDesktopClient({ desktopCall: host.desktopCall });
    void client
      .readAnalysisState(sessionId, unitId)
      .then((state) =>
        client.applyAnalysis(sessionId, {
          unitId,
          expected: {
            manuscriptGeneration: state.manuscriptGeneration,
            analysisGeneration: state.analysisGeneration,
            graphFingerprint: state.graphFingerprint,
          },
          changes,
        }),
      )
      .then(() => client.listWords(sessionId, unitId))
      .then((next) => {
        if (id === request.current) setWords(next);
      })
      .catch(() => {
        if (id === request.current) setError(t(locale, 'app.desktopRead.loadFailed'));
      });
  };

  const setGloss = (wordId: string, value: string) => {
    const current = words.find((word) => word.id === wordId)?.gloss[glossKey] ?? '';
    writeWord(current, value, [
      { action: 'node.setMapValue', nodeId: wordId, field: 'gloss', key: glossKey, value },
    ]);
  };

  const setPos = (wordId: string, value: string) => {
    const current = words.find((word) => word.id === wordId)?.pos ?? '';
    writeWord(current, value, [
      value.length === 0
        ? { action: 'node.removeField', nodeId: wordId, field: 'pos' }
        : { action: 'node.setField', nodeId: wordId, field: 'pos', value },
    ]);
  };

  return { words, morphemes, error, glossKey, segment, segmentMorphemes, setGloss, setPos };
}
