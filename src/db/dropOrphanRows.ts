/**
 * 归档 / JSON 导入的孤儿行处理（BF1-N3、BF1N3-1），从 projectPackageService 移来，db/io 也要用。
 * Orphan-row handling for archive and JSON import (BF1-N3, BF1N3-1); moved from
 * projectPackageService so db/io can use it.
 */
import { JIEYU_PARENT_CONSISTENCY_RULES } from './ownershipImmutabilityMiddleware';

type Row = Record<string, unknown>;
type ProjectCollections = Record<string, unknown[]>;

export function rowsOf(collections: ProjectCollections, name: string): Row[] {
  const rows = collections[name];
  return Array.isArray(rows)
    ? rows.filter((row): row is Row => row !== null && typeof row === 'object')
    : [];
}

/** 每张表因父行不在包里而跳过的行数 | Rows skipped per table because their parent is not in the package */
export type SkippedOrphanRows = Array<{ collection: string; count: number }>;

/**
 * 丢弃父行不在包里的行（BF1-N3），父行规则与归属中间件同一套；指向包外词条的链接也丢。循环到
 * 不再有新的孤儿（丢掉的句段带走它的子句段、内容、token、morpheme、链接）。在 id 重新映射之前调用。
 * Drop rows whose parent is not in the package (BF1-N3), using the ownership middleware's parent
 * rules; links to lexemes outside the package are dropped too. Repeats until no new orphan appears
 * (a dropped unit takes its segments, contents, tokens, morphemes and links). Call before id remap.
 * shortcut: orphans are dropped, not repaired/re-parented; upgrade if users need to recover rows from damaged backups.
 */
export function dropOrphanRows(
  collections: ProjectCollections,
  /** 本机库里已有的父行 id（按表），也算父行在（BF1N3-1）| Parent ids already in the local DB (BF1N3-1) */
  localParentIds?: ReadonlyMap<string, ReadonlySet<string>>,
): {
  collections: ProjectCollections;
  skipped: SkippedOrphanRows;
} {
  const rules = Object.entries(JIEYU_PARENT_CONSISTENCY_RULES).filter(([name]) =>
    Array.isArray(collections[name]),
  );
  const counts = new Map<string, number>();
  let next = collections;
  for (;;) {
    const current = next;
    const idSets = new Map<string, Set<string>>();
    const idsOf = (table: string): Set<string> => {
      let ids = idSets.get(table);
      if (ids === undefined) {
        ids = new Set(rowsOf(current, table).map((row) => String(row.id)));
        for (const id of localParentIds?.get(table) ?? []) ids.add(id);
        idSets.set(table, ids);
      }
      return ids;
    };
    const pass: ProjectCollections = { ...current };
    let dropped = 0;
    for (const [name, rule] of rules) {
      const rows = rowsOf(current, name);
      const kept = rows.filter((row) =>
        rule.extract(row).parents.every((ref) => idsOf(ref.table).has(ref.key)),
      );
      if (kept.length === rows.length) continue;
      pass[name] = kept;
      counts.set(name, (counts.get(name) ?? 0) + rows.length - kept.length);
      dropped += rows.length - kept.length;
    }
    if (dropped === 0) break;
    next = pass;
  }
  const skipped = [...counts.entries()]
    .map(([collection, count]) => ({ collection, count }))
    .sort((a, b) => a.collection.localeCompare(b.collection, 'en'));
  return { collections: next, skipped };
}
