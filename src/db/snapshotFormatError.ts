/**
 * 导入快照 / 项目包的格式错误（RD-1、rev5 7.4-7）。
 * Format errors of inbound snapshots and project packages (RD-1, rev5 7.4-7).
 *
 * 预览和导入都在写入前抛出它；界面按 `code` 选文案，不显示原始 zod 信息。
 * Preview and import throw it before any write; the UI picks its text by `code` instead of showing
 * raw zod output.
 */

/** 2A 基线重置之前的旧主库名（D10）| Main-DB name before the 2A baseline reset (D10) */
export const LEGACY_MAIN_DB_NAME = 'jieyudb_v2';

export type SnapshotFormatErrorCode =
  /** 来自 2A 之前的旧库（jieyudb_v2）或更早的快照版本 | From the pre-2A database or an older snapshot version */
  | 'legacy-database'
  /** 版本号比当前应用新，或不是数字 | Newer than this app, or not a number */
  | 'unsupported-version'
  /** 有记录不符合当前结构 | Some records fail the current schema */
  | 'invalid-records'
  /** 不认识的包格式或包版本（例如第 3 批之前的整库 JYT）| Unknown package format or version (e.g. the pre-batch-3 whole-DB JYT) */
  | 'unsupported-package'
  /** 包的清单、文件或引用不一致（rev5 7.2，T31）| Package manifest, files or references are inconsistent (rev5 7.2, T31) */
  | 'invalid-package';

export interface SnapshotInvalidCollection {
  collection: string;
  /** 不合格的行数 | Number of invalid rows */
  invalid: number;
  /** 第一条问题（只含字段路径和原因，不含正文）| First issue: field path and reason only, never row content */
  firstIssue: string;
}

export class SnapshotFormatError extends Error {
  readonly code: SnapshotFormatErrorCode;
  readonly schemaVersion: number | null;
  readonly dbName: string | null;
  readonly invalidCollections: readonly SnapshotInvalidCollection[];
  /** 包检查发现的全部问题（不含正文）| Every problem found by the package check (no row content) */
  readonly problems: readonly string[];

  constructor(input: {
    code: SnapshotFormatErrorCode;
    message: string;
    schemaVersion?: number | null;
    dbName?: string | null;
    invalidCollections?: readonly SnapshotInvalidCollection[];
    problems?: readonly string[];
  }) {
    super(input.message);
    this.name = 'SnapshotFormatError';
    this.code = input.code;
    this.schemaVersion = input.schemaVersion ?? null;
    this.dbName = input.dbName ?? null;
    this.invalidCollections = input.invalidCollections ?? [];
    this.problems = input.problems ?? [];
  }
}

/** 取出（可能被包装的）格式错误 | Unwrap a possibly wrapped format error */
export function findSnapshotFormatError(error: unknown): SnapshotFormatError | null {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current !== null && current !== undefined; depth += 1) {
    if (current instanceof SnapshotFormatError) return current;
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}

export type ProjectOverwriteBlockedReason =
  /** 没有当前项目、项目不存在，或协作过 / 判定不了（D5、D6）| No such project, or collaborated / unknown */
  | 'not-allowed'
  /** 覆盖会丢掉本机媒体、附件或原件字节（4.2-7）| Local media / attachment / original bytes would be lost */
  | 'local-bytes-would-be-lost'
  /** 覆盖前快照写入或核对失败（7.4-3）| The pre-overwrite snapshot failed */
  | 'snapshot-failed';

/**
 * 覆盖当前项目被拒绝；抛出时本机数据没有任何改动。
 * Overwriting the current project was refused; nothing local has changed.
 */
export class ProjectOverwriteBlockedError extends Error {
  readonly reason: ProjectOverwriteBlockedReason;
  /** 会丢字节的行（collection:id）| Rows whose bytes would be lost (collection:id) */
  readonly bytesAtRisk: readonly string[];

  constructor(input: {
    reason: ProjectOverwriteBlockedReason;
    message: string;
    bytesAtRisk?: readonly string[];
    cause?: unknown;
  }) {
    super(input.message);
    this.name = 'ProjectOverwriteBlockedError';
    if (input.cause !== undefined) (this as { cause?: unknown }).cause = input.cause;
    this.reason = input.reason;
    this.bytesAtRisk = input.bytesAtRisk ?? [];
  }
}
