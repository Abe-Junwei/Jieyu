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
 *
 * 父行一致性（GAP-1）：token / morpheme / 词条链接不能挂到别的项目的父行上。对 add / put 收集
 * 每行引用的父行 id，按父表分组，在同一事务里用下层 `getMany` 批量读一次（不逐行查、不扫表），
 * 要求子行自己的 `textId` 与各父行的 `textId` 一致（词条链接：目标 token / morpheme 与词条同项目）。
 * 中间件不能开第二个事务，所以它在创建读写事务时把子表的父表并入 IDB 作用域，隐式单表写
 * （Table.update / bulkUpdate / Collection.modify / collection.insert）也能读到父行。同项目内改指父行
 * 不受影响。
 *
 * Parent consistency (GAP-1): tokens / morphemes / lexeme links cannot hang off another
 * project's parent rows. For add / put, parent ids are grouped per parent table and read with ONE
 * downlevel `getMany` each in the same transaction (no per-row lookups, no scans); the child's own
 * `textId` must equal every parent's `textId` (lexeme links: target token / morpheme and lexeme in
 * the same project). The middleware cannot open a second transaction, so when a readwrite
 * transaction is created it widens the IDB scope with the child tables' parents; implicit
 * single-table writes (Table.update / bulkUpdate / Collection.modify / collection.insert) are covered
 * too. Repointing within a project is unaffected.
 *
 * shortcut: 父行不存在时不检查。归档导入（JYT / JYM / JYB）已在 inspector 里用 dropOrphanRows 丢弃
 * 父行不在包里的行（BF1-N3）；仍未兜底的是正常使用中先写子行、之后在别的项目写同 id 父行，以及纯 JSON
 * 导入（db/io.ts importDatabaseFromJson）。若出现这类坏数据的报告，再在写入时要求父行存在。
 * shortcut: missing parents are not checked. Archive imports (JYT / JYM / JYB) drop rows whose
 * parent is not in the package via dropOrphanRows in the inspectors (BF1-N3); still uncovered: a
 * live child written before its parent with a same-id parent later written in another project, and
 * the plain JSON import (db/io.ts importDatabaseFromJson). Upgrade to requiring the parent at write
 * time if such bad data is reported.
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

/** 子行引用了另一个项目的父行（GAP-1）| A child row references a parent of another project (GAP-1) */
export class JieyuParentOwnershipMismatchError extends Error {
  constructor(
    public readonly tableName: string,
    public readonly rowKey: unknown,
    public readonly expectedTextId: string,
    public readonly parentTable: string,
    public readonly parentKey: string,
    public readonly parentTextId: string,
  ) {
    super(
      `Write rejected for table "${tableName}": row ${JSON.stringify(rowKey)} belongs to ${JSON.stringify(expectedTextId)} but references ${parentTable} ${JSON.stringify(parentKey)} of project ${JSON.stringify(parentTextId)}`,
    );
    this.name = 'JieyuParentOwnershipMismatchError';
  }
}

/** 一行的归属来源：自身字段，或某张父表里某个 id 的 `textId` | One owner source of a row */
export type ParentOwnerRef = { table: string; key: string };

/**
 * 表名 → 从一行取出它的项目归属来源：自身 `textId`（可无）以及要读 `textId` 的父行引用。
 * Table name → a row's owner sources: its own `textId` (optional) and parent refs whose `textId`
 * must match.
 */
export type ParentConsistencyRule = {
  /** 可能被引用的父表；读写事务会把它们并入作用域 | Parent tables; widened into rw scopes */
  parentTables: readonly string[];
  extract: (row: Record<string, unknown>) => { ownTextId?: string; parents: ParentOwnerRef[] };
};
export type ParentConsistencyRules = Readonly<Record<string, ParentConsistencyRule>>;

function stringField(row: Record<string, unknown>, field: string): string | undefined {
  const value = row[field];
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function ownTextIdOf(row: Record<string, unknown>): { ownTextId?: string } {
  const ownTextId = stringField(row, 'textId');
  return ownTextId === undefined ? {} : { ownTextId };
}

function refsOf(entries: Array<[string, string | undefined]>): ParentOwnerRef[] {
  return entries.flatMap(([table, key]) => (key === undefined ? [] : [{ table, key }]));
}

/**
 * GAP-1 的间接表：token、morpheme、词条链接；BF1-N2 补上句段父链（parentUnitId / rootUnitId）与
 * 句段内容（unitId）。
 * GAP-1 indirect tables (tokens, morphemes, lexeme links); BF1-N2 adds the segment parent chain
 * (parentUnitId / rootUnitId) and unit contents (unitId).
 */
export const JIEYU_PARENT_CONSISTENCY_RULES: ParentConsistencyRules = {
  layer_units: {
    parentTables: ['layer_units'],
    extract: (row) => ({
      ...ownTextIdOf(row),
      parents: refsOf([
        ['layer_units', stringField(row, 'parentUnitId')],
        ['layer_units', stringField(row, 'rootUnitId')],
      ]),
    }),
  },
  layer_unit_contents: {
    parentTables: ['layer_units'],
    extract: (row) => ({
      ...ownTextIdOf(row),
      parents: refsOf([['layer_units', stringField(row, 'unitId')]]),
    }),
  },
  unit_tokens: {
    parentTables: ['layer_units'],
    extract: (row) => ({
      ...ownTextIdOf(row),
      parents: refsOf([['layer_units', stringField(row, 'unitId')]]),
    }),
  },
  unit_morphemes: {
    parentTables: ['layer_units', 'unit_tokens'],
    extract: (row) => ({
      ...ownTextIdOf(row),
      parents: refsOf([
        ['layer_units', stringField(row, 'unitId')],
        ['unit_tokens', stringField(row, 'tokenId')],
      ]),
    }),
  },
  token_lexeme_links: {
    parentTables: ['unit_tokens', 'unit_morphemes', 'lexemes'],
    extract: (row) => ({
      parents: refsOf([
        [
          row['targetType'] === 'morpheme' ? 'unit_morphemes' : 'unit_tokens',
          stringField(row, 'targetId'),
        ],
        ['lexemes', stringField(row, 'lexemeId')],
      ]),
    }),
  },
};

function transactionHasStore(trans: unknown, storeName: string): boolean {
  const names = (trans as { objectStoreNames?: { contains?: (name: string) => boolean } } | null)
    ?.objectStoreNames;
  return typeof names?.contains === 'function' && names.contains(storeName);
}

/**
 * 父行一致性检查：每张父表一次批量 getMany。返回 Promise，失败时 reject。
 * Parent consistency: one batched getMany per parent table; rejects on a mismatch.
 */
function checkParentConsistency(
  down: DBCore,
  tableName: string,
  extract: ParentConsistencyRule['extract'],
  req: Extract<DBCoreMutateRequest, { type: 'add' | 'put' }>,
  keys: unknown[],
): Promise<void> {
  const rows = req.values.map((value, index) => ({
    key: keys[index],
    sources:
      value !== null && typeof value === 'object'
        ? extract(value as Record<string, unknown>)
        : { parents: [] },
  }));
  const keysByTable = new Map<string, Set<string>>();
  for (const { sources } of rows) {
    for (const ref of sources.parents) {
      if (!transactionHasStore(req.trans, ref.table)) continue;
      const bucket = keysByTable.get(ref.table) ?? new Set<string>();
      bucket.add(ref.key);
      keysByTable.set(ref.table, bucket);
    }
  }
  if (keysByTable.size === 0) return Promise.resolve();
  const tables = [...keysByTable.entries()].map(([table, keySet]) => ({
    table,
    keys: [...keySet],
  }));
  return Promise.all(
    tables.map(({ table, keys: parentKeys }) =>
      down.table(table).getMany({ trans: req.trans, keys: parentKeys }),
    ),
  ).then((results) => {
    const ownerByTableKey = new Map<string, string>();
    tables.forEach(({ table, keys: parentKeys }, tableIndex) => {
      parentKeys.forEach((parentKey, keyIndex) => {
        const owner = fieldOf(results[tableIndex]?.[keyIndex], 'textId');
        if (typeof owner === 'string' && owner.length > 0) {
          ownerByTableKey.set(`${table}\u0000${parentKey}`, owner);
        }
      });
    });
    for (const { key, sources } of rows) {
      let expected = sources.ownTextId;
      let expectedFrom: ParentOwnerRef | undefined;
      for (const ref of sources.parents) {
        const owner = ownerByTableKey.get(`${ref.table}\u0000${ref.key}`);
        if (owner === undefined) continue;
        if (expected === undefined) {
          expected = owner;
          expectedFrom = ref;
          continue;
        }
        if (owner !== expected) {
          // 没有自身 textId 时（词条链接），报告先读到的父行作为期望归属
          // Without an own textId (lexeme links), the first parent read sets the expectation
          throw new JieyuParentOwnershipMismatchError(
            tableName,
            key,
            expectedFrom ? `${expected} (via ${expectedFrom.table} ${expectedFrom.key})` : expected,
            ref.table,
            ref.key,
            owner,
          );
        }
      }
    }
  });
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

function keysOf(
  table: DBCoreTable,
  req: Extract<DBCoreMutateRequest, { type: 'add' | 'put' }>,
): unknown[] {
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
  parentRules: ParentConsistencyRules = JIEYU_PARENT_CONSISTENCY_RULES,
): Middleware<DBCore> {
  return {
    stack: 'dbcore',
    name: MIDDLEWARE_NAME,
    level: 1,
    create(down) {
      const knownTables = new Set(down.schema.tables.map((table) => table.name));
      return {
        ...down,
        // 写事务涉及子表时把父表并入 IDB 作用域，使隐式单表写（Table.update / modify 等）也能
        // 在同一事务里读父行；Dexie 自身的表访问检查仍按调用方声明的表。
        // Widen rw scopes that touch a child table with its parent tables, so implicit single-table
        // writes (Table.update / modify / …) can read parents in the same transaction. Dexie's own
        // table-access checks still use the caller-declared stores.
        transaction(stores, mode, options) {
          if (mode !== 'readwrite') return down.transaction(stores, mode, options);
          const widened = new Set(stores);
          for (const store of stores) {
            for (const parent of parentRules[store]?.parentTables ?? []) {
              if (knownTables.has(parent)) widened.add(parent);
            }
          }
          return down.transaction(
            widened.size === stores.length ? stores : [...widened],
            mode,
            options,
          );
        },
        table(tableName) {
          const downTable = down.table(tableName);
          const fields = rules[tableName] ?? [];
          const parentRule = parentRules[tableName];
          if (fields.length === 0 && !parentRule) return downTable;
          return {
            ...downTable,
            mutate(req) {
              if ((req.type !== 'put' && req.type !== 'add') || req.values.length === 0) {
                return downTable.mutate(req);
              }
              const keys = keysOf(downTable, req);
              const checks: Array<Promise<void>> = [];
              // 归属不可变只拦 put（add 撞已有主键本来就会失败）| Immutability: put only
              if (req.type === 'put' && fields.length > 0) {
                const lookups: Array<{ index: number; key: unknown }> = [];
                keys.forEach((key, index) => {
                  if (key !== undefined && key !== null) lookups.push({ index, key });
                });
                if (lookups.length > 0) {
                  checks.push(
                    downTable
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
                      }),
                  );
                }
              }
              if (parentRule) {
                checks.push(checkParentConsistency(down, tableName, parentRule.extract, req, keys));
              }
              if (checks.length === 0) return downTable.mutate(req);
              // 确定性报错：归属不可变错误优先于父行不一致 | Deterministic: immutability error wins
              return Promise.allSettled(checks).then((outcomes) => {
                for (const outcome of outcomes) {
                  if (outcome.status === 'rejected') throw outcome.reason;
                }
                return downTable.mutate(req);
              });
            },
          };
        },
      };
    },
  };
}
