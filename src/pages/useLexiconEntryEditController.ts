import { useEffect, useRef, useState } from 'react';
import { t, useLocale } from '../i18n';
import type { DmlexRelation, LexemeEntryDoc } from '../types/jieyuDbDocTypes';
import {
  emptyEntryFields,
  emptySenseDraft,
  fieldsFromEntry,
  type LexiconEntryFields,
  type LexiconSenseDraft,
} from '../utils/dmlexEntry';
import { newId } from '../utils/transcriptionFormatters';
import { deleteLexiconEntry } from './lexicon/deleteLexiconEntry';
import { saveLexiconEntry } from './lexicon/saveLexiconEntry';

export type LexiconEntryEditController = {
  fields: LexiconEntryFields;
  creating: boolean;
  saving: boolean;
  deleting: boolean;
  confirmDelete: boolean;
  saved: boolean;
  error: string;
  onFieldChange: (field: keyof Omit<LexiconEntryFields, 'senses'>, value: string) => void;
  onSenseChange: (index: number, field: keyof LexiconSenseDraft, value: string) => void;
  onAddSense: () => void;
  onAddSubsense: (index: number) => void;
  onMoveSense: (index: number, direction: -1 | 1) => void;
  onRemoveSense: (index: number) => void;
  onStartCreate: () => void;
  onCancelCreate: () => void;
  onSave: () => void;
  onRequestDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
};

function relationKey(relations: readonly DmlexRelation[]): string {
  return relations
    .map((relation) => `${relation.type}:${relation.members.map((member) => member.ref).join(',')}`)
    .join('|');
}

function moveSense(
  senses: LexiconSenseDraft[],
  index: number,
  direction: -1 | 1,
): LexiconSenseDraft[] {
  const target = index + direction;
  if (target < 0 || target >= senses.length) return senses;
  const next = senses.slice();
  const current = next[index];
  const other = next[target];
  if (!current || !other) return senses;
  next[index] = other;
  next[target] = current;
  return next;
}

function removeSense(senses: LexiconSenseDraft[], index: number): LexiconSenseDraft[] {
  const removed = senses[index];
  if (!removed) return senses;
  return senses
    .filter((_, senseIndex) => senseIndex !== index)
    .map((sense) =>
      sense.parentId === removed.id ? { ...sense, parentId: removed.parentId } : sense,
    );
}

export function useLexiconEntryEditController(input: {
  selectedLexeme: LexemeEntryDoc | null;
  relations?: readonly DmlexRelation[];
  onSaved: (stored: LexemeEntryDoc) => void;
  onDeleted: (lexemeId: string) => void;
}): LexiconEntryEditController {
  const locale = useLocale();
  const relations = input.relations ?? [];
  const [fields, setFields] = useState<LexiconEntryFields>(emptyEntryFields);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const fieldsRef = useRef(fields);
  const creatingRef = useRef(false);
  const savingRef = useRef(false);
  const dirtyRef = useRef(false);
  const sessionRef = useRef<string | null>(null);
  const relationsRef = useRef(relations);
  const selectedRef = useRef(input.selectedLexeme);
  fieldsRef.current = fields;
  creatingRef.current = creating;
  relationsRef.current = relations;
  selectedRef.current = input.selectedLexeme;
  const selectedId = input.selectedLexeme?.id ?? '';
  const relationsSignature = relationKey(relations);

  useEffect(() => {
    if (creatingRef.current) return;
    if (dirtyRef.current && sessionRef.current === selectedId) return;
    sessionRef.current = selectedId;
    dirtyRef.current = false;
    setFields(fieldsFromEntry(selectedRef.current, relationsRef.current));
    setSaved(false);
    setError('');
    setConfirmDelete(false);
  }, [relationsSignature, selectedId]);

  function markDirty(next: LexiconEntryFields) {
    dirtyRef.current = true;
    fieldsRef.current = next;
    setFields(next);
    setSaved(false);
  }

  return {
    fields,
    creating,
    saving,
    deleting,
    confirmDelete,
    saved,
    error,
    onFieldChange: (field, value) => {
      markDirty({ ...fieldsRef.current, [field]: value });
    },
    onSenseChange: (index, field, value) => {
      const senses = fieldsRef.current.senses.map((sense, senseIndex) =>
        senseIndex === index ? { ...sense, [field]: value } : sense,
      );
      markDirty({ ...fieldsRef.current, senses });
    },
    onAddSense: () => {
      markDirty({
        ...fieldsRef.current,
        senses: [...fieldsRef.current.senses, { ...emptySenseDraft(), id: newId('sense') }],
      });
    },
    onAddSubsense: (index) => {
      const parent = fieldsRef.current.senses[index];
      if (!parent) return;
      const parentId = parent.id.trim() || newId('sense');
      const senses = fieldsRef.current.senses.map((sense, senseIndex) =>
        senseIndex === index ? { ...sense, id: parentId } : sense,
      );
      markDirty({
        ...fieldsRef.current,
        senses: [...senses, { ...emptySenseDraft(), id: newId('sense'), parentId }],
      });
    },
    onMoveSense: (index, direction) => {
      markDirty({
        ...fieldsRef.current,
        senses: moveSense(fieldsRef.current.senses, index, direction),
      });
    },
    onRemoveSense: (index) => {
      const senses = removeSense(fieldsRef.current.senses, index);
      markDirty({
        ...fieldsRef.current,
        senses: senses.length > 0 ? senses : [emptySenseDraft()],
      });
    },
    onStartCreate: () => {
      creatingRef.current = true;
      dirtyRef.current = true;
      setCreating(true);
      setSaved(false);
      setError('');
      setConfirmDelete(false);
      const next = emptyEntryFields();
      fieldsRef.current = next;
      setFields(next);
    },
    onCancelCreate: () => {
      creatingRef.current = false;
      dirtyRef.current = false;
      sessionRef.current = null;
      setCreating(false);
      setFields(fieldsFromEntry(input.selectedLexeme, relations));
    },
    onSave: () => {
      if (savingRef.current) return;
      const current = fieldsRef.current;
      if (current.headword.trim().length === 0) {
        setError(t(locale, 'workspace.lexicon.edit.headwordRequired'));
        return;
      }
      savingRef.current = true;
      setSaving(true);
      setError('');
      const wasCreating = creatingRef.current;
      void saveLexiconEntry({
        existing: wasCreating ? null : input.selectedLexeme,
        fields: current,
      })
        .then((stored) => {
          if (wasCreating) {
            creatingRef.current = false;
            setCreating(false);
          }
          dirtyRef.current = false;
          sessionRef.current = stored.id;
          setSaved(true);
          input.onSaved(stored);
        })
        .catch((reason: unknown) => {
          setError(
            reason instanceof Error
              ? reason.message
              : t(locale, 'workspace.lexicon.edit.saveFailed'),
          );
        })
        .finally(() => {
          savingRef.current = false;
          setSaving(false);
        });
    },
    onRequestDelete: () => setConfirmDelete(true),
    onCancelDelete: () => setConfirmDelete(false),
    onConfirmDelete: () => {
      const id = input.selectedLexeme?.id ?? '';
      if (id.length === 0 || deleting) return;
      setDeleting(true);
      setError('');
      void deleteLexiconEntry(id)
        .then(() => {
          setConfirmDelete(false);
          input.onDeleted(id);
        })
        .catch((reason: unknown) => {
          setError(
            reason instanceof Error
              ? reason.message
              : t(locale, 'workspace.lexicon.edit.deleteFailed'),
          );
        })
        .finally(() => setDeleting(false));
    },
  };
}
