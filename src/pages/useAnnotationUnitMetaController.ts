import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { t, useLocale } from '../i18n';
import type { NoteCategory } from '../types/jieyuDbDocTypes';
import type { UnitSelfCertainty } from '../utils/unitSelfCertainty';
import type { AnnotationIgtRow } from './annotation/annotationIgtRows';
import {
  ANNOTATION_NOTE_CATEGORIES,
  listAnnotationUnitNotes,
  saveAnnotationUnitNote,
  saveAnnotationUnitSelfCertainty,
} from './annotation/saveAnnotationUnitMeta';
import type { AnnotationSaveNotice } from './useAnnotationWorkspaceController';

export type AnnotationUnitMetaController = {
  noteText: string;
  noteCategory: NoteCategory;
  noteCategories: readonly NoteCategory[];
  selfCertainty: UnitSelfCertainty | '';
  saveNotice: AnnotationSaveNotice;
  onNoteTextChange: (value: string) => void;
  onNoteCategoryChange: (value: NoteCategory) => void;
  onSaveNote: () => void;
  onSelfCertaintyChange: (value: UnitSelfCertainty | '') => void;
};

export function useAnnotationUnitMetaController(input: {
  textId: string;
  focusedUnitId: string;
  rows: readonly AnnotationIgtRow[];
  reloadWorkspace: () => Promise<unknown>;
}): AnnotationUnitMetaController {
  const { textId, focusedUnitId, rows, reloadWorkspace } = input;
  const locale = useLocale();
  const queryClient = useQueryClient();
  const focusedUnitIdRef = useRef(focusedUnitId);
  const draftEpochRef = useRef(0);
  const [noteText, setNoteText] = useState('');
  const [noteCategory, setNoteCategory] = useState<NoteCategory>('comment');
  const [edited, setEdited] = useState(false);
  const [saveNotice, setSaveNotice] = useState<AnnotationSaveNotice>({ kind: 'idle', message: '' });

  useEffect(() => {
    focusedUnitIdRef.current = focusedUnitId;
    draftEpochRef.current = 0;
    setEdited(false);
    setNoteText('');
    setNoteCategory('comment');
  }, [focusedUnitId]);

  const notesQuery = useQuery({
    queryKey: ['annotation-unit-note', focusedUnitId],
    queryFn: () => listAnnotationUnitNotes(focusedUnitId),
    enabled: focusedUnitId.length > 0,
  });

  const stored = notesQuery.data?.[0];
  const displayedText = edited ? noteText : (stored?.content ?? '');
  const displayedCategory = edited ? noteCategory : (stored?.category ?? 'comment');
  const focusedRow = rows.find((row) => row.id === focusedUnitId);
  const selfCertainty = focusedRow?.selfCertainty ?? '';

  const fail = useCallback(
    (error: unknown) => {
      const message =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : t(locale, 'workspace.annotation.saveError');
      setSaveNotice({ kind: 'error', message });
    },
    [locale],
  );

  const onSaveNote = useCallback(() => {
    if (focusedUnitId.length === 0) return;
    const savingUnitId = focusedUnitId;
    const content = displayedText;
    const category = displayedCategory;
    const noteId = stored?.id;
    const draftEpochAtSave = draftEpochRef.current;
    setSaveNotice({ kind: 'saving', message: '' });
    void saveAnnotationUnitNote({
      unitId: savingUnitId,
      content,
      category,
      ...(noteId ? { noteId } : {}),
    })
      .then(async () => {
        await queryClient.invalidateQueries({ queryKey: ['annotation-unit-note', savingUnitId] });
        if (focusedUnitIdRef.current !== savingUnitId) return;
        if (draftEpochRef.current !== draftEpochAtSave) return;
        setEdited(false);
        setSaveNotice({ kind: 'saved', message: '' });
      })
      .catch((error) => {
        if (focusedUnitIdRef.current !== savingUnitId) return;
        fail(error);
      });
  }, [displayedCategory, displayedText, fail, focusedUnitId, queryClient, stored?.id]);

  const onSelfCertaintyChange = useCallback(
    (value: UnitSelfCertainty | '') => {
      if (textId.length === 0 || focusedUnitId.length === 0) return;
      const savingUnitId = focusedUnitId;
      setSaveNotice({ kind: 'saving', message: '' });
      void saveAnnotationUnitSelfCertainty({
        textId,
        unitId: savingUnitId,
        selfCertainty: value === '' ? null : value,
      })
        .then(async () => {
          await reloadWorkspace();
          if (focusedUnitIdRef.current !== savingUnitId) return;
          setSaveNotice({ kind: 'saved', message: '' });
        })
        .catch((error) => {
          if (focusedUnitIdRef.current !== savingUnitId) return;
          fail(error);
        });
    },
    [fail, focusedUnitId, reloadWorkspace, textId],
  );

  return useMemo(
    () => ({
      noteText: displayedText,
      noteCategory: displayedCategory,
      noteCategories: ANNOTATION_NOTE_CATEGORIES,
      selfCertainty,
      saveNotice,
      onNoteTextChange: (value: string) => {
        draftEpochRef.current += 1;
        setEdited(true);
        setNoteText(value);
      },
      onNoteCategoryChange: (value: NoteCategory) => {
        draftEpochRef.current += 1;
        setEdited(true);
        setNoteCategory(value);
      },
      onSaveNote,
      onSelfCertaintyChange,
    }),
    [
      displayedCategory,
      displayedText,
      onSaveNote,
      onSelfCertaintyChange,
      saveNotice,
      selfCertainty,
    ],
  );
}
