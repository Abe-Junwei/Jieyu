/**
 * 从覆盖前快照与整库快照恢复（用户决定 2026-10-09；7.4-3、D5、D7 的恢复入口）。
 * Restore from pre-overwrite and whole-database snapshots (user decision 2026-10-09; the restore
 * entry for 7.4-3, D5 and D7).
 *
 * - 列表：时间、项目（整库快照写项目数）、大小、条数。
 * - 预览：每张表快照里与本机现有的条数；能不能恢复、为什么。
 * - 恢复：只在项目（整库时是本机和快照里的全部项目）从未协作过时可用；会丢本机媒体 / 附件 / 原件
 *   字节时整体中止（快照不含字节：同 id 的行沿用本机字节，快照里没有的带字节行一律算会丢）。
 *   恢复前先把当前状态再存一份快照（失败就中止），写事务里再判定一次，写完读回核对。
 * - 整库快照：替换快照里出现的表；记下的偏好旧值一起写回。
 * List: time, project (project count for library snapshots), size, rows. Preview: per-table rows in
 * the snapshot vs. on this device, plus whether and why it can be restored. Restore: only when the
 * project(s) never collaborated; aborts when any local media / attachment / source byte would be lost
 * (snapshots carry no bytes: same-id rows keep local bytes, byte rows missing from the snapshot
 * count as lost). The current state is snapshotted first (abort on failure), the write transaction
 * re-checks, and the result is read back and compared.
 */
import { ProjectOverwriteBlockedError } from '../db/snapshotFormatError';
import { listCollaboratedIds } from '../collaboration/cloud/projectCollaborationHistory';
import { byteGuardTables, findBytesAtRisk } from './projectPackageService';
import { JYB_SKIPPED_COLLECTIONS, LIBRARY_SNAPSHOT_KEY } from './JybService';
import {
  readCurrentUserPreferences,
  restoreRecordedUserPreferences,
} from './userPreferencesBackup';

type Row = Record<string, unknown>;
type Collections = Record<string, Row[]>;
type DbIoModule = typeof import('../db/io');
type DbEngineModule = typeof import('../db/engine');
type ProjectSnapshotModule = typeof import('../db/projectScopedSnapshot');
type ProjectPurgeModule = typeof import('../db/projectLocalPurge');
type WithTransactionModule = typeof import('../db/withTransaction');
type SnapshotStoreModule = typeof import('../db/projectOverwriteSnapshotStore');
type SnapshotRow = import('../db/projectOverwriteSnapshotStore').ProjectOverwriteSnapshotRow;

export interface OverwriteSnapshotSummary {
  seq: number;
  scope: 'project' | 'library';
  /** 项目快照的项目 id；整库快照为 null | Project id; null for library snapshots */
  projectId: string | null;
  /** 快照里项目的标题 | Project title inside the snapshot */
  projectTitle?: Record<string, string>;
  /** 快照里的项目数 | Projects inside the snapshot */
  projectCount: number;
  createdAt: string;
  packageKind: SnapshotRow['packageKind'];
  rowCount: number;
  /** 快照 JSON 的字节数 | Snapshot JSON size in bytes */
  sizeBytes: number;
}

export type OverwriteSnapshotBlockedReason =
  | 'collaborated'
  | 'local-bytes-would-be-lost'
  | 'unsupported-version';

export interface OverwriteSnapshotPreview {
  summary: OverwriteSnapshotSummary;
  collections: Array<{ name: string; snapshotRows: number; currentRows: number }>;
  /** 整库快照记下、恢复时写回的偏好键 | Preference keys a library snapshot puts back */
  preferenceKeys: string[];
  available: boolean;
  reason?: OverwriteSnapshotBlockedReason;
  bytesAtRisk: string[];
}

export interface OverwriteSnapshotRestoreResult {
  restoredSeq: number;
  scope: 'project' | 'library';
  projectId: string | null;
  /** 恢复前当前状态的快照序号 | Seq of the snapshot of the state before this restore */
  preRestoreSnapshotSeq: number;
  /** 读回核对的行数 | Rows read back and verified */
  verifiedRows: number;
  restoredPreferenceKeys: string[];
}

/** 写完读回核对不一致 | Read-back after the write did not match */
export class OverwriteSnapshotVerifyError extends Error {
  readonly missing: readonly string[];
  readonly preRestoreSnapshotSeq: number;
  constructor(missing: readonly string[], preRestoreSnapshotSeq: number) {
    super(
      `Snapshot restore wrote data but ${missing.length} row(s) could not be read back; the state before the restore is kept as snapshot ${preRestoreSnapshotSeq}.`,
    );
    this.name = 'OverwriteSnapshotVerifyError';
    this.missing = missing;
    this.preRestoreSnapshotSeq = preRestoreSnapshotSeq;
  }
}

interface ParsedSnapshot {
  schemaVersion: number;
  collections: Collections;
  preferences: Array<{ key: string; value: string | null }>;
}

function parseSnapshot(row: SnapshotRow): ParsedSnapshot {
  const raw = JSON.parse(row.snapshotJson) as {
    schemaVersion?: unknown;
    collections?: unknown;
    preferences?: unknown;
  };
  const collections: Collections = {};
  if (raw.collections !== null && typeof raw.collections === 'object') {
    for (const [name, rows] of Object.entries(raw.collections as Record<string, unknown>)) {
      collections[name] = Array.isArray(rows) ? (rows as Row[]) : [];
    }
  }
  const preferences = Array.isArray(raw.preferences)
    ? (raw.preferences as unknown[]).flatMap((entry) => {
        const e = entry as { key?: unknown; value?: unknown };
        return typeof e.key === 'string' && (typeof e.value === 'string' || e.value === null)
          ? [{ key: e.key, value: e.value }]
          : [];
      })
    : [];
  return {
    schemaVersion: typeof raw.schemaVersion === 'number' ? raw.schemaVersion : row.schemaVersion,
    collections,
    preferences,
  };
}

function summarize(row: SnapshotRow, parsed: ParsedSnapshot): OverwriteSnapshotSummary {
  const library = row.projectId === LIBRARY_SNAPSHOT_KEY;
  const texts = parsed.collections.texts ?? [];
  const title = !library ? texts.find((t) => t.id === row.projectId)?.title : undefined;
  return {
    seq: row.seq!,
    scope: library ? 'library' : 'project',
    projectId: library ? null : row.projectId,
    ...(title !== null && typeof title === 'object'
      ? { projectTitle: title as Record<string, string> }
      : {}),
    projectCount: texts.length,
    createdAt: row.createdAt,
    packageKind: row.packageKind,
    rowCount: row.rowCount,
    sizeBytes: new TextEncoder().encode(row.snapshotJson).byteLength,
  };
}

/** 全部快照，新的在前 | Every snapshot, newest first */
export async function listOverwriteSnapshots(): Promise<OverwriteSnapshotSummary[]> {
  const store = (await import('../db/projectOverwriteSnapshotStore')) as SnapshotStoreModule;
  const rows = await store.listAllOverwriteSnapshots();
  return rows.map((row) => summarize(row, parseSnapshot(row)));
}

async function loadSnapshot(seq: number): Promise<{ row: SnapshotRow; parsed: ParsedSnapshot }> {
  const store = (await import('../db/projectOverwriteSnapshotStore')) as SnapshotStoreModule;
  const row = await store.getOverwriteSnapshot(seq);
  if (!row) throw new Error(`Snapshot ${seq} no longer exists`);
  return { row, parsed: parseSnapshot(row) };
}

/** 当前状态（与快照同口径）| Current state, scoped the same way as the snapshot */
async function exportCurrent(projectId: string | null): Promise<{
  schemaVersion: number;
  collections: Collections;
}> {
  if (projectId === null) {
    const dbIo = (await import('../db/io')) as DbIoModule;
    const full = await dbIo.exportDatabaseAsJson({
      skipCollections: JYB_SKIPPED_COLLECTIONS,
      includeProjectAi: true,
    });
    return { schemaVersion: full.schemaVersion, collections: full.collections as Collections };
  }
  const scoped = (await import('../db/projectScopedSnapshot')) as ProjectSnapshotModule;
  const current = await scoped.exportProjectScopedDatabaseAsJson(projectId);
  return { schemaVersion: current.schemaVersion, collections: current.collections as Collections };
}

async function collaboratedIds(
  projectId: string | null,
  parsed: ParsedSnapshot,
): Promise<string[]> {
  if (projectId !== null) return listCollaboratedIds([projectId]);
  const engine = (await import('../db/engine')) as DbEngineModule;
  const db = await engine.getDb();
  const localIds = ((await db.dexie.table('texts').toArray()) as Row[]).map((row) =>
    String(row.id),
  );
  const snapshotIds = (parsed.collections.texts ?? []).map((row) => String(row.id));
  return listCollaboratedIds([...localIds, ...snapshotIds]);
}

async function evaluate(
  projectId: string | null,
  parsed: ParsedSnapshot,
): Promise<{ reason?: OverwriteSnapshotBlockedReason; bytesAtRisk: string[] }> {
  const dbIo = (await import('../db/io')) as DbIoModule;
  try {
    dbIo.assertSupportedSnapshotVersion({ schemaVersion: parsed.schemaVersion });
  } catch {
    return { reason: 'unsupported-version', bytesAtRisk: [] };
  }
  if ((await collaboratedIds(projectId, parsed)).length > 0) {
    return { reason: 'collaborated', bytesAtRisk: [] };
  }
  const engine = (await import('../db/engine')) as DbEngineModule;
  const db = await engine.getDb();
  const bytesAtRisk = await findBytesAtRisk(db.dexie, projectId, parsed.collections, new Map());
  return bytesAtRisk.length > 0
    ? { reason: 'local-bytes-would-be-lost', bytesAtRisk }
    : { bytesAtRisk: [] };
}

/** 预览一份快照 | Preview one snapshot */
export async function previewOverwriteSnapshot(seq: number): Promise<OverwriteSnapshotPreview> {
  const { row, parsed } = await loadSnapshot(seq);
  const summary = summarize(row, parsed);
  const current = await exportCurrent(summary.projectId);
  const names = Object.keys(parsed.collections).sort();
  const verdict = await evaluate(summary.projectId, parsed);
  return {
    summary,
    collections: names.map((name) => ({
      name,
      snapshotRows: parsed.collections[name]!.length,
      currentRows: current.collections[name]?.length ?? 0,
    })),
    preferenceKeys: parsed.preferences.map((p) => p.key),
    available: verdict.reason === undefined,
    ...(verdict.reason ? { reason: verdict.reason } : {}),
    bytesAtRisk: verdict.bytesAtRisk,
  };
}

function rowKey(row: Row): string | null {
  return typeof row.id === 'string' || typeof row.id === 'number' ? String(row.id) : null;
}

/** 快照里每一行都要读得回来 | Every snapshot row must be readable afterwards */
function findMissingRows(snapshot: Collections, after: Collections): string[] {
  const missing: string[] = [];
  for (const [name, rows] of Object.entries(snapshot)) {
    const present = new Set((after[name] ?? []).map(rowKey));
    const unkeyed = rows.filter((row) => rowKey(row) === null).length;
    if (unkeyed > 0 && (after[name]?.length ?? 0) < rows.length) missing.push(`${name}:*`);
    for (const row of rows) {
      const key = rowKey(row);
      if (key !== null && !present.has(key)) missing.push(`${name}:${key}`);
    }
  }
  return missing;
}

function blockedError(reason: OverwriteSnapshotBlockedReason, bytesAtRisk: string[]): Error {
  return new ProjectOverwriteBlockedError({
    reason: reason === 'local-bytes-would-be-lost' ? 'local-bytes-would-be-lost' : 'not-allowed',
    message:
      reason === 'collaborated'
        ? 'Snapshot restore is only offered for projects that have never been collaborated on.'
        : reason === 'unsupported-version'
          ? 'Snapshot restore aborted: the snapshot comes from an unsupported data version.'
          : `Snapshot restore aborted: ${bytesAtRisk.length} local recording/attachment byte(s) would be lost.`,
    bytesAtRisk,
  });
}

/**
 * 恢复一份快照。二次确认在界面上完成。
 * Restore one snapshot. The double confirm happens in the UI.
 */
export async function restoreOverwriteSnapshot(
  seq: number,
): Promise<OverwriteSnapshotRestoreResult> {
  const [dbIo, scoped, purge, tx, store, engine] = await Promise.all([
    import('../db/io') as Promise<DbIoModule>,
    import('../db/projectScopedSnapshot') as Promise<ProjectSnapshotModule>,
    import('../db/projectLocalPurge') as Promise<ProjectPurgeModule>,
    import('../db/withTransaction') as Promise<WithTransactionModule>,
    import('../db/projectOverwriteSnapshotStore') as Promise<SnapshotStoreModule>,
    import('../db/engine') as Promise<DbEngineModule>,
  ]);
  const { row, parsed } = await loadSnapshot(seq);
  const summary = summarize(row, parsed);
  const projectId = summary.projectId;
  const verdict = await evaluate(projectId, parsed);
  if (verdict.reason) throw blockedError(verdict.reason, verdict.bytesAtRisk);

  // 恢复前把当前状态存一份（失败就中止）| Snapshot the current state first (abort on failure)
  let preRestoreSnapshotSeq: number;
  try {
    const before = await exportCurrent(projectId);
    preRestoreSnapshotSeq = await store.saveProjectOverwriteSnapshot({
      projectId: projectId ?? LIBRARY_SNAPSHOT_KEY,
      packageKind: 'snapshot-restore',
      snapshot: {
        schemaVersion: before.schemaVersion,
        collections: before.collections,
        ...(parsed.preferences.length > 0
          ? { preferences: readCurrentUserPreferences(parsed.preferences.map((p) => p.key)) }
          : {}),
      },
    });
  } catch (error) {
    throw new ProjectOverwriteBlockedError({
      reason: 'snapshot-failed',
      message: `Snapshot restore aborted: saving the current state failed (${error instanceof Error ? error.message : String(error)}).`,
      cause: error,
    });
  }

  const db = await engine.getDb();
  const recheck = async (): Promise<void> => {
    // 预览之后可能又有写入：在写事务里再判定一次 | Re-check inside the write transaction
    const atRisk = await findBytesAtRisk(db.dexie, projectId, parsed.collections, new Map());
    const collaborated = await collaboratedIds(projectId, parsed);
    if (atRisk.length > 0 || collaborated.length > 0) {
      throw blockedError(atRisk.length > 0 ? 'local-bytes-would-be-lost' : 'collaborated', atRisk);
    }
  };
  const input = { schemaVersion: parsed.schemaVersion, collections: parsed.collections };
  if (projectId === null) {
    const byteTables = byteGuardTables(db.dexie);
    // 只替换快照里出现的表 | Only the tables present in the snapshot are replaced
    await dbIo.importDatabaseFromJson(input, {
      strategy: 'replace-all',
      keepProjectAi: true,
      preWrite: { tables: byteTables, run: recheck },
    });
  } else {
    const purgeStores = purge.projectPurgeStores(db.dexie, 'replace-content');
    await dbIo.importDatabaseFromJson(input, {
      strategy: 'upsert',
      preWrite: {
        tables: purgeStores,
        run: async () => {
          await recheck();
          await tx.withTransaction(
            db,
            'rw',
            purgeStores,
            () => purge.purgeProjectRows(db.dexie, projectId, 'replace-content'),
            { label: 'overwriteSnapshot.restore.purge' },
          );
        },
      },
    });
  }
  await scoped.dropLexemeLinksWithMissingTargets();
  const restoredPreferenceKeys =
    projectId === null ? restoreRecordedUserPreferences(parsed.preferences) : [];

  // 写完读回核对 | Read back and compare
  const after = await exportCurrent(projectId);
  const missing = findMissingRows(parsed.collections, after.collections);
  if (missing.length > 0) throw new OverwriteSnapshotVerifyError(missing, preRestoreSnapshotSeq);
  return {
    restoredSeq: seq,
    scope: summary.scope,
    projectId,
    preRestoreSnapshotSeq,
    verifiedRows: Object.values(parsed.collections).reduce((sum, rows) => sum + rows.length, 0),
    restoredPreferenceKeys,
  };
}
