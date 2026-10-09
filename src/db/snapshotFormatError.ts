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
  | 'invalid-records';

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

  constructor(input: {
    code: SnapshotFormatErrorCode;
    message: string;
    schemaVersion?: number | null;
    dbName?: string | null;
    invalidCollections?: readonly SnapshotInvalidCollection[];
  }) {
    super(input.message);
    this.name = 'SnapshotFormatError';
    this.code = input.code;
    this.schemaVersion = input.schemaVersion ?? null;
    this.dbName = input.dbName ?? null;
    this.invalidCollections = input.invalidCollections ?? [];
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
