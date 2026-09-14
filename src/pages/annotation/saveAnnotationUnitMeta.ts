import { LinguisticService } from '../../app/languageAssetPageAccess';
import type { LayerUnitDocType, NoteCategory, UserNoteDocType } from '../../types/jieyuDbDocTypes';
import { newId } from '../../utils/transcriptionFormatters';
import type { UnitSelfCertainty } from '../../utils/unitSelfCertainty';
import { UNIT_SELF_CERTAINTY_VALUES } from '../../utils/unitSelfCertainty';

export const ANNOTATION_NOTE_CATEGORIES: readonly NoteCategory[] = [
  'comment',
  'question',
  'todo',
  'linguistic',
  'fieldwork',
  'correction',
];

export type AnnotationUnitNoteView = {
  id: string;
  content: string;
  category: NoteCategory;
};

export type AnnotationNoteDeps = {
  listNotes: (unitId: string) => Promise<UserNoteDocType[]>;
  putNote: (doc: UserNoteDocType) => Promise<void>;
};

export type AnnotationSelfCertaintyDeps = {
  listByTextId: (textId: string) => Promise<LayerUnitDocType[]>;
  saveBatch: (items: LayerUnitDocType[]) => Promise<void>;
};

const defaultNoteDeps: AnnotationNoteDeps = {
  listNotes: (unitId) => LinguisticService.notes.listByTarget('unit', unitId),
  putNote: async (doc) => {
    await LinguisticService.notes.save(doc);
  },
};

const defaultCertaintyDeps: AnnotationSelfCertaintyDeps = {
  listByTextId: (textId) => LinguisticService.units.listByTextId(textId),
  saveBatch: (items) => LinguisticService.units.saveBatch(items),
};

export function noteViewFromDoc(doc: UserNoteDocType): AnnotationUnitNoteView {
  const content =
    doc.content.default?.trim() ||
    Object.values(doc.content).find((value) => value.trim().length > 0) ||
    '';
  const category = ANNOTATION_NOTE_CATEGORIES.includes(doc.category as NoteCategory)
    ? (doc.category as NoteCategory)
    : 'comment';
  return { id: doc.id, content, category };
}

export async function listAnnotationUnitNotes(
  unitId: string,
  deps: AnnotationNoteDeps = defaultNoteDeps,
): Promise<AnnotationUnitNoteView[]> {
  const rows = await deps.listNotes(unitId);
  return rows.map(noteViewFromDoc);
}

export async function saveAnnotationUnitNote(
  input: {
    unitId: string;
    content: string;
    category: NoteCategory;
    noteId?: string;
  },
  deps: AnnotationNoteDeps = defaultNoteDeps,
): Promise<AnnotationUnitNoteView> {
  const notes = await deps.listNotes(input.unitId);
  const existing = notes.length > 0 ? notes[notes.length - 1] : undefined;
  const now = new Date().toISOString();
  const id = input.noteId?.trim() || existing?.id || newId('note');
  const doc: UserNoteDocType = {
    ...(existing ?? {
      id,
      targetType: 'unit',
      targetId: input.unitId,
      createdAt: now,
    }),
    id,
    targetType: 'unit',
    targetId: input.unitId,
    content: { default: input.content },
    category: input.category,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await deps.putNote(doc);
  const readback = await deps.listNotes(input.unitId);
  const stored = readback.find((row) => row.id === id);
  if (!stored) throw new Error(`note readback missing ${id}`);
  return noteViewFromDoc(stored);
}

export async function saveAnnotationUnitSelfCertainty(
  input: {
    textId: string;
    unitId: string;
    selfCertainty: UnitSelfCertainty | null;
  },
  deps: AnnotationSelfCertaintyDeps = defaultCertaintyDeps,
): Promise<LayerUnitDocType> {
  if (input.selfCertainty !== null && !UNIT_SELF_CERTAINTY_VALUES.includes(input.selfCertainty)) {
    throw new Error(`invalid selfCertainty ${input.selfCertainty}`);
  }
  const units = await deps.listByTextId(input.textId);
  const existing = units.find((unit) => unit.id === input.unitId);
  if (!existing) throw new Error(`readback missing unit ${input.unitId}`);
  const { selfCertainty: _old, ...rest } = existing;
  const next: LayerUnitDocType = {
    ...rest,
    ...(input.selfCertainty ? { selfCertainty: input.selfCertainty } : {}),
    updatedAt: new Date().toISOString(),
  };
  await deps.saveBatch([next]);
  const readback = (await deps.listByTextId(input.textId)).find((unit) => unit.id === input.unitId);
  if (!readback) throw new Error(`selfCertainty readback missing ${input.unitId}`);
  if ((readback.selfCertainty ?? null) !== input.selfCertainty) {
    throw new Error(`selfCertainty readback mismatch for ${input.unitId}`);
  }
  return readback;
}
