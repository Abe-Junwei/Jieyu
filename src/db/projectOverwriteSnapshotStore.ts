/**
 * 覆盖前快照（rev5 7.4-3，D5，T33）：覆盖当前项目之前，先把这个项目的全部内容与目录存一份。
 * Pre-overwrite snapshots (rev5 7.4-3, D5, T33): before a project is overwritten, its content and
 * catalog rows are saved here first.
 *
 * - 单独的库，登记为 recovery 数据类；不进任何包。
 * - 写完立即读回核对；写入或核对失败时抛错，调用方中止覆盖（“快照失败就中止”）。
 * - 每个项目保留最近 3 份。
 * - 快照不含媒体与附件字节：覆盖时本机字节一律保留，不能保留就中止（4.2-7），所以字节不会丢。
 * A separate database registered as recovery data; never packaged. The snapshot is read back right
 * after the write; any failure throws and the caller aborts the overwrite. The latest 3 snapshots
 * per project are kept. Bytes are not copied: an overwrite keeps every local byte or aborts.
 */
import Dexie, { type Table } from 'dexie';

export const JIEYU_OVERWRITE_SNAPSHOT_DB_NAME = 'jieyu_overwrite_snapshots' as const;
/** 每个项目保留的快照份数 | Snapshots kept per project */
export const OVERWRITE_SNAPSHOTS_PER_PROJECT = 3;

export interface ProjectOverwriteSnapshotRow {
  seq?: number;
  projectId: string;
  createdAt: string;
  /** 触发覆盖的包类型 | Package kind that triggered the overwrite */
  packageKind: 'jyt' | 'jym' | 'jyb';
  /** 快照结构版本（SNAPSHOT_SCHEMA_VERSION）| Snapshot schema version */
  schemaVersion: number;
  rowCount: number;
  snapshotJson: string;
}

class OverwriteSnapshotDexie extends Dexie {
  snapshots!: Table<ProjectOverwriteSnapshotRow, number>;
  constructor() {
    super(JIEYU_OVERWRITE_SNAPSHOT_DB_NAME);
    this.version(1).stores({ snapshots: '++seq, projectId, createdAt' });
  }
}

let instance: OverwriteSnapshotDexie | undefined;
function getStore(): OverwriteSnapshotDexie {
  if (!instance) instance = new OverwriteSnapshotDexie();
  return instance;
}

/**
 * 保存一份覆盖前快照并读回核对；返回快照序号。失败时抛错。
 * Save one pre-overwrite snapshot and verify it by reading it back; returns its seq. Throws on failure.
 */
export async function saveProjectOverwriteSnapshot(input: {
  projectId: string;
  packageKind: ProjectOverwriteSnapshotRow['packageKind'];
  snapshot: { schemaVersion: number; collections: Record<string, unknown[]> };
}): Promise<number> {
  const snapshotJson = JSON.stringify(input.snapshot);
  const rowCount = Object.values(input.snapshot.collections).reduce(
    (sum, rows) => sum + (Array.isArray(rows) ? rows.length : 0),
    0,
  );
  const store = getStore();
  const seq = await store.snapshots.add({
    projectId: input.projectId,
    createdAt: new Date().toISOString(),
    packageKind: input.packageKind,
    schemaVersion: input.snapshot.schemaVersion,
    rowCount,
    snapshotJson,
  });
  const readBack = await store.snapshots.get(seq);
  if (readBack?.snapshotJson !== snapshotJson) {
    throw new Error('Pre-overwrite snapshot could not be verified after writing');
  }
  const all = await store.snapshots.where('projectId').equals(input.projectId).sortBy('seq');
  const stale = all.slice(0, Math.max(0, all.length - OVERWRITE_SNAPSHOTS_PER_PROJECT));
  if (stale.length > 0) {
    await store.snapshots.bulkDelete(stale.map((row) => row.seq!));
  }
  return seq;
}

/** 列出某个项目的覆盖前快照（新的在前）| List a project's pre-overwrite snapshots, newest first */
export async function listProjectOverwriteSnapshots(
  projectId: string,
): Promise<ProjectOverwriteSnapshotRow[]> {
  const rows = await getStore().snapshots.where('projectId').equals(projectId).sortBy('seq');
  return rows.reverse();
}
