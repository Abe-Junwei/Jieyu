import type Database from 'better-sqlite3';
import { undoUnitText } from './analysisRestore';
import { undoAssignSpeaker, type SpeakerAssignUndo } from './speakerAssign';
import { undoMerge, undoSplit, type UnitMergeUndo, type UnitSplitUndo } from './unitSpan';
import type { Unit, UnitTextUndo } from './units';

type SqliteDatabase = InstanceType<typeof Database>;

export type SessionEdit =
  | { kind: 'text'; undo: UnitTextUndo }
  | { kind: 'split'; undo: UnitSplitUndo }
  | { kind: 'merge'; undo: UnitMergeUndo }
  | { kind: 'assign'; undo: SpeakerAssignUndo };

// ponytail: one in-memory step. A crash drops it, and it is not atomic with the sqlite commit. No table; user_version stays 27.
let activeSessionId: string | undefined;
let step: { sessionId: string; edit: SessionEdit } | undefined;

export function bindSessionEdit(sessionId: string): void {
  activeSessionId = sessionId;
}

export function expireSessionEdit(): void {
  activeSessionId = undefined;
  step = undefined;
}

export function rememberSessionEdit(sessionId: string, edit: SessionEdit): void {
  if (activeSessionId !== sessionId) return;
  step = { sessionId, edit };
}

export function clearSessionEdit(sessionId?: string): void {
  if (sessionId === undefined || step?.sessionId === sessionId) step = undefined;
}

export function undoSessionEdit(
  sessionId: string,
  db: SqliteDatabase,
  only?: 'text',
): Unit | Unit[] {
  const current = step?.sessionId === sessionId && activeSessionId === sessionId ? step.edit : null;
  if (current === null || (only === 'text' && current.kind !== 'text')) {
    throw new Error('unit text undo is empty');
  }
  try {
    const undone = applySessionEdit(db, current);
    clearSessionEdit(sessionId);
    return undone;
  } catch (error) {
    if (error instanceof Error && error.message.endsWith('undo is stale')) {
      clearSessionEdit(sessionId);
    }
    throw error;
  }
}

function applySessionEdit(db: SqliteDatabase, edit: SessionEdit): Unit | Unit[] {
  switch (edit.kind) {
    case 'text':
      return undoUnitText(db, edit.undo);
    case 'split':
      return undoSplit(db, edit.undo);
    case 'merge':
      return undoMerge(db, edit.undo);
    case 'assign':
      return undoAssignSpeaker(db, edit.undo);
    default: {
      const unreachable: never = edit;
      return unreachable;
    }
  }
}
