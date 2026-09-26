import { useCallback, useMemo, useRef, useState } from 'react';
import { t, useLocale } from '../i18n';
import type { LexemeDocType } from '../types/jieyuDbDocTypes';
import {
  demoteSense,
  descendantDraftIndexes,
  moveSenseSiblingBlock,
  promoteSense,
  readSenseId,
  readSenseParentId,
} from '../utils/lexemeSenseTree';
import { newId } from '../utils/transcriptionFormatters';
import { deleteLexiconEntry } from './lexicon/deleteLexiconEntry';
import {
  draftIdFromNested,
  exampleDraftsFromStored,
  readPrimaryMultiLang,
  saveLexiconEntry,
  withAddedExample,
  withExampleChange,
  withoutExample,
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
  onExtraSenseChange: (
    index: number,
    field:
      | 'gloss'
      | 'definition'
      | 'category'
      | 'scientificName'
      | 'anthropologyNote'
      | 'discourseNote'
      | 'encyclopedicNote'
      | 'grammarNote',
    value: string,
  ) => void;
  onExampleChange: (
    sense: 'primary' | number,
    index: number,
    field: 'source' | 'translation',
    value: string,
  ) => void;
  onAddExample: (sense: 'primary' | number) => void;
  onRemoveExample: (sense: 'primary' | number, index: number) => void;
  onAddExtraSense: () => void;
  onAddSubsense: (parent: 'primary' | number) => void;
  onMoveExtraSense: (index: number, direction: -1 | 1) => void;
  onPromoteExtraSense: (index: number) => void;
  onDemoteExtraSense: (index: number) => void;
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

function applyExtraSenseDemote(prev: LexiconEntryFields, index: number): LexiconEntryFields {
  const row = prev.extraSenses[index];
  if (!row) return prev;
  const parent = readSenseParentId(row);
  const siblings = prev.extraSenses.flatMap((sense, senseIndex) =>
    readSenseParentId(sense) === parent ? [senseIndex] : [],
  );
  const position = siblings.indexOf(index);
  const previousIndex = position > 0 ? siblings[position - 1] : undefined;
  let extraSenses = prev.extraSenses;
  let primarySenseId = prev.primarySenseId ?? '';
  if (previousIndex === undefined) {
    if (parent.length > 0) return prev;
    if (primarySenseId.length === 0) primarySenseId = newId('sense');
  } else if (readSenseId(extraSenses[previousIndex] ?? {}).length === 0) {
    const siblingId = newId('sense');
    extraSenses = extraSenses.map((sense, senseIndex) =>
      senseIndex === previousIndex ? { ...sense, id: siblingId } : sense,
    );
  }
  const next = demoteSense(extraSenses, index, primarySenseId);
  if (next === extraSenses) return prev;
  return {
    ...prev,
    ...(primarySenseId.length > 0 ? { primarySenseId } : {}),
    extraSenses: [...next],
  };
}

function fieldsFromLexeme(lexeme: LexemeDocType | null): LexiconEntryFields {
  const primaryId = typeof lexeme?.senses[0]?.id === 'string' ? lexeme.senses[0].id.trim() : '';
  return {
    lemma: readPrimaryMultiLang(lexeme?.lemma),
    gloss: readPrimaryMultiLang(lexeme?.senses[0]?.gloss),
    category:
      typeof lexeme?.senses[0]?.category === 'string' ? lexeme.senses[0].category.trim() : '',
    scientificName:
      typeof lexeme?.senses[0]?.scientificName === 'string'
        ? lexeme.senses[0].scientificName.trim()
        : '',
    anthropologyNote:
      typeof lexeme?.senses[0]?.anthropologyNote === 'string'
        ? lexeme.senses[0].anthropologyNote.trim()
        : '',
    discourseNote:
      typeof lexeme?.senses[0]?.discourseNote === 'string'
        ? lexeme.senses[0].discourseNote.trim()
        : '',
    encyclopedicNote:
      typeof lexeme?.senses[0]?.encyclopedicNote === 'string'
        ? lexeme.senses[0].encyclopedicNote.trim()
        : '',
    grammarNote:
      typeof lexeme?.senses[0]?.grammarNote === 'string' ? lexeme.senses[0].grammarNote.trim() : '',
    citationForm: (lexeme?.citationForm ?? '').trim(),
    language: (lexeme?.language ?? '').trim(),
    notes: readPrimaryMultiLang(lexeme?.notes),
    lexemeType: (lexeme?.lexemeType ?? '').trim(),
    pronunciation: (lexeme?.pronunciation ?? '').trim(),
    etymologyForm: (lexeme?.etymology?.form ?? '').trim(),
    etymologyGloss: (lexeme?.etymology?.gloss ?? '').trim(),
    etymologySourceLanguage: (lexeme?.etymology?.sourceLanguage ?? '').trim(),
    literalMeaning: (lexeme?.literalMeaning ?? '').trim(),
    summaryDefinition: (lexeme?.summaryDefinition ?? '').trim(),
    bibliography: (lexeme?.bibliography ?? '').trim(),
    restrictions: (lexeme?.restrictions ?? '').trim(),
    ...(primaryId.length > 0 ? { primarySenseId: primaryId } : {}),
    examples: exampleDraftsFromStored(lexeme?.senses[0]?.examples),
    extraSenses: (lexeme?.senses.slice(1) ?? []).map((sense) => {
      const parentId = readSenseParentId(sense);
      const examples = exampleDraftsFromStored(sense.examples);
      return {
        ...draftIdFromNested(sense.id),
        ...(parentId.length > 0 ? { parentId } : {}),
        gloss: readPrimaryMultiLang(sense.gloss),
        definition: readPrimaryMultiLang(sense.definition),
        ...(typeof sense.category === 'string' && sense.category.trim().length > 0
          ? { category: sense.category.trim() }
          : {}),
        ...(typeof sense.scientificName === 'string' && sense.scientificName.trim().length > 0
          ? { scientificName: sense.scientificName.trim() }
          : {}),
        ...(typeof sense.anthropologyNote === 'string' && sense.anthropologyNote.trim().length > 0
          ? { anthropologyNote: sense.anthropologyNote.trim() }
          : {}),
        ...(typeof sense.discourseNote === 'string' && sense.discourseNote.trim().length > 0
          ? { discourseNote: sense.discourseNote.trim() }
          : {}),
        ...(typeof sense.encyclopedicNote === 'string' && sense.encyclopedicNote.trim().length > 0
          ? { encyclopedicNote: sense.encyclopedicNote.trim() }
          : {}),
        ...(typeof sense.grammarNote === 'string' && sense.grammarNote.trim().length > 0
          ? { grammarNote: sense.grammarNote.trim() }
          : {}),
        ...(examples.length > 0 ? { examples } : {}),
      };
    }),
    forms: (lexeme?.forms ?? []).map((form) => ({
      ...draftIdFromNested(form.id),
      transcription: readPrimaryMultiLang(
        form.transcription as Parameters<typeof readPrimaryMultiLang>[0],
      ),
    })),
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
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;
  const selectedLexemeId = selectedLexeme?.id ?? '';
  const fieldsSyncKeyRef = useRef<string | null>(selectedLexemeId);

  // Sync fields in render (not an effect) so the form never paints the previous
  // lexeme/empty draft before selection is applied. An effect left a window where
  // add-sense / lemma edits were wiped when selectedLexemeId first landed.
  if (creating) {
    fieldsSyncKeyRef.current = null;
  } else if (fieldsSyncKeyRef.current !== selectedLexemeId) {
    fieldsSyncKeyRef.current = selectedLexemeId;
    const nextFields = fieldsFromLexeme(selectedLexeme);
    fieldsRef.current = nextFields;
    setFields(nextFields);
    setError('');
    setConfirmDelete(false);
    if (selectedLexemeId !== lastSavedIdRef.current) {
      setSaved(false);
    }
  }

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
      fields: fieldsRef.current,
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
  }, [creating, locale, onSaved, selectedLexeme]);

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
      onExampleChange: (sense, index, field, value) => {
        setSaved(false);
        setFields((prev) => {
          if (sense === 'primary') {
            return { ...prev, examples: withExampleChange(prev.examples, index, field, value) };
          }
          return {
            ...prev,
            extraSenses: prev.extraSenses.map((row, senseIndex) =>
              senseIndex === sense
                ? { ...row, examples: withExampleChange(row.examples, index, field, value) }
                : row,
            ),
          };
        });
      },
      onAddExample: (sense) => {
        setSaved(false);
        setFields((prev) => {
          if (sense === 'primary') {
            return { ...prev, examples: withAddedExample(prev.examples) };
          }
          return {
            ...prev,
            extraSenses: prev.extraSenses.map((row, senseIndex) =>
              senseIndex === sense ? { ...row, examples: withAddedExample(row.examples) } : row,
            ),
          };
        });
      },
      onRemoveExample: (sense, index) => {
        setSaved(false);
        setFields((prev) => {
          if (sense === 'primary') {
            return { ...prev, examples: withoutExample(prev.examples, index) };
          }
          return {
            ...prev,
            extraSenses: prev.extraSenses.map((row, senseIndex) =>
              senseIndex === sense
                ? { ...row, examples: withoutExample(row.examples, index) }
                : row,
            ),
          };
        });
      },
      onAddExtraSense: () => {
        setSaved(false);
        setFields((prev) => ({
          ...prev,
          extraSenses: [...prev.extraSenses, { id: newId('sense'), gloss: '', definition: '' }],
        }));
      },
      onAddSubsense: (parent) => {
        setSaved(false);
        setFields((prev) => {
          const primarySenseId = prev.primarySenseId ?? newId('sense');
          const parentId =
            parent === 'primary'
              ? primarySenseId
              : (prev.extraSenses[parent]?.id ?? newId('sense'));
          const extraSenses = prev.extraSenses.map((sense, index) =>
            parent === index && (sense.id ?? '').trim().length === 0
              ? { ...sense, id: parentId }
              : sense,
          );
          return {
            ...prev,
            primarySenseId,
            extraSenses: [
              ...extraSenses,
              { id: newId('sense'), parentId, gloss: '', definition: '' },
            ],
          };
        });
      },
      onMoveExtraSense: (index, direction) => {
        setSaved(false);
        setFields((prev) => {
          const extraSenses = moveSenseSiblingBlock(prev.extraSenses, index, direction);
          if (extraSenses === prev.extraSenses) return prev;
          return { ...prev, extraSenses: [...extraSenses] };
        });
      },
      onPromoteExtraSense: (index) => {
        setSaved(false);
        setFields((prev) => {
          const extraSenses = promoteSense(prev.extraSenses, index, prev.primarySenseId ?? '');
          if (extraSenses === prev.extraSenses) return prev;
          return { ...prev, extraSenses: [...extraSenses] };
        });
      },
      onDemoteExtraSense: (index) => {
        setSaved(false);
        setFields((prev) => applyExtraSenseDemote(prev, index));
      },
      onRemoveExtraSense: (index) => {
        setSaved(false);
        setFields((prev) => {
          const drop = new Set(descendantDraftIndexes(prev.extraSenses, index));
          return {
            ...prev,
            extraSenses: prev.extraSenses.filter((_, senseIndex) => !drop.has(senseIndex)),
          };
        });
      },
      onFormChange: (index, value) => {
        setSaved(false);
        setFields((prev) => ({
          ...prev,
          forms: prev.forms.map((form, formIndex) =>
            formIndex === index ? { ...form, transcription: value } : form,
          ),
        }));
      },
      onAddForm: () => {
        setSaved(false);
        setFields((prev) => ({ ...prev, forms: [...prev.forms, { transcription: '' }] }));
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
