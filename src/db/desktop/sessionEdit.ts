import { splitTextPreview } from './unitSplitTextPlan';
import { undoTextClear, redoTextClear, type TextClearUndo } from './unitTextClear';
import type Database from 'better-sqlite3';
import { undoUnitText } from './analysisRestore';
import {
  assignSpeaker,
  clearSpeaker,
  undoAssignSpeaker,
  type SpeakerAssignUndo,
} from './speakerAssign';
import {
  moveSharedBoundary,
  moveUnitSpan,
  moveUnitEdge,
  restoreRemovedUnit,
  treeStillMatches,
  type EdgeMove,
  type SharedBoundaryMove,
  type UnitSpanMove,
} from './unitEdges';
import { splitUnit, undoSplit, type UnitSplitUndo } from './unitSplit';
import { mergeUnits, undoMerge, type UnitMergeUndo } from './unitMerge';
import {
  deleteUnitTree,
  readRemovedUnit,
  readRemovedTextDrafts,
  type RemovedUnit,
} from './unitSpan';
import { retimeManuscript, undoRetime, type RetimeUndo } from './manuscripts';
import { readStoredUnit, updateUnitText, type Unit, type UnitTextUndo } from './units';
import { bindHeldAttachmentIds } from './attachments';

type SqliteDatabase = InstanceType<typeof Database>;

export type SessionEdit =
  | { kind: 'clearText'; undo: TextClearUndo }
  | { kind: 'text'; undo: UnitTextUndo }
  | { kind: 'split'; undo: UnitSplitUndo }
  | { kind: 'merge'; undo: UnitMergeUndo }
  | { kind: 'assign'; undo: SpeakerAssignUndo }
  | { kind: 'edge'; undo: EdgeMove }
  | { kind: 'boundary'; undo: SharedBoundaryMove }
  | { kind: 'span'; undo: UnitSpanMove }
  | { kind: 'create'; undo: { manuscriptId: string; tree: RemovedUnit } }
  | { kind: 'delete'; undo: { manuscriptId: string; tree: RemovedUnit } }
  | { kind: 'deleteMany'; undo: { manuscriptId: string; trees: RemovedUnit[] } }
  | { kind: 'retime'; undo: RetimeUndo; offsetMs: number; scale: number };

type Frame = { edit: SessionEdit };
type Book = { undo: Frame[]; redo: Frame[] };

// ponytail: stacks are in memory. A crash drops them, and a step is not atomic with the sqlite commit. No table; this does not change user_version.
let activeSessionId: string | undefined;
const books = new Map<string, Map<string, Book>>();
const lastManuscript = new Map<string, string>();
let redoSweepDue = false;

export function sessionHeldFileIds(): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const session of books.values()) {
    for (const book of session.values()) {
      for (const frame of [...book.undo, ...book.redo]) {
        for (const id of fileIdsOf(frame.edit)) ids.add(id);
      }
    }
  }
  return ids;
}

bindHeldAttachmentIds(sessionHeldFileIds);

/** Attach and detach keep this stack. Fold the live clips into snapshots that redo would restore. */
export function noteLiveUnitAudios(db: SqliteDatabase, unitId: string): void {
  if (activeSessionId === undefined || readStoredUnit(db, unitId) === null) return;
  const session = books.get(activeSessionId);
  if (session === undefined) return;
  const live = readRemovedUnit(db, unitId);
  for (const book of session.values()) {
    for (const frame of [...book.undo, ...book.redo]) {
      for (const tree of snapshotTrees(frame.edit)) patchLiveAudios(tree, live);
    }
  }
}

function snapshotTrees(edit: SessionEdit): RemovedUnit[] {
  switch (edit.kind) {
    case 'create':
      return [edit.undo.tree];
    case 'clearText':
    case 'text':
    case 'split':
    case 'merge':
    case 'assign':
    case 'edge':
    case 'boundary':
    case 'span':
    case 'delete':
    case 'deleteMany':
    case 'retime':
      return [];
    default: {
      const unreachable: never = edit;
      return unreachable;
    }
  }
}

function patchLiveAudios(tree: RemovedUnit, live: RemovedUnit): void {
  if (tree.unit.id !== live.unit.id) return;
  const needed = new Set(live.audios.map((row) => row.unit_text_id));
  const have = new Set(tree.texts.map((row) => row.id));
  for (const row of live.texts) {
    if (needed.has(row.id) && !have.has(row.id)) tree.texts.push({ ...row });
  }
  const still = new Set(live.texts.map((row) => row.id));
  tree.texts = tree.texts.filter((row) => {
    const carried = tree.audios.some((audio) => audio.unit_text_id === row.id);
    return !carried || still.has(row.id);
  });
  tree.audios = live.audios.map((row) => ({ ...row }));
}

export function consumeRedoSweep(): boolean {
  const due = redoSweepDue;
  redoSweepDue = false;
  return due;
}

export function bindSessionEdit(sessionId: string): void {
  activeSessionId = sessionId;
}

export function expireSessionEdit(): void {
  activeSessionId = undefined;
  books.clear();
  lastManuscript.clear();
  redoSweepDue = false;
}

function fileIdsOf(edit: SessionEdit): string[] {
  switch (edit.kind) {
    case 'create':
    case 'delete':
      return edit.undo.tree.audios.map((row) => row.file_id);
    case 'deleteMany':
      return edit.undo.trees.flatMap((tree) => tree.audios.map((row) => row.file_id));
    case 'split':
      return edit.undo.removed.flatMap((tree) => tree.audios.map((row) => row.file_id));
    case 'merge':
      return [...edit.undo.earlier.audios, ...edit.undo.later.audios].map((row) => row.file_id);
    case 'clearText':
    case 'text':
    case 'assign':
    case 'edge':
    case 'boundary':
    case 'span':
    case 'retime':
      return [];
    default: {
      const unreachable: never = edit;
      return unreachable;
    }
  }
}

function redoFrames(sessionId?: string): Frame[] {
  const sessions =
    sessionId === undefined ? [...books.values()] : [books.get(sessionId) ?? new Map()];
  return sessions.flatMap((session) => [...session.values()].flatMap((book) => book.redo));
}

function manuscriptOf(edit: SessionEdit): string {
  switch (edit.kind) {
    case 'clearText':
      return edit.undo.manuscriptId;
    case 'text':
      return edit.undo.prior.manuscriptId;
    case 'split':
    case 'merge':
    case 'assign':
    case 'edge':
    case 'boundary':
    case 'span':
    case 'create':
    case 'delete':
    case 'deleteMany':
      return edit.undo.manuscriptId;
    case 'retime':
      return edit.undo.manuscriptId;
    default: {
      const unreachable: never = edit;
      return unreachable;
    }
  }
}

function bookOf(sessionId: string, manuscriptId: string): Book {
  let session = books.get(sessionId);
  if (!session) {
    session = new Map();
    books.set(sessionId, session);
  }
  let book = session.get(manuscriptId);
  if (!book) {
    book = { undo: [], redo: [] };
    session.set(manuscriptId, book);
  }
  return book;
}

export function rememberSessionEdit(sessionId: string, edit: SessionEdit): void {
  if (activeSessionId !== sessionId) return;
  const manuscriptId = manuscriptOf(edit);
  const book = bookOf(sessionId, manuscriptId);
  book.undo.push({ edit });
  if (book.redo.length > 0) redoSweepDue = true;
  book.redo = [];
  lastManuscript.set(sessionId, manuscriptId);
}

export function clearSessionEdit(sessionId?: string): void {
  if (redoFrames(sessionId).length > 0) redoSweepDue = true;
  if (sessionId === undefined) {
    books.clear();
    lastManuscript.clear();
    return;
  }
  books.delete(sessionId);
  lastManuscript.delete(sessionId);
}

export function sessionEditManuscript(
  sessionId: string,
  manuscriptId: string | undefined,
): string | undefined {
  return manuscriptId ?? lastManuscript.get(sessionId);
}

function topBook(sessionId: string, manuscriptId: string | undefined): Book | undefined {
  const id = manuscriptId ?? lastManuscript.get(sessionId);
  if (id === undefined) return undefined;
  return books.get(sessionId)?.get(id);
}

export function undoSessionEdit(
  sessionId: string,
  db: SqliteDatabase,
  only?: 'text',
  manuscriptId?: string,
): Unit | Unit[] {
  const book = activeSessionId === sessionId ? topBook(sessionId, manuscriptId) : undefined;
  const frame = book?.undo[book.undo.length - 1];
  if (!frame || (only === 'text' && frame.edit.kind !== 'text')) {
    throw new Error('unit text undo is empty');
  }
  const undone = guarded(db, () => applyUndo(db, frame.edit));
  book.undo.pop();
  book.redo.push(frame);
  retargetGeneration(db, sessionId, manuscriptOf(frame.edit));
  return undone;
}

export function redoSessionEdit(
  sessionId: string,
  db: SqliteDatabase,
  manuscriptId?: string,
): Unit | Unit[] {
  const book = activeSessionId === sessionId ? topBook(sessionId, manuscriptId) : undefined;
  const frame = book?.redo[book.redo.length - 1];
  if (!frame) throw new Error('unit text redo is empty');
  const next = guarded(db, () => applyRedo(db, frame.edit));
  book.redo.pop();
  book.undo.push({ edit: next.edit });
  retargetGeneration(db, sessionId, manuscriptOf(next.edit));
  return next.value;
}

/** ADR-0129: the step stays on its stack; only an explicit drop removes it. */
export class StaleEditError extends Error {
  readonly code = 'edit-stale';
}

function guarded<T>(db: SqliteDatabase, apply: () => T): T {
  try {
    return db.transaction(apply)();
  } catch (error) {
    if (error instanceof Error && error.message.endsWith('is stale')) {
      throw new StaleEditError(error.message);
    }
    throw error;
  }
}

/** Removes the top step without applying it. Returns false when that stack is empty. */
export function dropSessionEdit(
  sessionId: string,
  stack: 'undo' | 'redo',
  manuscriptId?: string,
): boolean {
  const book = activeSessionId === sessionId ? topBook(sessionId, manuscriptId) : undefined;
  if (!book || book[stack].length === 0) return false;
  book[stack].pop();
  return true;
}

function retargetGeneration(db: SqliteDatabase, sessionId: string, manuscriptId: string): void {
  const row = db.prepare('SELECT generation FROM manuscripts WHERE id = ?').get(manuscriptId) as
    { generation: number } | undefined;
  if (!row) return;
  const book = books.get(sessionId)?.get(manuscriptId);
  if (!book) return;
  for (const frame of book.undo) stampGeneration(db, frame.edit, row.generation);
}

function stampGeneration(db: SqliteDatabase, edit: SessionEdit, generation: number): void {
  switch (edit.kind) {
    case 'clearText':
      return;
    case 'text': {
      edit.undo.after.manuscriptGeneration = generation;
      const row = db
        .prepare('SELECT analysis_generation AS analysisGeneration FROM units WHERE id = ?')
        .get(edit.undo.unitId) as { analysisGeneration: number } | undefined;
      if (row) edit.undo.after.analysisGeneration = row.analysisGeneration;
      return;
    }
    case 'split':
    case 'merge':
      edit.undo.manuscriptGeneration = generation;
      return;
    case 'assign':
    case 'edge':
    case 'boundary':
    case 'span':
    case 'create':
    case 'delete':
    case 'deleteMany':
      return;
    case 'retime':
      edit.undo.manuscriptGeneration = generation;
      return;
    default: {
      const unreachable: never = edit;
      return unreachable;
    }
  }
}

function applyUndo(db: SqliteDatabase, edit: SessionEdit): Unit | Unit[] {
  switch (edit.kind) {
    case 'clearText':
      return undoTextClear(db, edit.undo);
    case 'text':
      return undoUnitText(db, edit.undo);
    case 'split':
      return undoSplit(db, edit.undo);
    case 'merge':
      return undoMerge(db, edit.undo);
    case 'assign':
      return undoAssignSpeaker(db, edit.undo);
    case 'edge':
      return undoEdge(db, edit.undo);
    case 'boundary':
      return undoBoundary(db, edit.undo);
    case 'span':
      return undoSpan(db, edit.undo);
    case 'create':
      return undoCreate(db, edit.undo.tree);
    case 'delete':
      return restoreRemovedUnit(db, edit.undo.tree);
    case 'deleteMany':
      return edit.undo.trees.map((tree) => restoreRemovedUnit(db, tree));
    case 'retime':
      undoRetime(db, edit.undo);
      return [];
    default: {
      const unreachable: never = edit;
      return unreachable;
    }
  }
}

function applyRedo(
  db: SqliteDatabase,
  edit: SessionEdit,
): { value: Unit | Unit[]; edit: SessionEdit } {
  switch (edit.kind) {
    case 'clearText': {
      const undo = redoTextClear(db, edit.undo);
      return {
        value: undo.before.map((row) => readStoredUnit(db, row.unitId, undo.textLayerId)!),
        edit: { kind: 'clearText', undo },
      };
    }
    case 'text':
      return redoText(db, edit.undo);
    case 'split':
      return redoSplit(db, edit.undo);
    case 'merge':
      return redoMerge(db, edit.undo);
    case 'assign':
      return redoAssign(db, edit.undo);
    case 'edge':
      return redoEdge(db, edit.undo);
    case 'boundary':
      return redoBoundary(db, edit.undo);
    case 'span':
      return redoSpan(db, edit.undo);
    case 'create': {
      try {
        const unit = restoreRemovedUnit(db, edit.undo.tree);
        return { value: unit, edit };
      } catch (error) {
        if (error instanceof Error && error.message.endsWith('undo is stale')) {
          throw new Error('unit create redo is stale');
        }
        throw error;
      }
    }
    case 'delete': {
      if (!treeStillMatches(db, edit.undo.tree)) throw new Error('unit delete redo is stale');
      deleteUnitTree(db, edit.undo.tree.unit.id);
      const ghost = readStoredUnit(db, edit.undo.tree.unit.id);
      if (ghost) throw new Error('unit delete redo is stale');
      return { value: unitFromTree(edit.undo.tree), edit };
    }
    case 'deleteMany': {
      if (edit.undo.trees.some((tree) => !treeStillMatches(db, tree))) {
        throw new Error('unit delete redo is stale');
      }
      for (const tree of edit.undo.trees) deleteUnitTree(db, tree.unit.id);
      if (edit.undo.trees.some((tree) => readStoredUnit(db, tree.unit.id))) {
        throw new Error('unit delete redo is stale');
      }
      return { value: edit.undo.trees.map(unitFromTree), edit };
    }
    case 'retime': {
      const retimed = retimeManuscript(db, {
        manuscriptId: edit.undo.manuscriptId,
        offsetMs: edit.offsetMs,
        scale: edit.scale,
      });
      return {
        value: [],
        edit: {
          kind: 'retime',
          undo: retimed.undo,
          offsetMs: edit.offsetMs,
          scale: edit.scale,
        },
      };
    }
    default: {
      const unreachable: never = edit;
      return unreachable;
    }
  }
}

function undoEdge(db: SqliteDatabase, undo: EdgeMove): Unit {
  const unit = readStoredUnit(db, undo.unitId);
  const current = undo.edge === 'start' ? unit?.startMs : unit?.endMs;
  if (!unit || current !== undo.to) throw new Error('edge undo is stale');
  return moveUnitEdge(
    db,
    {
      unitId: undo.unitId,
      edge: undo.edge,
      time: undo.from,
      ...(undo.followers ? { followers: undo.followers } : {}),
    },
    'from',
  ).unit;
}

function redoEdge(db: SqliteDatabase, undo: EdgeMove): { value: Unit; edit: SessionEdit } {
  const unit = readStoredUnit(db, undo.unitId);
  const current = undo.edge === 'start' ? unit?.startMs : unit?.endMs;
  if (!unit || current !== undo.from) throw new Error('edge redo is stale');
  const moved = moveUnitEdge(db, {
    unitId: undo.unitId,
    edge: undo.edge,
    time: undo.to,
    ...(undo.followers ? { followers: undo.followers } : {}),
  });
  if (!moved.move) throw new Error('edge redo is stale');
  return { value: moved.unit, edit: { kind: 'edge', undo: moved.move } };
}

function undoBoundary(db: SqliteDatabase, undo: SharedBoundaryMove): Unit[] {
  const left = readStoredUnit(db, undo.leftId);
  const right = readStoredUnit(db, undo.rightId);
  if (
    !left ||
    !right ||
    left.endMs !== undo.to ||
    right.startMs !== undo.to ||
    left.startMs !== undo.leftStart ||
    right.endMs !== undo.rightEnd
  ) {
    throw new Error('boundary undo is stale');
  }
  const moved = moveSharedBoundary(db, {
    leftId: undo.leftId,
    rightId: undo.rightId,
    time: undo.from,
  });
  return [moved.left, moved.right];
}

function redoBoundary(
  db: SqliteDatabase,
  undo: SharedBoundaryMove,
): { value: Unit[]; edit: SessionEdit } {
  const left = readStoredUnit(db, undo.leftId);
  const right = readStoredUnit(db, undo.rightId);
  if (!left || !right || left.endMs !== undo.from || right.startMs !== undo.from) {
    throw new Error('boundary redo is stale');
  }
  const moved = moveSharedBoundary(db, {
    leftId: undo.leftId,
    rightId: undo.rightId,
    time: undo.to,
  });
  if (!moved.move) throw new Error('boundary redo is stale');
  return { value: [moved.left, moved.right], edit: { kind: 'boundary', undo: moved.move } };
}

function undoSpan(db: SqliteDatabase, undo: UnitSpanMove): Unit {
  const unit = readStoredUnit(db, undo.unitId);
  if (!unit || unit.startMs !== undo.fromStart + undo.delta) throw new Error('edge undo is stale');
  return moveUnitSpan(db, { unitId: undo.unitId, delta: -undo.delta }).unit;
}

function redoSpan(db: SqliteDatabase, undo: UnitSpanMove): { value: Unit; edit: SessionEdit } {
  const unit = readStoredUnit(db, undo.unitId);
  if (!unit || unit.startMs !== undo.fromStart) throw new Error('edge redo is stale');
  const moved = moveUnitSpan(db, { unitId: undo.unitId, delta: undo.delta });
  if (!moved.move) throw new Error('edge redo is stale');
  return { value: moved.unit, edit: { kind: 'span', undo: moved.move } };
}

function undoCreate(db: SqliteDatabase, tree: RemovedUnit): Unit {
  if (
    !treeStillMatches(db, tree) ||
    (tree.textDrafts !== undefined &&
      JSON.stringify(readRemovedTextDrafts(db, tree.unit.id)) !== JSON.stringify(tree.textDrafts))
  ) {
    throw new Error('unit create undo is stale');
  }
  const unit = readStoredUnit(db, tree.unit.id);
  if (!unit) throw new Error('unit create undo is stale');
  deleteUnitTree(db, tree.unit.id);
  return unit;
}

function redoText(db: SqliteDatabase, undo: UnitTextUndo): { value: Unit; edit: SessionEdit } {
  let fresh: UnitTextUndo | null = null;
  const unit = updateUnitText(
    db,
    {
      unitId: undo.unitId,
      textLayerId: undo.textLayerId,
      text: undo.after.text,
      ...(undo.prior.resolvedDraft === undefined
        ? {}
        : {
            resolveDraft: {
              rawInput: undo.prior.resolvedDraft.rawInput,
              baseBody: undo.prior.resolvedDraft.baseBody,
              currentBody: undo.prior.text,
            },
          }),
      provenanceJson: undo.after.provenanceJson,
    },
    undefined,
    (next) => {
      fresh = next;
    },
  );
  if (fresh === null) throw new Error('text redo is stale');
  return { value: unit, edit: { kind: 'text', undo: fresh } };
}

function redoSplit(db: SqliteDatabase, undo: UnitSplitUndo): { value: Unit; edit: SessionEdit } {
  try {
    const split = splitUnit(db, {
      unitId: undo.rootId,
      time: undo.time,
      operationId: undo.operationId,
      textLayerId: undo.textLayerId,
      cutIndex: undo.cutIndex,
      rawInput: undo.rawInput,
      presets: undo.presets,
      ...(undo.formalCuts === undefined
        ? {}
        : { formalCuts: undo.formalCuts, baseline: splitTextPreview(db, undo.rootId).baseline }),
    });
    return { value: split.left, edit: { kind: 'split', undo: split.undo } };
  } catch (error) {
    if (error instanceof Error && error.message.endsWith('redo is stale')) throw error;
    throw new Error('split redo is stale');
  }
}

function redoMerge(db: SqliteDatabase, undo: UnitMergeUndo): { value: Unit; edit: SessionEdit } {
  try {
    const merged = mergeUnits(db, {
      keepId: undo.earlier.unit.id,
      removeId: undo.later.unit.id,
      operationId: undo.operationId,
      separator: undo.separator,
      discardAudioIds: undo.discardAudioIds,
      newId: undo.newId,
      ...(undo.textOverrides === undefined ? {} : { textOverrides: undo.textOverrides }),
      ...(undo.textLayerId === undefined
        ? {}
        : {
            textLayerId: undo.textLayerId,
            keepText: undo.keepText ?? '',
            removeText: undo.removeText ?? '',
          }),
    });
    return { value: merged.unit, edit: { kind: 'merge', undo: merged.undo } };
  } catch (error) {
    if (error instanceof Error && error.message.endsWith('redo is stale')) throw error;
    throw new Error('merge redo is stale');
  }
}

function redoAssign(
  db: SqliteDatabase,
  undo: SpeakerAssignUndo,
): { value: Unit[]; edit: SessionEdit } {
  try {
    const assigned =
      undo.speakerId === null
        ? clearSpeaker(db, { unitIds: undo.units.map((unit) => unit.id) })
        : assignSpeaker(db, {
            speakerId: undo.speakerId,
            unitIds: undo.units.map((unit) => unit.id),
          });
    if (!assigned.undo) throw new Error('assign redo is stale');
    return { value: assigned.units, edit: { kind: 'assign', undo: assigned.undo } };
  } catch (error) {
    if (error instanceof Error && error.message.endsWith('redo is stale')) throw error;
    throw new Error('assign redo is stale');
  }
}

function unitFromTree(tree: RemovedUnit): Unit {
  const text = tree.texts.find((row) => row.role === 'transcription')?.body ?? '';
  return {
    id: tree.unit.id,
    layerId: tree.unit.layer_id,
    textLayerId: tree.unit.layer_id,
    speakerId: tree.unit.speaker_id,
    parentUnitId: tree.unit.parent_unit_id,
    startMs: tree.unit.start_ms,
    endMs: tree.unit.end_ms,
    text,
    textId: tree.texts.find((row) => row.role === 'transcription')?.id ?? null,
    draftText: null,
    createdAt: tree.unit.created_at,
    updatedAt: tree.unit.updated_at,
    confidence: tree.unit.confidence ?? null,
    skipProcessing: (tree.unit.skip_processing ?? 0) === 1,
  };
}
