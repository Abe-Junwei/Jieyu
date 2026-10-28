import { useEffect, useState } from 'react';
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

export function useDesktopProjectReadController(host: DesktopReadHost | null, includeMedia = true) {
  const locale = useLocale();
  const [sessionId, setSessionId] = useState(readOpenProjectSession);
  const [model, setModel] = useState<DesktopProjectRead | null>(null);
  const [notes, setNotes] = useState<UnitNote[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (host === null || sessionId === null) return;
    let cancelled = false;
    void loadDesktopProjectRead(readApi(host), sessionId, undefined, includeMedia)
      .then(async (next) => {
        const shown = await loadShownNotes(host, sessionId, next.manuscriptId);
        if (cancelled) return;
        setModel(next);
        setNotes(shown);
      })
      .catch(() => {
        if (!cancelled) setError(t(locale, 'app.desktopRead.loadFailed'));
      });
    return () => {
      cancelled = true;
    };
  }, [host, includeMedia, locale, sessionId]);

  const openFolder = () => {
    if (host === null) return;
    setError('');
    void host
      .chooseDesktopFolder()
      .then(async (picked) => {
        if (!('sessionId' in picked)) return;
        rememberOpenProjectSession(picked.sessionId);
        setModel(null);
        setNotes([]);
        setSessionId(picked.sessionId);
      })
      .catch(() => {
        setError(t(locale, 'app.desktopRead.loadFailed'));
      });
  };

  const selectManuscript = (manuscriptId: string, layerId?: string) => {
    if (host === null || sessionId === null) return;
    setError('');
    void loadDesktopProjectRead(readApi(host), sessionId, manuscriptId, includeMedia, layerId)
      .then(async (next) => {
        setModel(next);
        setNotes(await loadShownNotes(host, sessionId, next.manuscriptId));
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.message === 'manuscript is missing') {
          void loadDesktopProjectRead(readApi(host), sessionId, undefined, includeMedia)
            .then(async (next) => {
              setModel(next);
              setNotes(await loadShownNotes(host, sessionId, next.manuscriptId));
            })
            .catch(() => {
              setError(t(locale, 'app.desktopRead.loadFailed'));
            });
          return;
        }
        setError(t(locale, 'app.desktopRead.loadFailed'));
      });
  };

  const reload = () => {
    if (host === null || sessionId === null) return Promise.resolve();
    const manuscriptId = model?.manuscriptId ?? undefined;
    return loadDesktopProjectRead(
      readApi(host),
      sessionId,
      manuscriptId,
      includeMedia,
      model?.layerId ?? undefined,
    ).then(async (next) => {
      setModel(next);
      setNotes(await loadShownNotes(host, sessionId, next.manuscriptId));
    });
  };

  const saveText = (unitId: string, text: string) => {
    if (host === null || sessionId === null) return;
    setError('');
    void createDesktopClient({ desktopCall: host.desktopCall })
      .updateUnitText(sessionId, { unitId, text })
      .then(() => reload())
      .catch(() => {
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
        setError(t(locale, 'app.desktopRead.loadFailed'));
      });
  };

  const saveUnitNote = (unitId: string, text: string) => {
    if (host === null || sessionId === null || text.length === 0) return;
    setError('');
    void createDesktopClient({ desktopCall: host.desktopCall })
      .createNote(sessionId, { anchor: { kind: 'unit', unitId }, content: { default: text } })
      .then(() => loadShownNotes(host, sessionId, model?.manuscriptId ?? null))
      .then(setNotes)
      .catch(() => {
        setError(t(locale, 'app.desktopRead.loadFailed'));
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
    setError('');
    return createDesktopClient({ desktopCall: host.desktopCall })
      .createNote(sessionId, {
        anchor: { kind: 'unit', unitId },
        content: { default: text.trim() },
        category,
      })
      .then(async () => {
        setNotes(await loadShownNotes(host, sessionId, model.manuscriptId));
        return true;
      })
      .catch(() => {
        setError(t(locale, 'app.desktopRead.loadFailed'));
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
    setError('');
    return createDesktopClient({ desktopCall: host.desktopCall })
      .updateNote(sessionId, {
        id: noteId,
        content: { default: text.trim() },
        category,
      })
      .then(async () => {
        setNotes(await loadShownNotes(host, sessionId, model?.manuscriptId ?? null));
        return true;
      })
      .catch(() => {
        setError(t(locale, 'app.desktopRead.loadFailed'));
        return false;
      });
  };

  const deleteUnitNote = (noteId: string): Promise<boolean> => {
    if (host === null || sessionId === null || !segmentNote(noteId)) return Promise.resolve(false);
    setError('');
    return createDesktopClient({ desktopCall: host.desktopCall })
      .deleteNote(sessionId, noteId)
      .then(async () => {
        setNotes(await loadShownNotes(host, sessionId, model?.manuscriptId ?? null));
        return true;
      })
      .catch(() => {
        setError(t(locale, 'app.desktopRead.loadFailed'));
        return false;
      });
  };

  const saveTierNote = (unitId: string, view: 'timeline' | 'waveform', text: string) => {
    if (host === null || sessionId === null || text.length === 0) return;
    setError('');
    void createDesktopClient({ desktopCall: host.desktopCall })
      .createNote(sessionId, {
        anchor: { kind: 'unit', unitId, view },
        content: { default: text },
      })
      .then(() => loadShownNotes(host, sessionId, model?.manuscriptId ?? null))
      .then(setNotes)
      .catch(() => {
        setError(t(locale, 'app.desktopRead.loadFailed'));
      });
  };

  return {
    sessionId,
    model,
    notes,
    error,
    openFolder,
    selectManuscript,
    saveText,
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
