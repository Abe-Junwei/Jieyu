/**
 * 项目行的事务写入原语（rev5 4.2-5，F3 / N5）。
 * Transactional write primitives for the project row (rev5 4.2-5, F3 / N5).
 *
 * 读、算、写放在同一个读写事务里，用 `put` 覆盖同一主键，不再先 remove 再 insert：
 * - 并发的两次修改不会互相覆盖（各自在自己的事务里读到最新行，T16）；
 * - 写入校验（DBCore 中间件）失败时事务回滚，项目行原样保留（T17）；
 * - 项目不存在时返回 `{ status: 'not-found' }`，需要报错的调用方用 `requireProjectPatch`。
 * Read, compute and write in one read-write transaction and overwrite with `put` (never remove then
 * insert): concurrent edits do not lose updates, a write-validation failure rolls back and leaves the
 * row intact, and a missing project is an explicit result.
 */
import { getDb, type TextDocType } from '../db';
import { withTransaction } from '../db/withTransaction';

export type ProjectPatchResult =
  | { status: 'updated'; text: TextDocType }
  | { status: 'unchanged'; text: TextDocType }
  | { status: 'not-found' };

/** 项目行不存在 | The project row does not exist */
export class ProjectNotFoundError extends Error {
  constructor(public readonly textId: string) {
    super(`project "${textId}" does not exist`);
    this.name = 'ProjectNotFoundError';
  }
}

/** 返回下一版完整项目行；返回 `null` 表示不需要写 | Return the next full row, or `null` for no write */
export type ProjectTextPatch = (current: TextDocType) => TextDocType | null;

/** 返回下一版 metadata；返回 `null` 表示不需要写 | Return the next metadata, or `null` for no write */
export type ProjectMetadataPatch = (
  metadata: Record<string, unknown>,
  current: TextDocType,
) => Record<string, unknown> | null;

function metadataOf(text: TextDocType): Record<string, unknown> {
  return text.metadata !== null && typeof text.metadata === 'object'
    ? (text.metadata as Record<string, unknown>)
    : {};
}

function unwrapTransactionError(error: unknown): unknown {
  // withTransaction 会包一层前缀；把领域错误原样抛回 | withTransaction wraps errors; rethrow the domain error
  return error instanceof Error && error.cause instanceof Error ? error.cause : error;
}

/**
 * 在一个读写事务里修改项目行（可嵌套在包含 texts 的事务里）。
 * Patch the project row in one read-write transaction (may nest in a transaction that has texts).
 */
export async function patchProjectText(
  textId: string,
  patch: ProjectTextPatch,
): Promise<ProjectPatchResult> {
  const id = textId.trim();
  if (id.length === 0) return { status: 'not-found' };
  const db = await getDb();
  try {
    return await withTransaction(
      db,
      'rw',
      [db.dexie.texts],
      async (): Promise<ProjectPatchResult> => {
        const current = await db.dexie.texts.get(id);
        if (!current) return { status: 'not-found' };
        const next = patch(current);
        if (next === null) return { status: 'unchanged', text: current };
        const stamped: TextDocType = { ...next, id, updatedAt: new Date().toISOString() };
        await db.dexie.texts.put(stamped);
        return { status: 'updated', text: stamped };
      },
      { label: 'projectMetadataPatch' },
    );
  } catch (error) {
    throw unwrapTransactionError(error);
  }
}

/** 只改 metadata 的常用形式 | The common metadata-only form */
export async function patchProjectMetadata(
  textId: string,
  patch: ProjectMetadataPatch,
): Promise<ProjectPatchResult> {
  return patchProjectText(textId, (current) => {
    const next = patch(metadataOf(current), current);
    return next === null ? null : { ...current, metadata: next };
  });
}

/** 项目不存在时抛 `ProjectNotFoundError`，否则返回写入后的行 | Throw when missing, else return the row */
export function requireProjectPatch(textId: string, result: ProjectPatchResult): TextDocType {
  if (result.status === 'not-found') throw new ProjectNotFoundError(textId);
  return result.text;
}
