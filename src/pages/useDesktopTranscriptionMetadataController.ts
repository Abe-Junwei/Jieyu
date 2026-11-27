import { persistMetadataNote } from './desktopTranscriptionMetadataWrites';
import { useEffect, useRef, useState } from 'react';
import { createDesktopClient } from '../app/desktopProjectReadPageAccess';
import type { ViewScopeWrite } from '../app/desktopProjectReadPageAccess';
import type { DesktopReadHost } from '../desktop/projectReadHost';
import { useToast } from '../contexts/ToastContext';
import { t, type Locale } from '../i18n';
import type { UnitSelfCertainty } from '../utils/unitSelfCertainty';
import {
  sharedSelfCertainty,
  notesForUnits,
  type NotesDialogState,
} from './desktopTranscriptionMetadata';
import type { UnitNote } from './useDesktopProjectReadQueries';

export type { NotesDialogState } from './desktopTranscriptionMetadata';

/** Certainty + notes write path for the desktop transcription workspace (1b-6c). */
export function useDesktopTranscriptionMetadataController(input: {
  locale: Locale;
  sessionId: string | null;
  manuscriptId?: string | null;
  desktopCall: DesktopReadHost['desktopCall'] | undefined;
  textLayerId: string | null;
  layerName: string;
  layerNameOf?: (layerId: string | null) => string;
  orthographyLabel: string;
  selectedUnitIds: readonly string[];
  certaintyOf: (
    unitId: string,
    textLayerId?: string | null,
  ) => UnitSelfCertainty | null | undefined;
  writeScope: (affectedUnitIds: readonly string[]) => ViewScopeWrite;
  reload: () => Promise<unknown>;
  refetchNotes: (sessionId: string) => Promise<readonly UnitNote[]>;
  listNotesForUnits: (unitIds: readonly string[]) => UnitNote[];
}) {
  const toast = useToast();
  const live = useRef(input);
  live.current = input;
  const [notesDialog, setNotesDialog] = useState<NotesDialogState>(null);
  const [certaintyOpen, setCertaintyOpen] = useState(false);
  const scopeKey = `${input.sessionId}:${input.manuscriptId ?? ''}:${input.textLayerId}`;
  const seen = useRef(scopeKey);
  seen.current = scopeKey;
  const dialogRef = useRef(notesDialog);
  dialogRef.current = notesDialog;
  const saving = useRef(false);

  useEffect(() => {
    setNotesDialog(null);
    setCertaintyOpen(false);
  }, [scopeKey]);

  function client() {
    const current = live.current;
    if (current.sessionId === null || current.desktopCall === undefined) return null;
    return {
      sessionId: current.sessionId,
      api: createDesktopClient({ desktopCall: current.desktopCall }),
    };
  }

  async function setCertainty(
    value: UnitSelfCertainty | null,
    layerId = live.current.textLayerId,
    targets = live.current.selectedUnitIds,
  ) {
    const current = live.current;
    const call = client();
    const unitIds = [...targets];
    const textLayerId = layerId;
    if (call === null || unitIds.length === 0 || textLayerId === null) return;
    setCertaintyOpen(false);
    try {
      if (unitIds.length === 1) {
        await call.api.setUnitSelfCertainty(call.sessionId, {
          unitId: unitIds[0]!,
          textLayerId,
          selfCertainty: value,
          ...current.writeScope(unitIds),
        });
      } else {
        await call.api.setUnitSelfCertaintyMany(call.sessionId, {
          unitIds,
          textLayerId,
          selfCertainty: value,
          ...current.writeScope(unitIds),
        });
      }
      if (seen.current !== scopeKey) return;
      await current.reload();
    } catch {
      if (seen.current !== scopeKey) return;
      toast.showToast(t(current.locale, 'app.desktopTranscription.metadataFailed'), 'error');
    }
  }

  function openNotesList(
    layerId = live.current.textLayerId,
    targets = live.current.selectedUnitIds,
  ) {
    const current = live.current;
    const unitIds = [...targets];
    if (unitIds.length === 0) return;
    if (unitIds.length > 1) {
      setNotesDialog({
        mode: 'batch',
        unitIds,
        textLayerId: layerId,
        layerName: current.layerNameOf?.(layerId) ?? current.layerName,
        orthographyLabel: current.orthographyLabel,
        noteId: null,
        draft: '',
        failed: false,
      });
      return;
    }
    setNotesDialog({
      mode: 'list',
      unitIds,
      textLayerId: layerId,
      layerName: current.layerNameOf?.(layerId) ?? current.layerName,
      orthographyLabel: current.orthographyLabel,
      notes: notesForUnits(current.listNotesForUnits(unitIds), unitIds, layerId),
    });
  }

  function openAddNote() {
    const current = live.current;
    const unitIds = notesDialog?.unitIds ?? [...current.selectedUnitIds];
    if (unitIds.length === 0) return;
    setNotesDialog({
      mode: unitIds.length > 1 ? 'batch' : 'add',
      unitIds,
      textLayerId: notesDialog === null ? current.textLayerId : notesDialog.textLayerId,
      layerName: notesDialog?.layerName ?? current.layerName,
      orthographyLabel: current.orthographyLabel,
      noteId: null,
      draft: '',
      failed: false,
    });
  }

  function openEditNote(note: UnitNote) {
    const current = live.current;
    const unitIds = notesDialog?.unitIds ?? [...current.selectedUnitIds];
    setNotesDialog({
      mode: 'edit',
      unitIds,
      textLayerId: notesDialog === null ? current.textLayerId : notesDialog.textLayerId,
      layerName: notesDialog?.layerName ?? current.layerName,
      orthographyLabel: current.orthographyLabel,
      noteId: note.id,
      draft: note.text,
      content: note.content,
      failed: false,
    });
  }

  function closeNotes() {
    setNotesDialog(null);
  }

  function setNoteDraft(draft: string) {
    setNotesDialog((prev) =>
      prev !== null && (prev.mode === 'edit' || prev.mode === 'add' || prev.mode === 'batch')
        ? { ...prev, draft, failed: false }
        : prev,
    );
  }

  async function saveNote() {
    const current = live.current;
    const dialog = notesDialog;
    const call = client();
    if (
      call === null ||
      dialog === null ||
      (dialog.mode !== 'edit' && dialog.mode !== 'add' && dialog.mode !== 'batch')
    ) {
      return;
    }
    if (saving.current) return;
    const text = dialog.draft.trim();
    if (text.length === 0) return;
    const value = { ...dialog.content, default: text };
    saving.current = true;
    const stillCurrent = () => seen.current === scopeKey && dialogRef.current === dialog;
    try {
      await persistMetadataNote(call.api, call.sessionId, dialog, value, current.writeScope);
      if (!stillCurrent()) return;
      const fresh = await current.refetchNotes(call.sessionId);
      await current.reload();
      if (!stillCurrent()) return;
      if (dialog.mode === 'batch' || dialog.unitIds.length !== 1) {
        setNotesDialog(null);
        return;
      }
      setNotesDialog({
        mode: 'list',
        unitIds: dialog.unitIds,
        textLayerId: dialog.textLayerId,
        layerName: dialog.layerName,
        orthographyLabel: dialog.orthographyLabel,
        notes: notesForUnits(fresh, dialog.unitIds, dialog.textLayerId),
      });
    } catch {
      if (!stillCurrent()) return;
      setNotesDialog({ ...dialog, failed: true });
    } finally {
      saving.current = false;
    }
  }

  async function deleteNote(noteId: string) {
    const current = live.current;
    const call = client();
    const dialog = notesDialog;
    if (call === null || dialog === null || dialog.mode !== 'list') return;
    try {
      await call.api.deleteNote(call.sessionId, noteId);
      if (seen.current !== scopeKey) return;
      const fresh = await current.refetchNotes(call.sessionId);
      if (seen.current !== scopeKey || dialogRef.current !== dialog) return;
      setNotesDialog({
        ...dialog,
        notes: notesForUnits(fresh, dialog.unitIds, dialog.textLayerId),
      });
    } catch {
      if (seen.current !== scopeKey) return;
      toast.showToast(t(current.locale, 'app.desktopTranscription.metadataFailed'), 'error');
    }
  }

  const certainty = sharedSelfCertainty(input.selectedUnitIds.map((id) => input.certaintyOf(id)));
  const toggleCertainty = () => setCertaintyOpen((open) => !open);
  const laneMetadataFor = (layerId: string, unitIds: readonly string[]) => ({
    selectedCount: unitIds.length,
    certaintyOpen,
    certainty: sharedSelfCertainty(unitIds.map((id) => input.certaintyOf(id, layerId))),
    onToggleCertainty: toggleCertainty,
    onPickCertainty: (value: UnitSelfCertainty | null) =>
      void setCertainty(value, layerId, unitIds),
    onOpenNotes: () => openNotesList(layerId, unitIds),
  });
  return {
    laneMetadataFor,
    laneMetadata: laneMetadataFor(input.textLayerId ?? '', input.selectedUnitIds),
    notesDialogBindings: {
      state: notesDialog,
      onClose: closeNotes,
      onAdd: openAddNote,
      onEdit: openEditNote,
      onDelete: (noteId: string) => void deleteNote(noteId),
      onDraft: setNoteDraft,
      onSave: () => void saveNote(),
      onBackToList: () =>
        openNotesList(
          notesDialog === null ? live.current.textLayerId : notesDialog.textLayerId,
          notesDialog?.unitIds ?? live.current.selectedUnitIds,
        ),
    },
    waveMetadata: {
      onOpenNotes: () => openNotesList(null),
      certaintyOpen,
      certainty,
      onToggleCertainty: toggleCertainty,
      onPickCertainty: (value: UnitSelfCertainty | null) => void setCertainty(value),
    },
  };
}
