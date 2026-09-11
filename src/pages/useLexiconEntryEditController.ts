import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { t, useLocale } from '../i18n';
import type { LexemeDocType } from '../types/jieyuDbDocTypes';
import {
  readPrimaryMultiLang,
  saveLexiconEntry,
  type LexiconEntryFields,
} from './lexicon/saveLexiconEntry';

export type LexiconEntryEditController = {
  fields: LexiconEntryFields;
  creating: boolean;
  saving: boolean;
  error: string;
  saved: boolean;
  onFieldChange: (field: keyof LexiconEntryFields, value: string) => void;
  onStartCreate: () => void;
  onCancelCreate: () => void;
  onSave: () => void;
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

export function useLexiconEntryEditController(input: {
  selectedLexeme: LexemeDocType | null;
  onSaved: (stored: LexemeDocType) => void;
}): LexiconEntryEditController {
  const { selectedLexeme, onSaved } = input;
  const locale = useLocale();
  const lastSavedIdRef = useRef<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [fields, setFields] = useState<LexiconEntryFields>(fieldsFromLexeme(selectedLexeme));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (creating) return;
    setFields(fieldsFromLexeme(selectedLexeme));
    setError('');
    if (selectedLexeme?.id === lastSavedIdRef.current) return;
    setSaved(false);
  }, [creating, selectedLexeme]);

  const onSave = useCallback(() => {
    setSaving(true);
    setError('');
    setSaved(false);
    void saveLexiconEntry({
      existing: creating ? null : selectedLexeme,
      fields,
    })
      .then((stored) => {
        lastSavedIdRef.current = stored.id;
        setCreating(false);
        setSaved(true);
        onSaved(stored);
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
        setSaving(false);
      });
  }, [creating, fields, locale, onSaved, selectedLexeme]);

  return useMemo(
    () => ({
      fields,
      creating,
      saving,
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
      },
      onCancelCreate: () => {
        setCreating(false);
        setFields(fieldsFromLexeme(selectedLexeme));
        setError('');
        setSaved(false);
      },
      onSave,
    }),
    [creating, error, fields, onSave, saved, saving, selectedLexeme],
  );
}
