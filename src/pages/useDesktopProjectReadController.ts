import { useRef, useState } from 'react';
import { createDesktopClient } from '../app/desktopProjectReadPageAccess';
import { emitAfterWrite } from '../desktop/desktopDomainEvents';
import { readOpenProjectSession, rememberOpenProjectSession } from '../desktop/openProjectSession';
import type { DesktopReadHost } from '../desktop/projectReadHost';
import { t, useLocale } from '../i18n';
import { createDesktopUnitNoteActions } from './desktopUnitNoteActions';
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

  const forgetDeletedManuscript = (manuscriptId: string) => {
    if (host === null || sessionId === null) return;
    setError('');
    reads.forgetDeletedManuscript(manuscriptId);
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

  /** `saved` was re-read. `refresh-failed` is already committed and must not be written again. */
  const saveText = (
    unitId: string,
    text: string,
    operationId?: string,
  ): Promise<'saved' | 'failed' | 'refresh-failed' | 'unknown'> => {
    if (host === null || sessionId === null) return Promise.resolve('failed');
    const seen = sessionId;
    const manuscriptId = model?.manuscriptId ?? '';
    setError('');
    const client = createDesktopClient({ desktopCall: host.desktopCall });
    return emitAfterWrite(
      client.updateUnitText(seen, {
        unitId,
        text,
        ...(operationId === undefined ? {} : { operationId }),
      }),
      () => ({ type: 'unit.textSaved', sessionId: seen, manuscriptId, unitId }),
    )
      .then(({ refreshed }) => {
        if (!refreshed && shownSession.current === seen) {
          setError(t(locale, 'app.desktopRead.saveTextUnrefreshed'));
        }
        return refreshed ? 'saved' : 'refresh-failed';
      })
      .catch(async () => {
        if (operationId !== undefined) {
          try {
            const found = await client.inspectTextSave(seen, { operationId, unitId, text });
            if (found === 'committed') {
              if (shownSession.current === seen) {
                setError(t(locale, 'app.desktopRead.saveTextUnrefreshed'));
              }
              return 'refresh-failed';
            }
          } catch {
            if (shownSession.current === seen)
              setError(t(locale, 'app.desktopRead.saveTextUnknown'));
            return 'unknown';
          }
        }
        if (shownSession.current === seen) setError(t(locale, 'app.desktopRead.saveTextFailed'));
        return 'failed';
      });
  };
  const persistTextDraft = (unitId: string, text: string, baseBody: string) => {
    if (host === null || sessionId === null) return Promise.resolve();
    return createDesktopClient({ desktopCall: host.desktopCall })
      .putTextDraft(sessionId, { unitId, rawInput: text, baseBody })
      .then(() => undefined);
  };
  const readTextDraft = (unitId: string) => {
    if (host === null || sessionId === null) return Promise.resolve(null);
    return createDesktopClient({ desktopCall: host.desktopCall }).readTextDraft(sessionId, unitId);
  };
  const discardTextDraft = (unitId: string) => {
    if (host === null || sessionId === null) return Promise.resolve();
    return createDesktopClient({ desktopCall: host.desktopCall })
      .discardTextDraft(sessionId, unitId)
      .then(() => undefined);
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

  const noteActions = createDesktopUnitNoteActions({
    host,
    sessionId,
    unitIds: model?.units.map((unit) => unit.id) ?? [],
    notes,
    isShown: (seen) => shownSession.current === seen,
    refetchNotes: reads.refetchNotes,
    clearError: () => setError(''),
    showLoadFailed: () => setError(t(locale, 'app.desktopRead.loadFailed')),
  });

  return {
    sessionId,
    model,
    notes,
    projectTitle: reads.projectTitle,
    error,
    openFolder,
    selectManuscript,
    forgetDeletedManuscript,
    saveText,
    inspectTextSave: (draft: { unitId: string; text: string }, operationId: string) => {
      if (host === null || sessionId === null) return Promise.reject(new Error('no session'));
      return createDesktopClient({ desktopCall: host.desktopCall }).inspectTextSave(sessionId, {
        ...draft,
        operationId,
      });
    },
    persistTextDraft,
    readTextDraft,
    discardTextDraft,
    undoText,
    refresh: reload,
    adoptOpenedSession,
    splitUnit,
    mergeUnits,
    moveBoundary,
    saveMapping,
    ...noteActions,
  };
}
