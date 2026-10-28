import { useCallback, useEffect, useState } from 'react';
import {
  createDesktopClient,
  type ProjectBridge,
  type ProjectLanguage,
  type ProjectOrthography,
  type Speaker,
} from '../app/desktopProjectReadPageAccess';
import type { DesktopReadHost } from '../desktop/projectReadHost';
import { t, useLocale } from '../i18n';

export function useDesktopSpeakerCatalog(host: DesktopReadHost, sessionId: string) {
  const locale = useLocale();
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [languages, setLanguages] = useState<ProjectLanguage[]>([]);
  const [orthographies, setOrthographies] = useState<ProjectOrthography[]>([]);
  const [bridges, setBridges] = useState<ProjectBridge[]>([]);
  const [speakerId, setSpeakerId] = useState<string | null>(null);
  const [languageId, setLanguageId] = useState<string | null>(null);
  const [orthographyId, setOrthographyId] = useState<string | null>(null);
  const [bridgeId, setBridgeId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(
    async (preferred?: {
      speakerId?: string | undefined;
      languageId?: string | undefined;
      orthographyId?: string | undefined;
      bridgeId?: string | undefined;
    }) => {
      const api = createDesktopClient({ desktopCall: host.desktopCall });
      const [nextSpeakers, nextLanguages, nextBridges] = await Promise.all([
        api.listSpeakers(sessionId),
        api.listLanguages(sessionId),
        api.listBridges(sessionId),
      ]);
      const language =
        nextLanguages.find((item) => item.id === preferred?.languageId) ?? nextLanguages[0] ?? null;
      const nextOrthographies =
        language === null ? [] : await api.listOrthographies(sessionId, language.id);
      setSpeakers(nextSpeakers);
      setLanguages(nextLanguages);
      setBridges(nextBridges);
      setOrthographies(nextOrthographies);
      setLanguageId(language?.id ?? null);
      setSpeakerId(preferred?.speakerId ?? nextSpeakers[0]?.id ?? null);
      setOrthographyId(preferred?.orthographyId ?? nextOrthographies[0]?.id ?? null);
      setBridgeId(preferred?.bridgeId ?? nextBridges[0]?.id ?? null);
    },
    [host, sessionId],
  );

  useEffect(() => {
    let cancelled = false;
    void load().catch(() => {
      if (!cancelled) setError(t(locale, 'app.desktopRead.loadFailed'));
    });
    return () => {
      cancelled = true;
    };
  }, [load, locale]);

  const fail = (error: unknown) => {
    if (error instanceof Error && error.message === 'speaker assign is empty') return;
    setError(t(locale, 'app.desktopRead.loadFailed'));
  };

  return {
    speakers,
    languages,
    orthographies,
    bridges,
    speakerId,
    languageId,
    orthographyId,
    bridgeId,
    error,
    selectSpeaker: setSpeakerId,
    selectLanguage: (id: string) => {
      setError('');
      void load({ languageId: id, speakerId: speakerId ?? undefined }).catch(fail);
    },
    selectOrthography: setOrthographyId,
    selectBridge: setBridgeId,
    createSpeaker: (name: string) => {
      const trimmed = name.trim();
      if (trimmed.length === 0) return Promise.resolve();
      setError('');
      return createDesktopClient({ desktopCall: host.desktopCall })
        .createSpeaker(sessionId, { name: trimmed })
        .then((speaker) => load({ speakerId: speaker.id, languageId: languageId ?? undefined }))
        .catch(fail);
    },
    saveNote: (speaker: Speaker, text: string) => {
      const trimmed = text.trim();
      if (trimmed.length === 0) return Promise.resolve();
      setError('');
      return createDesktopClient({ desktopCall: host.desktopCall })
        .patchSpeaker(sessionId, {
          operationId: noteOperationId(),
          id: speaker.id,
          notes: { expectedRevision: speaker.revisions.notes, value: { zh: trimmed } },
        })
        .then(() => load({ speakerId: speaker.id, languageId: languageId ?? undefined }))
        .catch(fail);
    },
    assign: (id: string, unitIds: string[]) => {
      if (unitIds.length === 0) return Promise.resolve(false);
      setError('');
      return createDesktopClient({ desktopCall: host.desktopCall })
        .assignSpeaker(sessionId, { speakerId: id, unitIds })
        .then(() => true)
        .catch((error: unknown) => {
          fail(error);
          return false;
        });
    },
    saveLanguage: (id: string, value: string) => {
      setError('');
      return createDesktopClient({ desktopCall: host.desktopCall })
        .updateLanguage(sessionId, { id, locale: 'zh', value })
        .then(() => load({ speakerId: speakerId ?? undefined, languageId: id }))
        .catch(fail);
    },
    saveOrthography: (id: string, scriptTag: string) => {
      setError('');
      return createDesktopClient({ desktopCall: host.desktopCall })
        .updateOrthography(sessionId, { id, scriptTag })
        .then(() =>
          load({
            speakerId: speakerId ?? undefined,
            languageId: languageId ?? undefined,
            orthographyId: id,
          }),
        )
        .catch(fail);
    },
    saveBridge: (id: string, rules: string) => {
      setError('');
      let parsed: unknown;
      try {
        parsed = JSON.parse(rules);
      } catch {
        setError(t(locale, 'app.desktopRead.loadFailed'));
        return Promise.resolve();
      }
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        setError(t(locale, 'app.desktopRead.loadFailed'));
        return Promise.resolve();
      }
      return createDesktopClient({ desktopCall: host.desktopCall })
        .updateBridge(sessionId, { id, rules: parsed as Record<string, unknown> })
        .then(() =>
          load({
            speakerId: speakerId ?? undefined,
            languageId: languageId ?? undefined,
            bridgeId: id,
          }),
        )
        .catch(fail);
    },
  };
}

function noteOperationId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `speaker-note-${Date.now()}`;
}
