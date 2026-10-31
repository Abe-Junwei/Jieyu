import { useRef, useState } from 'react';
import { createDesktopClient, type ContentNoteCategory } from '../app/desktopProjectReadPageAccess';
import { emitAfterWrite } from '../desktop/desktopDomainEvents';
import { readOpenProjectSession, rememberOpenProjectSession } from '../desktop/openProjectSession';
import type { DesktopReadHost } from '../desktop/projectReadHost';
import { t, useLocale } from '../i18n';
import { useDesktopProjectReadQueries } from './useDesktopProjectReadQueries';

export function useDesktopProjectReadController(
  host: DesktopReadHost | null,
  includeMedia = true,
  locate: { manuscriptId: string; layerId: string } | null = null,
) {
  const locale = useLocale();
  const [sessionId, setSessionId] = useState(readOpenProjectSession);
  const [writeError, setWriteError] = useState('');
  const shownSession = useRef(sessionId);
  const reads = useDesktopProjectReadQueries(host, sessionId, includeMedia, {
    manuscriptId: locate?.manuscriptId,
    layerId: locate?.layerId,
  });
  const model = reads.model;
  const notes = reads.notes;
  const error =
    writeError.length > 0
      ? writeError
      : reads.loadFailed
        ? t(locale, 'app.desktopRead.loadFailed')
        : '';
  const setError = setWriteError;

  const adoptOpenedSession = (nextSessionId: string) => {
    reads.dropSession(shownSession.current === nextSessionId ? null : shownSession.current);
    shownSession.current = nextSessionId;
    rememberOpenProjectSession(nextSessionId);
    setError('');
    setSessionId(nextSessionId);
  };

  const openFolder = () => {
    if (host === null) return;
    setError('');
    void host
      .chooseDesktopFolder()
      .then(async (picked) => {
        if (!('sessionId' in picked)) return;
        adoptOpenedSession(picked.sessionId);
      })
      .catch(() => {
        if (shownSession.current !== sessionId) return;
        setError(t(locale, 'app.desktopRead.loadFailed'));
      });
  };

  const selectManuscript = (manuscriptId: string, layerId?: string) => {
    if (host === null || sessionId === null) return;
    setError('');
    reads.selectManuscript(manuscriptId, layerId);
  };

  /** Writes not yet on the event path (split, merge, boundary, mapping, undo) re-read through Query. */
  const reload = () => {
    if (host === null || sessionId === null) return Promise.resolve();
    const seen = sessionId;
    return reads.refetch(seen).catch((error: unknown) => {
      if (shownSession.current !== seen) return;
      throw error;
    });
  };

  /** Resolves true once saved and re-read through the invalidation table; false keeps the draft. */
  const saveText = (unitId: string, text: string): Promise<boolean> => {
    if (host === null || sessionId === null) return Promise.resolve(false);
    const seen = sessionId;
    const manuscriptId = model?.manuscriptId ?? '';
    setError('');
    return emitAfterWrite(
      createDesktopClient({ desktopCall: host.desktopCall }).updateUnitText(seen, { unitId, text }),
      () => ({ type: 'unit.textSaved', sessionId: seen, manuscriptId, unitId }),
    )
      .then(() => true)
      .catch(() => {
        if (shownSession.current === seen) setError(t(locale, 'app.desktopRead.saveTextFailed'));
        return false;
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
    return createDesktopClient({ desktopCall: host.desktopCall })
      .createNote(seen, { anchor: { kind: 'unit', unitId }, content: { default: text } })
      .then(() => reads.refetchNotes(seen))
      .catch((err: unknown) => {
        if (shownSession.current === seen) setError(t(locale, 'app.desktopRead.loadFailed'));
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
        await reads.refetchNotes(seen);
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
        await reads.refetchNotes(seen);
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
        await reads.refetchNotes(seen);
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
    return createDesktopClient({ desktopCall: host.desktopCall })
      .createNote(seen, {
        anchor: { kind: 'unit', unitId, view },
        content: { default: text },
      })
      .then(() => reads.refetchNotes(seen))
      .catch((err: unknown) => {
        if (shownSession.current === seen) setError(t(locale, 'app.desktopRead.loadFailed'));
        throw err;
      });
  };

  return {
    sessionId,
    model,
    notes,
    projectTitle: reads.projectTitle,
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
