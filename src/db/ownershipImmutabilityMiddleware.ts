/**
 * 项目归属不可变（切片 2B-G / JY-03）| Project ownership is immutable (slice 2B-G / JY-03)
 *
 * 已存在的行不能被改写到另一个项目：`textId` / `projectId` 这类归属字段，以及 token / morpheme /
 * 词条链接指向父行的字段，一旦写入就不能再变。要把内容放进另一个项目，只能用新 id 新建行
 * （见 LIFT 跨项目导入的 id 重建），中间件不留后门。
 *
 * 实现要点（与代码审查约定，见 next-slices-notes）：
 * - DBCore 中间件，只拦 `put`（`add` 撞已有主键本来就会 ConstraintError，`delete` 不改归属）。
 *   Dexie 4 的 Table.update / bulkUpdate / Collection.modify（函数或对象）都会以 `put` 到达 DBCore，
 *   所以这里比较的是即将写入的最终值，而不是 changeSpec。
 * - 在同一事务里用下层 `getMany(trans, keys)` 读旧行（这是 IDB 请求，事务内允许），再逐字段比较。
 * - 内联主键表上 put/bulkPut 的 `req.keys` 是 undefined，用 `primaryKey.extractKey` 从值里取键；
 *   外联主键表用 `req.keys`。
 * - level 1：位于 Dexie hooks 中间件（level 2）之下，能看到 hooks 之后的最终值；也在 zod 写入校验
 *   （默认 level 10）之下。
 * - 旧行该字段为空（历史数据缺归属）时允许补写；只拒绝「已有值 → 不同值」。
 *
 * An existing row can never be rewritten into another project: ownership fields (`textId` /
 * `projectId`) and the parent references of tokens / morphemes / lexeme links are write-once.
 * Moving content to another project means new rows with new ids; the middleware has no backdoor.
 * Only `put` is intercepted (update / bulkUpdate / modify all reach DBCore as put, so the FINAL
 * values are compared). Old rows are read in the same transaction via downlevel `getMany`.
 * Inbound-key tables carry no `req.keys` on put, so keys come from `primaryKey.extractKey`.
 * Level 1 sits below the hooks middleware (level 2) and the zod validation middleware (level 10).
 */
import type { DBCore, DBCoreMutateRequest, DBCoreTable, Middleware } from 'dexie';

export class JieyuOwnershipImmutabilityError extends Error {
  constructor(
    public readonly tableName: string,
    public readonly fieldPath: string,
    public readonly rowKey: unknown,
    public readonly previousValue: unknown,
    public readonly nextValue: unknown,
  ) {
    super(
      `Write rejected for table "${tableName}" at field "${fieldPath}": row ${JSON.stringify(rowKey)} belongs to ${JSON.stringify(previousValue)} and cannot be moved to ${JSON.stringify(nextValue)}; create a new row with a new id instead`,
    );
    this.name = 'JieyuOwnershipImmutabilityError';
  }
}

/** 表名 → 写入后不可再改的字段 | Table name → fields that are write-once */
export type OwnershipImmutableFieldRules = Readonly<Record<string, readonly string[]>>;

const MIDDLEWARE_NAME = 'jieyuOwnershipImmutability';

function isPresent(value: unknown): boolean {
  return value !== undefined && value !== null && value !== '';
}

function fieldOf(row: unknown, field: string): unknown {
  if (row === null || typeof row !== 'object') return undefined;
  return (row as Record<string, unknown>)[field];
}

function keysOf(table: DBCoreTable, req: Extract<DBCoreMutateRequest, { type: 'put' }>): unknown[] {
  // 内联主键的 put 上 keys 为 undefined / null | Inbound-key puts carry undefined / null keys
  if (req.keys !== undefined && req.keys !== null) return [...req.keys];
  const extractKey = table.schema.primaryKey.extractKey;
  if (!extractKey) return req.values.map(() => undefined);
  return req.values.map((value) => extractKey(value));
}

function assertUnchanged(
  tableName: string,
  fields: readonly string[],
  key: unknown,
  previous: unknown,
  next: unknown,
): void {
  if (previous === undefined) return;
  for (const field of fields) {
    const before = fieldOf(previous, field);
    if (!isPresent(before)) continue;
    const after = fieldOf(next, field);
    if (after !== before) {
      throw new JieyuOwnershipImmutabilityError(tableName, field, key, before, after);
    }
  }
}

export function createOwnershipImmutabilityMiddleware(
  rules: OwnershipImmutableFieldRules,
): Middleware<DBCore> {
  return {
    stack: 'dbcore',
    name: MIDDLEWARE_NAME,
    level: 1,
    create(down) {
      return {
        ...down,
        table(tableName) {
          const downTable = down.table(tableName);
          const fields = rules[tableName];
          if (!fields || fields.length === 0) return downTable;
          return {
            ...downTable,
            mutate(req) {
              if (req.type !== 'put' || req.values.length === 0) return downTable.mutate(req);
              const keys = keysOf(downTable, req);
              const lookups: Array<{ index: number; key: unknown }> = [];
              keys.forEach((key, index) => {
                if (key !== undefined && key !== null) lookups.push({ index, key });
              });
              if (lookups.length === 0) return downTable.mutate(req);
              return downTable
                .getMany({ trans: req.trans, keys: lookups.map((entry) => entry.key) })
                .then((previousRows) => {
                  lookups.forEach((entry, position) => {
                    assertUnchanged(
                      tableName,
                      fields,
                      entry.key,
                      previousRows[position],
                      req.values[entry.index],
                    );
                  });
                  return downTable.mutate(req);
                });
            },
          };
        },
      };
    },
  };
}
