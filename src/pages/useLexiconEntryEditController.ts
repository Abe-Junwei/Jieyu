import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { t, useLocale } from '../i18n';
import type { LexemeDocType } from '../types/jieyuDbDocTypes';
import { deleteLexiconEntry } from './lexicon/deleteLexiconEntry';
import {
  readPrimaryMultiLang,
  saveLexiconEntry,
  type LexiconEntryFields,
  type LexiconEntryScalarField,
} from './lexicon/saveLexiconEntry';

export type LexiconEntryEditController = {
  fields: LexiconEntryFields;
  creating: boolean;
  saving: boolean;
  deleting: boolean;
  confirmDelete: boolean;
  saved: boolean;
  error: string;
  onFieldChange: (field: LexiconEntryScalarField, value: string) => void;
  onExtraSenseChange: (index: number, field: 'gloss' | 'definition', value: string) => void;
  onAddExtraSense: () => void;
  onRemoveExtraSense: (index: number) => void;
  onFormChange: (index: number, value: string) => void;
  onAddForm: () => void;
  onRemoveForm: (index: number) => void;
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
    extraSenses: (lexeme?.senses.slice(1) ?? []).map((sense) => ({
      gloss: readPrimaryMultiLang(sense.gloss),
      definition: readPrimaryMultiLang(sense.definition),
    })),
    forms: (lexeme?.forms ?? []).map((form) =>
      readPrimaryMultiLang(form.transcription as Parameters<typeof readPrimaryMultiLang>[0]),
    ),
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
      onFieldChange: (field, value) => {
        setSaved(false);
        setFields((prev) => ({ ...prev, [field]: value }));
      },
      onExtraSenseChange: (index, field, value) => {
        setSaved(false);
        setFields((prev) => ({
          ...prev,
          extraSenses: prev.extraSenses.map((sense, senseIndex) =>
            senseIndex === index ? { ...sense, [field]: value } : sense,
          ),
        }));
      },
      onAddExtraSense: () => {
        setSaved(false);
        setFields((prev) => ({
          ...prev,
          extraSenses: [...prev.extraSenses, { gloss: '', definition: '' }],
        }));
      },
      onRemoveExtraSense: (index) => {
        setSaved(false);
        setFields((prev) => ({
          ...prev,
          extraSenses: prev.extraSenses.filter((_, senseIndex) => senseIndex !== index),
        }));
      },
      onFormChange: (index, value) => {
        setSaved(false);
        setFields((prev) => ({
          ...prev,
          forms: prev.forms.map((form, formIndex) => (formIndex === index ? value : form)),
        }));
      },
      onAddForm: () => {
        setSaved(false);
        setFields((prev) => ({ ...prev, forms: [...prev.forms, ''] }));
      },
      onRemoveForm: (index) => {
        setSaved(false);
        setFields((prev) => ({
          ...prev,
          forms: prev.forms.filter((_, formIndex) => formIndex !== index),
        }));
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
