import { randomUUID } from 'node:crypto';
import {
  removeCreatedTextCarrier,
  restoreCreatedTextCarrier,
  type CreatedTextCarrier,
} from './unitTextCarrierUndo';
import type Database from 'better-sqlite3';
import {
  createContentNote,
  deleteContentNote,
  readContentNote,
  readStoredContentNote,
  updateContentNote,
  type ContentNote,
  type ContentNoteCategory,
  type ContentNoteWrite,
} from './notes';
import { resolveUnitTextContext, readUnitTextBody } from './unitTextLayers';
import { isUnitTextSelfCertainty, type UnitTextSelfCertainty } from './unitTextSelfCertainty';
import { getUnit, type Unit } from './units';
import { keepEmptyUnitText } from './unitTextAudios';

type SqliteDatabase = InstanceType<typeof Database>;

export interface CertaintyUndo {
  manuscriptId: string;
  textLayerId: string;
  after: UnitTextSelfCertainty | null;
  targets: {
    unitId: string;
    before: UnitTextSelfCertainty | null;
    textExisted: boolean;
    body: string;
  }[];
}

export type NoteEditUndo =
  | {
      op: 'create';
      manuscriptId: string;
      write: ContentNoteWrite & { id: string };
      carrier?: CreatedTextCarrier;
    }
  | {
      op: 'update';
      manuscriptId: string;
      noteId: string;
      before: { content: Record<string, string>; category: ContentNoteCategory | null };
      after: { content: Record<string, string>; category: ContentNoteCategory | null };
    }
  | { op: 'delete'; manuscriptId: string; write: ContentNoteWrite & { id: string } };

export interface NoteBatchUndo {
  manuscriptId: string;
  created: Array<ContentNoteWrite & { id: string }>;
  carriers?: CreatedTextCarrier[];
}

/** Ensure a unit_texts row exists for the target layer; returns its id. */
export function ensureUnitTextCarrier(
  db: SqliteDatabase,
  unitId: string,
  textLayerId: string,
): string {
  const context = resolveUnitTextContext(db, unitId, textLayerId);
  const existing = readUnitTextBody(db, context);
  if (existing.id !== null) return existing.id;
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO unit_texts (id, unit_id, layer_id, role, body, updated_at)
     VALUES (?, ?, ?, ?, '', ?)`,
  ).run(id, unitId, context.textLayerId, context.role, now);
  db.prepare('UPDATE units SET updated_at = ? WHERE id = ?').run(now, unitId);
  return id;
}

function writeCertaintyRow(
  db: SqliteDatabase,
  input: {
    unitId: string;
    textLayerId: string;
    selfCertainty: UnitTextSelfCertainty | null;
  },
): {
  unit: Unit;
  before: UnitTextSelfCertainty | null;
  manuscriptId: string;
  textExisted: boolean;
} {
  const context = resolveUnitTextContext(db, input.unitId, input.textLayerId);
  const now = new Date().toISOString();
  const current = readUnitTextBody(db, context);
  const before =
    current.selfCertainty === null || isUnitTextSelfCertainty(current.selfCertainty)
      ? current.selfCertainty
      : null;
  if (before === input.selfCertainty) {
    const unit = getUnit(db, input.unitId, input.textLayerId);
    if (!unit) throw new Error('unit is missing');
    return { unit, before, manuscriptId: context.manuscriptId, textExisted: current.id !== null };
  }
  if (current.id === null) {
    const id = randomUUID();
    db.prepare(
      `INSERT INTO unit_texts (id, unit_id, layer_id, role, body, self_certainty, updated_at)
       VALUES (?, ?, ?, ?, '', ?, ?)`,
    ).run(id, input.unitId, context.textLayerId, context.role, input.selfCertainty, now);
  } else {
    db.prepare('UPDATE unit_texts SET self_certainty = ?, updated_at = ? WHERE id = ?').run(
      input.selfCertainty,
      now,
      current.id,
    );
  }
  db.prepare('UPDATE units SET updated_at = ? WHERE id = ?').run(now, input.unitId);
  db.prepare('UPDATE manuscripts SET generation = generation + 1, updated_at = ? WHERE id = ?').run(
    now,
    context.manuscriptId,
  );
  const unit = getUnit(db, input.unitId, input.textLayerId);
  if (!unit || unit.selfCertainty !== input.selfCertainty) {
    throw new Error('self certainty readback failed');
  }
  return { unit, before, manuscriptId: context.manuscriptId, textExisted: current.id !== null };
}

export function setUnitTextSelfCertainty(
  db: SqliteDatabase,
  input: {
    unitId: string;
    textLayerId: string;
    selfCertainty: UnitTextSelfCertainty | null;
  },
): { unit: Unit; undo: CertaintyUndo | null } {
  if (input.selfCertainty !== null && !isUnitTextSelfCertainty(input.selfCertainty)) {
    throw new Error('self certainty is invalid');
  }
  return db.transaction(() => {
    const wrote = writeCertaintyRow(db, input);
    if (wrote.before === input.selfCertainty) {
      return { unit: wrote.unit, undo: null };
    }
    return {
      unit: wrote.unit,
      undo: {
        manuscriptId: wrote.manuscriptId,
        textLayerId: input.textLayerId,
        after: input.selfCertainty,
        targets: [
          {
            unitId: input.unitId,
            before: wrote.before,
            textExisted: wrote.textExisted,
            body: wrote.unit.text,
          },
        ],
      },
    };
  })();
}

export function setUnitTextSelfCertaintyMany(
  db: SqliteDatabase,
  input: {
    unitIds: readonly string[];
    textLayerId: string;
    selfCertainty: UnitTextSelfCertainty | null;
  },
): { units: Unit[]; undo: CertaintyUndo | null } {
  if (input.unitIds.length === 0) throw new Error('self certainty assign is empty');
  if (new Set(input.unitIds).size !== input.unitIds.length) {
    throw new Error('self certainty ids repeat');
  }
  if (input.selfCertainty !== null && !isUnitTextSelfCertainty(input.selfCertainty)) {
    throw new Error('self certainty is invalid');
  }
  return db.transaction(() => {
    const targets: CertaintyUndo['targets'] = [];
    const units: Unit[] = [];
    let manuscriptId: string | null = null;
    for (const unitId of input.unitIds) {
      const wrote = writeCertaintyRow(db, {
        unitId,
        textLayerId: input.textLayerId,
        selfCertainty: input.selfCertainty,
      });
      if (manuscriptId === null) manuscriptId = wrote.manuscriptId;
      else if (manuscriptId !== wrote.manuscriptId) {
        throw new Error('self certainty spans manuscripts');
      }
      units.push(wrote.unit);
      if (wrote.before !== input.selfCertainty) {
        targets.push({
          unitId,
          before: wrote.before,
          textExisted: wrote.textExisted,
          body: wrote.unit.text,
        });
      }
    }
    if (targets.length === 0 || manuscriptId === null) return { units, undo: null };
    return {
      units,
      undo: {
        manuscriptId,
        textLayerId: input.textLayerId,
        after: input.selfCertainty,
        targets,
      },
    };
  })();
}

function certaintyStillAfter(db: SqliteDatabase, undo: CertaintyUndo): boolean {
  return undo.targets.every((target) => {
    const unit = getUnit(db, target.unitId, undo.textLayerId);
    return unit?.selfCertainty === undo.after && unit.text === target.body;
  });
}

export function undoCertainty(db: SqliteDatabase, undo: CertaintyUndo): Unit[] {
  return db.transaction(() => {
    if (!certaintyStillAfter(db, undo)) throw new Error('self certainty undo is stale');
    return undo.targets.map((target) => {
      const wrote = writeCertaintyRow(db, {
        unitId: target.unitId,
        textLayerId: undo.textLayerId,
        selfCertainty: target.before,
      });
      const textId = wrote.unit.textId;
      if (
        !target.textExisted &&
        target.before === null &&
        textId !== null &&
        !keepEmptyUnitText(db, textId)
      ) {
        db.prepare("DELETE FROM unit_texts WHERE id = ? AND body = ''").run(textId);
      }
      return getUnit(db, target.unitId, undo.textLayerId)!;
    });
  })();
}

export function redoCertainty(
  db: SqliteDatabase,
  undo: CertaintyUndo,
): { units: Unit[]; undo: CertaintyUndo } {
  if (
    !undo.targets.every((target) => {
      const unit = getUnit(db, target.unitId, undo.textLayerId);
      return unit?.selfCertainty === target.before && unit.text === target.body;
    })
  )
    throw new Error('self certainty redo is stale');
  const result = setUnitTextSelfCertaintyMany(db, {
    unitIds: undo.targets.map((target) => target.unitId),
    textLayerId: undo.textLayerId,
    selfCertainty: undo.after,
  });
  if (result.undo === null) {
    throw new Error('self certainty redo is stale');
  }
  return { units: result.units, undo: result.undo };
}

function noteWriteFromStored(note: ContentNote): ContentNoteWrite & { id: string } {
  const base = {
    id: note.id,
    content: note.content,
    category: note.category,
    provenance: note.provenance,
  };
  switch (note.anchorKind) {
    case 'project':
      return { ...base, anchor: { kind: 'project' } };
    case 'manuscript': {
      if (note.manuscriptId === null) throw new Error('note manuscript is missing');
      return { ...base, anchor: { kind: 'manuscript', manuscriptId: note.manuscriptId } };
    }
    case 'layer': {
      if (note.layerId === null) throw new Error('note layer is missing');
      return { ...base, anchor: { kind: 'layer', layerId: note.layerId } };
    }
    case 'unit': {
      if (note.unitId === null) throw new Error('note unit is missing');
      return {
        ...base,
        anchor: {
          kind: 'unit',
          unitId: note.unitId,
          ...(note.view === null ? {} : { view: note.view }),
        },
      };
    }
    case 'unit_text': {
      if (note.unitTextId === null) throw new Error('note unit text is missing');
      return { ...base, anchor: { kind: 'unit_text', unitTextId: note.unitTextId } };
    }
    case 'token': {
      if (note.unitId === null || note.tokenId === null) throw new Error('note token is missing');
      return {
        ...base,
        anchor: { kind: 'token', unitId: note.unitId, tokenId: note.tokenId },
      };
    }
    case 'morpheme': {
      if (note.unitId === null || note.morphemeId === null) {
        throw new Error('note morpheme is missing');
      }
      return {
        ...base,
        anchor: { kind: 'morpheme', unitId: note.unitId, morphemeId: note.morphemeId },
      };
    }
    case 'analysis_node': {
      if (note.unitId === null || note.nodeId === null) throw new Error('note node is missing');
      return {
        ...base,
        anchor: { kind: 'analysis_node', unitId: note.unitId, nodeId: note.nodeId },
      };
    }
    default: {
      const _exhaustive: never = note.anchorKind;
      throw new Error(`note undo unsupported anchor: ${_exhaustive}`);
    }
  }
}

function requireNoteManuscript(note: ContentNote): string {
  if (note.manuscriptId === null) throw new Error('note manuscript is missing');
  return note.manuscriptId;
}

/** Create a unit_text note from unitId + textLayerId (builds carrier in the same transaction). */
export function createUnitTextLayerNote(
  db: SqliteDatabase,
  input: {
    unitId: string;
    textLayerId: string;
    value: Record<string, string>;
    category?: ContentNoteCategory | null;
    provenance?: unknown | null;
    id?: string;
  },
): { note: ContentNote; undo: NoteEditUndo } {
  return db.transaction(() => {
    const existed =
      readUnitTextBody(db, resolveUnitTextContext(db, input.unitId, input.textLayerId)).id !== null;
    const unitTextId = ensureUnitTextCarrier(db, input.unitId, input.textLayerId);
    const write: ContentNoteWrite = {
      ...(input.id === undefined ? {} : { id: input.id }),
      anchor: { kind: 'unit_text', unitTextId },
      content: input.value,
      ...(input.category === undefined ? {} : { category: input.category }),
      ...(input.provenance === undefined ? {} : { provenance: input.provenance }),
    };
    const note = createContentNote(db, write);
    return {
      note,
      undo: {
        op: 'create' as const,
        manuscriptId: requireNoteManuscript(note),
        ...(!existed
          ? { carrier: { id: unitTextId, unitId: input.unitId, textLayerId: input.textLayerId } }
          : {}),
        write: noteWriteFromStored(note),
      },
    };
  })();
}

export function createUnitTextLayerNotesMany(
  db: SqliteDatabase,
  input: {
    unitIds: readonly string[];
    textLayerId: string;
    value: Record<string, string>;
    category?: ContentNoteCategory | null;
    provenance?: unknown | null;
  },
): { notes: ContentNote[]; undo: NoteBatchUndo | null } {
  if (input.unitIds.length === 0) throw new Error('note batch is empty');
  if (new Set(input.unitIds).size !== input.unitIds.length) {
    throw new Error('note batch ids repeat');
  }
  return db.transaction(() => {
    const notes: ContentNote[] = [];
    const created: NoteBatchUndo['created'] = [];
    const carriers: CreatedTextCarrier[] = [];
    let manuscriptId: string | null = null;
    for (const unitId of input.unitIds) {
      const made = createUnitTextLayerNote(db, {
        unitId,
        textLayerId: input.textLayerId,
        value: input.value,
        ...(input.category === undefined ? {} : { category: input.category }),
        ...(input.provenance === undefined ? {} : { provenance: input.provenance }),
      });
      const mid = requireNoteManuscript(made.note);
      if (manuscriptId === null) manuscriptId = mid;
      else if (manuscriptId !== mid) throw new Error('note batch spans manuscripts');
      if (made.undo.op === 'create' && made.undo.carrier) carriers.push(made.undo.carrier);
      notes.push(made.note);
      created.push(noteWriteFromStored(made.note));
    }
    if (manuscriptId === null) return { notes, undo: null };
    return { notes, undo: { manuscriptId, created, carriers } };
  })();
}

export function createUnitNotesMany(
  db: SqliteDatabase,
  input: {
    unitIds: readonly string[];
    value: Record<string, string>;
    category?: ContentNoteCategory | null;
    provenance?: unknown | null;
    view?: 'timeline' | 'waveform';
  },
): { notes: ContentNote[]; undo: NoteBatchUndo | null } {
  if (input.unitIds.length === 0) throw new Error('note batch is empty');
  if (new Set(input.unitIds).size !== input.unitIds.length) {
    throw new Error('note batch ids repeat');
  }
  return db.transaction(() => {
    const notes: ContentNote[] = [];
    const created: NoteBatchUndo['created'] = [];
    let manuscriptId: string | null = null;
    for (const unitId of input.unitIds) {
      const note = createContentNote(db, {
        anchor: {
          kind: 'unit',
          unitId,
          ...(input.view === undefined ? {} : { view: input.view }),
        },
        content: input.value,
        ...(input.category === undefined ? {} : { category: input.category }),
        ...(input.provenance === undefined ? {} : { provenance: input.provenance }),
      });
      const mid = requireNoteManuscript(note);
      if (manuscriptId === null) manuscriptId = mid;
      else if (manuscriptId !== mid) throw new Error('note batch spans manuscripts');
      notes.push(note);
      created.push(noteWriteFromStored(note));
    }
    if (manuscriptId === null) return { notes, undo: null };
    return { notes, undo: { manuscriptId, created } };
  })();
}

export function createUnitNoteWithUndo(
  db: SqliteDatabase,
  input: ContentNoteWrite,
): { note: ContentNote; undo: NoteEditUndo | null } {
  const note = createContentNote(db, input);
  if (note.manuscriptId === null) return { note, undo: null };
  return {
    note,
    undo: {
      op: 'create' as const,
      manuscriptId: note.manuscriptId,
      write: noteWriteFromStored(note),
    },
  };
}

export function updateNoteWithUndo(
  db: SqliteDatabase,
  input: { id: string; content?: Record<string, string>; category?: ContentNoteCategory | null },
): { note: ContentNote; undo: NoteEditUndo | null } {
  const existing = readStoredContentNote(db, input.id);
  if (existing === null) throw new Error('note is missing');
  const note = updateContentNote(db, input);
  if (existing.manuscriptId === null) return { note, undo: null };
  const before = { content: existing.content, category: existing.category };
  const after = { content: note.content, category: note.category };
  if (
    JSON.stringify(before.content) === JSON.stringify(after.content) &&
    before.category === after.category
  ) {
    return { note, undo: null };
  }
  return {
    note,
    undo: {
      op: 'update',
      manuscriptId: existing.manuscriptId,
      noteId: note.id,
      before,
      after,
    },
  };
}

export function deleteNoteWithUndo(
  db: SqliteDatabase,
  id: string,
): { id: string; undo: NoteEditUndo | null } {
  const existing = readStoredContentNote(db, id);
  if (existing === null) throw new Error('note is missing');
  const undo =
    existing.manuscriptId === null
      ? null
      : ({
          op: 'delete' as const,
          manuscriptId: existing.manuscriptId,
          write: noteWriteFromStored(existing),
        } satisfies NoteEditUndo);
  deleteContentNote(db, id);
  return { id, undo };
}

export function undoNoteEdit(db: SqliteDatabase, undo: NoteEditUndo): ContentNote | { id: string } {
  return db.transaction(() => {
    switch (undo.op) {
      case 'create': {
        const live = readContentNote(db, undo.write.id);
        if (live === null) throw new Error('note undo is stale');
        deleteContentNote(db, undo.write.id);
        if (undo.carrier) removeCreatedTextCarrier(db, undo.carrier);
        return { id: undo.write.id };
      }
      case 'update': {
        const live = readStoredContentNote(db, undo.noteId);
        if (
          live === null ||
          JSON.stringify(live.content) !== JSON.stringify(undo.after.content) ||
          live.category !== undo.after.category
        ) {
          throw new Error('note undo is stale');
        }
        return updateContentNote(db, {
          id: undo.noteId,
          content: undo.before.content,
          category: undo.before.category,
        });
      }
      case 'delete': {
        if (readStoredContentNote(db, undo.write.id) !== null) {
          throw new Error('note undo is stale');
        }
        return createContentNote(db, undo.write);
      }
      default: {
        const unreachable: never = undo;
        return unreachable;
      }
    }
  })();
}

export function redoNoteEdit(
  db: SqliteDatabase,
  undo: NoteEditUndo,
): { value: ContentNote | { id: string }; undo: NoteEditUndo } {
  switch (undo.op) {
    case 'create': {
      if (readStoredContentNote(db, undo.write.id) !== null) {
        throw new Error('note redo is stale');
      }
      return db.transaction(() => {
        if (undo.carrier) restoreCreatedTextCarrier(db, undo.carrier);
        const note = createContentNote(db, undo.write);
        return { value: note, undo };
      })();
    }
    case 'update': {
      const live = readStoredContentNote(db, undo.noteId);
      if (
        live === null ||
        JSON.stringify(live.content) !== JSON.stringify(undo.before.content) ||
        live.category !== undo.before.category
      ) {
        throw new Error('note redo is stale');
      }
      const note = updateContentNote(db, {
        id: undo.noteId,
        content: undo.after.content,
        category: undo.after.category,
      });
      return { value: note, undo };
    }
    case 'delete': {
      if (readContentNote(db, undo.write.id) === null) throw new Error('note redo is stale');
      deleteContentNote(db, undo.write.id);
      return { value: { id: undo.write.id }, undo };
    }
    default: {
      const unreachable: never = undo;
      return unreachable;
    }
  }
}

export function undoNoteBatch(db: SqliteDatabase, undo: NoteBatchUndo): { id: string }[] {
  return db.transaction(() => {
    for (const write of undo.created) {
      if (readContentNote(db, write.id) === null) throw new Error('note batch undo is stale');
    }
    for (const write of undo.created) deleteContentNote(db, write.id);
    for (const carrier of undo.carriers ?? []) removeCreatedTextCarrier(db, carrier);
    return undo.created.map((write) => ({ id: write.id }));
  })();
}

export function redoNoteBatch(
  db: SqliteDatabase,
  undo: NoteBatchUndo,
): { notes: ContentNote[]; undo: NoteBatchUndo } {
  return db.transaction(() => {
    for (const write of undo.created) {
      if (readStoredContentNote(db, write.id) !== null) {
        throw new Error('note batch redo is stale');
      }
    }
    for (const carrier of undo.carriers ?? []) restoreCreatedTextCarrier(db, carrier);
    const notes = undo.created.map((write) => createContentNote(db, write));
    return { notes, undo };
  })();
}
