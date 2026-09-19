import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { t, useLocale } from '../i18n';
import type { LexemeDocType } from '../types/jieyuDbDocTypes';
import { deleteLexiconEntry } from './lexicon/deleteLexiconEntry';
import {
  readPrimaryMultiLang,
  saveLexiconEntry,
  type LexiconEntryFields,
} from './lexicon/saveLexiconEntry';

export type LexiconEntryEditController = {
  fields: LexiconEntryFields;
  creating: boolean;
  saving: boolean;
  deleting: boolean;
  confirmDelete: boolean;
  error: string;
  saved: boolean;
  onFieldChange: (field: keyof LexiconEntryFields, value: string) => void;
  onStartCreate: () => void;
  onCancelCreate: () => void;
  onSave: () => void;
  onRequestDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
};

function fieldsFromLexeme(lexeme: LexemeDocType | null): LexiconEntryFields {
  return {
    lemma: readPrimaryMultiLang(lexeme?.lemma),
    gloss: readPrimaryMultiLang(lexeme?.senses[0]?.gloss),
    citationForm: (lexeme?.citationForm ?? '').trim(),
    language: (lexeme?.language ?? '').trim(),
    notes: readPrimaryMultiLang(lexeme?.notes),
  };
}

export type LexiconEntrySavedOptions = {
  select?: boolean;
};

export function useLexiconEntryEditController(input: {
  selectedLexeme: LexemeDocType | null;
  onSaved: (stored: LexemeDocType, options?: LexiconEntrySavedOptions) => void;
  onDeleted?: (lexemeId: string) => void;
}): LexiconEntryEditController {
  const { selectedLexeme, onSaved, onDeleted } = input;
  const locale = useLocale();
  const lastSavedIdRef = useRef<string | null>(null);
  const savingRef = useRef(false);
  const deletingRef = useRef(false);
  const creatingRef = useRef(false);
  const selectedLexemeIdRef = useRef<string | null>(selectedLexeme?.id ?? null);
  const [creating, setCreating] = useState(false);
  const [fields, setFields] = useState<LexiconEntryFields>(fieldsFromLexeme(selectedLexeme));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  creatingRef.current = creating;
  selectedLexemeIdRef.current = selectedLexeme?.id ?? null;
  const selectedLexemeRef = useRef(selectedLexeme);
  selectedLexemeRef.current = selectedLexeme;
  const selectedLexemeId = selectedLexeme?.id ?? '';

  useEffect(() => {
    if (creating) return;
    setFields(fieldsFromLexeme(selectedLexemeRef.current));
    setError('');
    setConfirmDelete(false);
    if (selectedLexemeId === lastSavedIdRef.current) return;
    setSaved(false);
  }, [creating, selectedLexemeId]);

  const onSave = useCallback(() => {
    if (savingRef.current) return;
    savingRef.current = true;
    const startedAsCreate = creating;
    const startedLexemeId = selectedLexeme?.id ?? null;
    setSaving(true);
    setError('');
    setSaved(false);
    void saveLexiconEntry({
      existing: startedAsCreate ? null : selectedLexeme,
      fields,
    })
      .then((stored) => {
        const stillCreating = creatingRef.current;
        const currentLexemeId = selectedLexemeIdRef.current;
        const shouldSelect =
          (startedAsCreate && stillCreating) ||
          (!startedAsCreate && !stillCreating && currentLexemeId === startedLexemeId);
        onSaved(stored, { select: shouldSelect });
        if (startedAsCreate && stillCreating) {
          lastSavedIdRef.current = stored.id;
          setCreating(false);
          setSaved(true);
          return;
        }
        if (!startedAsCreate && !stillCreating && currentLexemeId === startedLexemeId) {
          lastSavedIdRef.current = stored.id;
          setSaved(true);
        }
      })
      .catch((caught) => {
        const message =
          caught instanceof Error && caught.message === 'empty lemma'
            ? t(locale, 'workspace.lexicon.edit.lemmaRequired')
            : caught instanceof Error && caught.message.trim().length > 0
              ? caught.message
              : t(locale, 'workspace.lexicon.edit.saveFailed');
        setError(message);
      })
      .finally(() => {
        savingRef.current = false;
        setSaving(false);
      });
  }, [creating, fields, locale, onSaved, selectedLexeme]);

  const onConfirmDelete = useCallback(() => {
    if (deletingRef.current || creating || !selectedLexeme) return;
    deletingRef.current = true;
    const startedLexemeId = selectedLexeme.id;
    setDeleting(true);
    setError('');
    void deleteLexiconEntry(startedLexemeId)
      .then(() => {
        setConfirmDelete(false);
        if (selectedLexemeIdRef.current === startedLexemeId) {
          onDeleted?.(startedLexemeId);
        }
      })
      .catch((caught) => {
        const message =
          caught instanceof Error && caught.message.trim().length > 0
            ? caught.message === 'NOT_FOUND'
              ? t(locale, 'workspace.lexicon.edit.deleteFailed')
              : caught.message
            : t(locale, 'workspace.lexicon.edit.deleteFailed');
        setError(message);
        setConfirmDelete(false);
      })
      .finally(() => {
        deletingRef.current = false;
        setDeleting(false);
      });
  }, [creating, locale, onDeleted, selectedLexeme]);

  return useMemo(
    () => ({
      fields,
      creating,
      saving,
      deleting,
      confirmDelete,
      error,
      saved,
      onFieldChange: (field: keyof LexiconEntryFields, value: string) => {
        setSaved(false);
        setFields((prev) => ({ ...prev, [field]: value }));
      },
      onStartCreate: () => {
        setCreating(true);
        setFields(fieldsFromLexeme(null));
        setError('');
        setSaved(false);
        setConfirmDelete(false);
      },
      onCancelCreate: () => {
        setCreating(false);
        setFields(fieldsFromLexeme(selectedLexeme));
        setError('');
        setSaved(false);
        setConfirmDelete(false);
      },
      onSave,
      onRequestDelete: () => {
        if (creating || !selectedLexeme) return;
        setConfirmDelete(true);
      },
      onCancelDelete: () => {
        setConfirmDelete(false);
      },
      onConfirmDelete,
    }),
    [
      confirmDelete,
      creating,
      deleting,
      error,
      fields,
      onConfirmDelete,
      onSave,
      saved,
      saving,
      selectedLexeme,
    ],
  );
}
