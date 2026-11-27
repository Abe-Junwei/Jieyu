import type { createDesktopClient, ViewScopeWrite } from '../app/desktopProjectReadPageAccess';
import type { NotesDialogState } from './useDesktopTranscriptionMetadataController';

export async function persistMetadataNote(
  api: ReturnType<typeof createDesktopClient>,
  sessionId: string,
  dialog: Exclude<NotesDialogState, null | { mode: 'list' }>,
  value: Record<string, string>,
  writeScope: (ids: readonly string[]) => ViewScopeWrite,
): Promise<void> {
  if (dialog.mode === 'edit' && dialog.noteId !== null) {
    await api.updateNote(sessionId, { id: dialog.noteId, content: value });
  } else if (dialog.mode === 'batch') {
    if (dialog.textLayerId !== null) {
      await api.createUnitTextNotesMany(sessionId, {
        unitIds: dialog.unitIds,
        textLayerId: dialog.textLayerId,
        value,
        category: 'comment',
        ...writeScope(dialog.unitIds),
      });
    } else {
      await api.createUnitNotesMany(sessionId, {
        unitIds: dialog.unitIds,
        value,
        category: 'comment',
        view: 'waveform',
        ...writeScope(dialog.unitIds),
      });
    }
  } else if (dialog.textLayerId !== null && dialog.unitIds[0]) {
    await api.createUnitTextNote(sessionId, {
      unitId: dialog.unitIds[0],
      textLayerId: dialog.textLayerId,
      value,
      category: 'comment',
      ...writeScope(dialog.unitIds),
    });
  } else if (dialog.unitIds[0]) {
    await api.createNote(sessionId, {
      anchor: { kind: 'unit', unitId: dialog.unitIds[0], view: 'waveform' },
      content: value,
      category: 'comment',
    });
  }
}
