import { createDesktopClient, type ContentNoteCategory } from '../app/desktopProjectReadPageAccess';
import type { DesktopReadHost } from '../desktop/projectReadHost';

interface NoteRow {
  id: string;
  unitId: string | null;
  view: string | null;
}

interface UnitNoteActionsInput {
  host: DesktopReadHost | null;
  sessionId: string | null;
  unitIds: readonly string[];
  notes: readonly NoteRow[];
  /** False once another project session has replaced `seen` on screen. */
  isShown: (seen: string) => boolean;
  refetchNotes: (seen: string) => Promise<unknown>;
  clearError: () => void;
  showLoadFailed: () => void;
}

/** Segment, timeline, and waveform note writes for the desktop read controller. */
export function createDesktopUnitNoteActions(input: UnitNoteActionsInput) {
  const { host, sessionId, unitIds, notes, isShown, refetchNotes, clearError, showLoadFailed } =
    input;
  const client = (h: DesktopReadHost) => createDesktopClient({ desktopCall: h.desktopCall });
  const failIfShown = (seen: string) => {
    if (isShown(seen)) showLoadFailed();
  };
  const refetchIfShown = async (seen: string) => {
    if (!isShown(seen)) return false;
    await refetchNotes(seen);
    return true;
  };
  const segmentNote = (noteId: string) =>
    notes.find(
      (note) =>
        note.id === noteId &&
        note.view === null &&
        note.unitId !== null &&
        unitIds.includes(note.unitId),
    );

  const saveUnitNote = (unitId: string, text: string): Promise<void> => {
    if (host === null || sessionId === null || text.length === 0) {
      return Promise.reject(new Error('note save unavailable'));
    }
    const seen = sessionId;
    clearError();
    return client(host)
      .createNote(seen, { anchor: { kind: 'unit', unitId }, content: { default: text } })
      .then(() => refetchNotes(seen))
      .then(() => undefined)
      .catch((err: unknown) => {
        failIfShown(seen);
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
      !unitIds.includes(unitId)
    ) {
      return Promise.resolve(false);
    }
    const seen = sessionId;
    clearError();
    return client(host)
      .createNote(seen, {
        anchor: { kind: 'unit', unitId },
        content: { default: text.trim() },
        category,
      })
      .then(() => refetchIfShown(seen))
      .catch(() => {
        failIfShown(seen);
        return false;
      });
  };

  const updateCategorizedUnitNote = (
    noteId: string,
    text: string,
    category: ContentNoteCategory,
  ): Promise<boolean> => {
    if (host === null || sessionId === null || text.trim().length === 0 || !segmentNote(noteId)) {
      return Promise.resolve(false);
    }
    const seen = sessionId;
    clearError();
    return client(host)
      .updateNote(seen, { id: noteId, content: { default: text.trim() }, category })
      .then(() => refetchIfShown(seen))
      .catch(() => {
        failIfShown(seen);
        return false;
      });
  };

  const deleteUnitNote = (noteId: string): Promise<boolean> => {
    if (host === null || sessionId === null || !segmentNote(noteId)) return Promise.resolve(false);
    const seen = sessionId;
    clearError();
    return client(host)
      .deleteNote(seen, noteId)
      .then(() => refetchIfShown(seen))
      .catch(() => {
        failIfShown(seen);
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
    clearError();
    return client(host)
      .createNote(seen, { anchor: { kind: 'unit', unitId, view }, content: { default: text } })
      .then(() => refetchNotes(seen))
      .then(() => undefined)
      .catch((err: unknown) => {
        failIfShown(seen);
        throw err;
      });
  };

  return {
    saveUnitNote,
    saveCategorizedUnitNote,
    updateCategorizedUnitNote,
    deleteUnitNote,
    saveTierNote,
  };
}
