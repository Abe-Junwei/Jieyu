import { useEffect, useRef, useState } from 'react';
import {
  createDesktopClient,
  loadDesktopProjectRead,
  type ContentNoteCategory,
  type DesktopProjectRead,
  type DesktopProjectReadApi,
} from '../app/desktopProjectReadPageAccess';
import { readOpenProjectSession, rememberOpenProjectSession } from '../desktop/openProjectSession';
import type { DesktopReadHost } from '../desktop/projectReadHost';
import { t, useLocale } from '../i18n';

export function useDesktopProjectReadController(
  host: DesktopReadHost | null,
  includeMedia = true,
  locate: { manuscriptId: string; layerId: string } | null = null,
) {
  const locateManuscriptId = locate?.manuscriptId;
  const locateLayerId = locate?.layerId;
  const locale = useLocale();
  const [sessionId, setSessionId] = useState(readOpenProjectSession);
  const [model, setModel] = useState<DesktopProjectRead | null>(null);
  const [notes, setNotes] = useState<UnitNote[]>([]);
  const [projectTitle, setProjectTitle] = useState('');
  const [error, setError] = useState('');
  const shownSession = useRef(sessionId);
  const loadGenerationRef = useRef(0);

  const adoptOpenedSession = (nextSessionId: string) => {
    shownSession.current = nextSessionId;
    rememberOpenProjectSession(nextSessionId);
    setModel(null);
    setNotes([]);
    setProjectTitle('');
    setError('');
    setSessionId(nextSessionId);
  };

  useEffect(() => {
    if (host === null || sessionId === null) return;
    let cancelled = false;
    const generation = ++loadGenerationRef.current;
    void loadDesktopProjectRead(
      readApi(host),
      sessionId,
      locateManuscriptId,
      includeMedia,
      locateLayerId,
    )
      .then(async (next) => {
        const [shown, project] = await Promise.all([
          loadShownNotes(host, sessionId, next.manuscriptId),
          createDesktopClient({ desktopCall: host.desktopCall }).getProject(sessionId),
        ]);
        if (
          cancelled ||
          shownSession.current !== sessionId ||
          generation !== loadGenerationRef.current
        ) {
          return;
        }
        setModel(next);
        setNotes(shown);
        setProjectTitle(shownProjectTitle(project?.title));
      })
      .catch(() => {
        if (
          !cancelled &&
          shownSession.current === sessionId &&
          generation === loadGenerationRef.current
        ) {
          setError(t(locale, 'app.desktopRead.loadFailed'));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [host, includeMedia, locale, locateLayerId, locateManuscriptId, sessionId]);

  const openFolder = () => {
    if (host === null) return;
    setError('');
    void host
      .chooseDesktopFolder()
      .then(async (picked) => {
        if (!('sessionId' in picked)) return;
        ++loadGenerationRef.current;
        adoptOpenedSession(picked.sessionId);
      })
      .catch(() => {
        if (shownSession.current !== sessionId) return;
        setError(t(locale, 'app.desktopRead.loadFailed'));
      });
  };

  const selectManuscript = (manuscriptId: string, layerId?: string) => {
    if (host === null || sessionId === null) return;
    const seen = sessionId;
    setError('');
    const generation = ++loadGenerationRef.current;
    void loadDesktopProjectRead(readApi(host), seen, manuscriptId, includeMedia, layerId)
      .then(async (next) => {
        if (shownSession.current !== seen || generation !== loadGenerationRef.current) return;
        setModel(next);
        const shown = await loadShownNotes(host, seen, next.manuscriptId);
        if (shownSession.current !== seen || generation !== loadGenerationRef.current) return;
        setNotes(shown);
      })
      .catch((error: unknown) => {
        if (shownSession.current !== seen || generation !== loadGenerationRef.current) return;
        if (error instanceof Error && error.message === 'manuscript is missing') {
          void loadDesktopProjectRead(readApi(host), seen, undefined, includeMedia)
            .then(async (next) => {
              if (shownSession.current !== seen || generation !== loadGenerationRef.current) return;
              setModel(next);
              const shown = await loadShownNotes(host, seen, next.manuscriptId);
              if (shownSession.current !== seen || generation !== loadGenerationRef.current) return;
              setNotes(shown);
            })
            .catch(() => {
              if (
                shownSession.current === seen &&
                generation === loadGenerationRef.current
              ) {
                setError(t(locale, 'app.desktopRead.loadFailed'));
              }
            });
          return;
        }
        setError(t(locale, 'app.desktopRead.loadFailed'));
      });
  };

  const reload = () => {
    if (host === null || sessionId === null) return Promise.resolve();
    const manuscriptId = model?.manuscriptId ?? undefined;
    const seen = sessionId;
    const generation = ++loadGenerationRef.current;
    return loadDesktopProjectRead(
      readApi(host),
      sessionId,
      manuscriptId,
      includeMedia,
      model?.layerId ?? undefined,
    )
      .then(async (next) => {
        if (shownSession.current !== seen || generation !== loadGenerationRef.current) return;
        const shown = await loadShownNotes(host, seen, next.manuscriptId);
        if (shownSession.current !== seen || generation !== loadGenerationRef.current) return;
        setModel(next);
        setNotes(shown);
      })
      .catch((error: unknown) => {
        if (shownSession.current !== seen || generation !== loadGenerationRef.current) return;
        throw error;
      });
  };

  const saveText = (unitId: string, text: string) => {
    if (host === null || sessionId === null) return;
    setError('');
    void createDesktopClient({ desktopCall: host.desktopCall })
      .updateUnitText(sessionId, { unitId, text })
      .then(() => reload())
      .catch(() => {
        if (shownSession.current !== sessionId) return;
        setError(t(locale, 'app.desktopRead.loadFailed'));
      });
  };

  const undoText = () => {
    if (host === null || sessionId === null) return;
    setError('');
    void createDesktopClient({ desktopCall: host.desktopCall })
      .undoStep(sessionId)
      .then(() => reload())
      .catch((error: unknown) => {
        if (shownSession.current !== sessionId) return;
        if (error instanceof Error && error.message === 'unit text undo is empty') return;
        setError(t(locale, 'app.desktopRead.loadFailed'));
      });
  };

  const splitUnit = (unitId: string, time: number) => {
    if (host === null || sessionId === null) return;
    setError('');
    void createDesktopClient({ desktopCall: host.desktopCall })
      .splitUnit(sessionId, { unitId, time })
      .then(() => reload())
      .catch(() => {
        if (shownSession.current !== sessionId) return;
        setError(t(locale, 'app.desktopRead.loadFailed'));
      });
  };

  const mergeUnits = (keepId: string, removeId: string) => {
    if (host === null || sessionId === null) return;
    setError('');
    void createDesktopClient({ desktopCall: host.desktopCall })
      .mergeUnits(sessionId, { keepId, removeId })
      .then(() => reload())
      .catch(() => {
        if (shownSession.current !== sessionId) return;
        setError(t(locale, 'app.desktopRead.loadFailed'));
      });
  };

  const moveBoundary = (leftId: string, rightId: string, time: number) => {
    if (host === null || sessionId === null) return;
    setError('');
    void createDesktopClient({ desktopCall: host.desktopCall })
      .updateBoundary(sessionId, { leftId, rightId, time })
      .then(() => reload())
      .catch(() => {
        if (shownSession.current !== sessionId) return;
        setError(t(locale, 'app.desktopRead.loadFailed'));
      });
  };

  const saveMapping = (offsetSec: number, scale: number) => {
    if (
      host === null ||
      sessionId === null ||
      model?.manuscriptId === null ||
      model?.manuscriptId === undefined
    ) {
      return;
    }
    const manuscriptId = model.manuscriptId;
    setError('');
    void createDesktopClient({ desktopCall: host.desktopCall })
      .setTimeMapping(sessionId, {
        manuscriptId,
        expectedRevision:
          model.manuscripts.find((item) => item.id === manuscriptId)?.timeMappingRevision ?? 0,
        offsetSec,
        scale,
      })
      .then(() => reload())
      .catch(() => {
        if (shownSession.current !== sessionId) return;
        setError(t(locale, 'app.desktopRead.loadFailed'));
      });
  };

  const saveUnitNote = (unitId: string, text: string): Promise<void> => {
    if (host === null || sessionId === null || text.length === 0) {
      return Promise.reject(new Error('note save unavailable'));
    }
    const seen = sessionId;
    setError('');
    const generation = loadGenerationRef.current;
    return createDesktopClient({ desktopCall: host.desktopCall })
      .createNote(seen, { anchor: { kind: 'unit', unitId }, content: { default: text } })
      .then(() => loadShownNotes(host, seen, model?.manuscriptId ?? null))
      .then((shown) => {
        if (shownSession.current === seen && generation === loadGenerationRef.current) {
          setNotes(shown);
        }
      })
      .catch((err: unknown) => {
        if (shownSession.current === seen && generation === loadGenerationRef.current) {
          setError(t(locale, 'app.desktopRead.loadFailed'));
        }
        throw err;
      });
  };

  const saveCategorizedUnitNote = (
    unitId: string,
    text: string,
    category: ContentNoteCategory,
  ): Promise<boolean> => {
    if (
      host === null ||
      sessionId === null ||
      text.trim().length === 0 ||
      !model?.units.some((unit) => unit.id === unitId)
    ) {
      return Promise.resolve(false);
    }
    const seen = sessionId;
    setError('');
    return createDesktopClient({ desktopCall: host.desktopCall })
      .createNote(seen, {
        anchor: { kind: 'unit', unitId },
        content: { default: text.trim() },
        category,
      })
      .then(async () => {
        if (shownSession.current !== seen) return false;
        setNotes(await loadShownNotes(host, seen, model.manuscriptId));
        return true;
      })
      .catch(() => {
        if (shownSession.current === seen) setError(t(locale, 'app.desktopRead.loadFailed'));
        return false;
      });
  };

  const segmentNote = (noteId: string) =>
    notes.find(
      (note) =>
        note.id === noteId &&
        note.view === null &&
        (model?.units.some((unit) => unit.id === note.unitId) ?? false),
    );

  const updateCategorizedUnitNote = (
    noteId: string,
    text: string,
    category: ContentNoteCategory,
  ): Promise<boolean> => {
    if (host === null || sessionId === null || text.trim().length === 0 || !segmentNote(noteId)) {
      return Promise.resolve(false);
    }
    const seen = sessionId;
    setError('');
    return createDesktopClient({ desktopCall: host.desktopCall })
      .updateNote(seen, {
        id: noteId,
        content: { default: text.trim() },
        category,
      })
      .then(async () => {
        if (shownSession.current !== seen) return false;
        setNotes(await loadShownNotes(host, seen, model?.manuscriptId ?? null));
        return true;
      })
      .catch(() => {
        if (shownSession.current === seen) setError(t(locale, 'app.desktopRead.loadFailed'));
        return false;
      });
  };

  const deleteUnitNote = (noteId: string): Promise<boolean> => {
    if (host === null || sessionId === null || !segmentNote(noteId)) return Promise.resolve(false);
    const seen = sessionId;
    setError('');
    return createDesktopClient({ desktopCall: host.desktopCall })
      .deleteNote(seen, noteId)
      .then(async () => {
        if (shownSession.current !== seen) return false;
        setNotes(await loadShownNotes(host, seen, model?.manuscriptId ?? null));
        return true;
      })
      .catch(() => {
        if (shownSession.current === seen) setError(t(locale, 'app.desktopRead.loadFailed'));
        return false;
      });
  };

  const saveTierNote = (
    unitId: string,
    view: 'timeline' | 'waveform',
    text: string,
  ): Promise<void> => {
    if (host === null || sessionId === null || text.length === 0) {
      return Promise.reject(new Error('note save unavailable'));
    }
    const seen = sessionId;
    setError('');
    const generation = loadGenerationRef.current;
    return createDesktopClient({ desktopCall: host.desktopCall })
      .createNote(seen, {
        anchor: { kind: 'unit', unitId, view },
        content: { default: text },
      })
      .then(() => loadShownNotes(host, seen, model?.manuscriptId ?? null))
      .then((shown) => {
        if (shownSession.current === seen && generation === loadGenerationRef.current) {
          setNotes(shown);
        }
      })
      .catch((err: unknown) => {
        if (shownSession.current === seen && generation === loadGenerationRef.current) {
          setError(t(locale, 'app.desktopRead.loadFailed'));
        }
        throw err;
      });
  };

  return {
    sessionId,
    model,
    notes,
    projectTitle,
    error,
    openFolder,
    selectManuscript,
    saveText,
    undoText,
    refresh: reload,
    adoptOpenedSession,
    splitUnit,
    mergeUnits,
    moveBoundary,
    saveMapping,
    saveUnitNote,
    saveCategorizedUnitNote,
    updateCategorizedUnitNote,
    deleteUnitNote,
    saveTierNote,
  };
}

interface UnitNote {
  id: string;
  unitId: string | null;
  text: string;
  category: ContentNoteCategory | null;
  view: 'timeline' | 'waveform' | null;
}

const SHOWN_NOTE_KINDS = ['unit'] as const;

async function loadShownNotes(
  host: DesktopReadHost,
  sessionId: string,
  manuscriptId: string | null,
): Promise<UnitNote[]> {
  if (manuscriptId === null) return [];
  const rows = await createDesktopClient({ desktopCall: host.desktopCall }).listNotes(sessionId, {
    manuscriptId,
    attachment: 'active',
  });
  return rows
    .filter((row) => SHOWN_NOTE_KINDS.some((kind) => kind === row.anchorKind))
    .map((row) => ({
      id: row.id,
      unitId: row.unitId,
      text: row.content.default ?? '',
      category: row.category,
      view: row.view,
    }));
}

function readApi(host: DesktopReadHost): DesktopProjectReadApi {
  const client = createDesktopClient({ desktopCall: host.desktopCall });
  return {
    listManuscripts: (sessionId) => client.listManuscripts(sessionId),
    listLayers: (sessionId, manuscriptId) => client.listLayers(sessionId, manuscriptId),
    listUnits: (sessionId, layerId) => client.listUnits(sessionId, layerId),
    mediaPlayUrl: async (sessionId, mediaId) =>
      (await host.desktopMediaUrl(sessionId, mediaId)).url,
  };
}

function shownProjectTitle(title: Record<string, string> | undefined): string {
  if (title === undefined) return '';
  const und = title.und?.trim() ?? '';
  if (und.length > 0) return und;
  for (const value of Object.values(title)) {
    const text = value.trim();
    if (text.length > 0) return text;
  }
  return '';
}
