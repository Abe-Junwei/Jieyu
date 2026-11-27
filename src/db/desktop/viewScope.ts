import type Database from 'better-sqlite3';
import { timedDescendants } from './unitEdges';

type SqliteDatabase = InstanceType<typeof Database>;

/** Workspace view snapshot. Absent on a call means legacy full-manuscript semantics. */
export type ViewScope =
  | { manuscriptId: string; kind: 'all' }
  | {
      manuscriptId: string;
      kind: 'speakers';
      speakerIds: readonly string[];
      includeUnassigned: boolean;
    };

export type ViewScopeWrite = {
  viewScope?: ViewScope | undefined;
  expectedAffectedUnitIds?: readonly string[] | undefined;
};

type UnitScopeRow = { manuscriptId: string; speakerId: string | null };

function sortedUnique(ids: readonly string[]): string[] {
  return [...new Set(ids)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

export function normalizeSpeakerIds(ids: readonly string[]): string[] {
  return sortedUnique(ids);
}

export function unitVisibleInScope(unit: UnitScopeRow, scope: ViewScope): boolean {
  if (unit.manuscriptId !== scope.manuscriptId) return false;
  if (scope.kind === 'all') return true;
  if (unit.speakerId === null) return scope.includeUnassigned;
  return scope.speakerIds.includes(unit.speakerId);
}

function unitScopeRow(db: SqliteDatabase, unitId: string): UnitScopeRow {
  const row = db
    .prepare(
      `SELECT layers.manuscript_id AS manuscriptId, units.speaker_id AS speakerId
       FROM units
       JOIN layers ON layers.id = units.layer_id
       WHERE units.id = ?`,
    )
    .get(unitId) as UnitScopeRow | undefined;
  if (row === undefined) throw new Error('unit is missing');
  return row;
}

/**
 * When `viewScope` is set, rejects hidden or cross-manuscript affected units and mismatches
 * against `expectedAffectedUnitIds`. Create / retime pass `forbidWhenFiltered`.
 */
export function assertWriteViewScope(
  db: SqliteDatabase,
  input: {
    viewScope?: ViewScope | undefined;
    expectedAffectedUnitIds?: readonly string[] | undefined;
    affectedUnitIds: readonly string[];
    forbidWhenFiltered?: boolean | undefined;
  },
): void {
  const { viewScope } = input;
  if (viewScope === undefined) {
    if (input.expectedAffectedUnitIds !== undefined) {
      throw new Error('viewScope is required');
    }
    return;
  }
  if (input.expectedAffectedUnitIds === undefined) {
    throw new Error('expectedAffectedUnitIds is required');
  }
  if (viewScope.kind === 'speakers' && input.forbidWhenFiltered === true) {
    throw new Error('view scope forbids this write');
  }
  const expected = sortedUnique(input.expectedAffectedUnitIds);
  const affected = sortedUnique(input.affectedUnitIds);
  if (expected.length !== affected.length || expected.some((id, index) => id !== affected[index])) {
    throw new Error('affected units mismatch');
  }
  for (const id of affected) {
    const unit = unitScopeRow(db, id);
    if (!unitVisibleInScope(unit, viewScope)) {
      throw new Error('unit is outside view scope');
    }
  }
}

export function manuscriptIdOfLayer(db: SqliteDatabase, layerId: string): string {
  const row = db
    .prepare('SELECT manuscript_id AS manuscriptId FROM layers WHERE id = ?')
    .get(layerId) as { manuscriptId: string } | undefined;
  if (row === undefined) throw new Error('layer is missing');
  return row.manuscriptId;
}

export function assertViewScopeManuscript(
  scope: ViewScope | undefined,
  manuscriptId: string,
): void {
  if (scope === undefined) return;
  if (scope.manuscriptId !== manuscriptId) throw new Error('view scope manuscript mismatch');
}

/** Unit plus timed subdivision descendants that move with a span shift. */
export function spanAffectedUnitIds(db: SqliteDatabase, unitId: string): string[] {
  return [unitId, ...timedDescendants(db, unitId).map((row) => row.id)];
}

/** Complete structural closure, including untimed descendants. */
export function subtreeAffectedUnitIds(db: SqliteDatabase, unitId: string): string[] {
  return (
    db
      .prepare(
        `WITH RECURSIVE affected(id) AS (
    SELECT id FROM units WHERE id = ?
    UNION SELECT units.id FROM units JOIN affected ON units.parent_unit_id = affected.id
  ) SELECT id FROM affected`,
      )
      .all(unitId) as { id: string }[]
  ).map((row) => row.id);
}
