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
/** 层所在的两个集合名：`tier_definitions` 与 RxDB 别名 `layers` 是同一张表 | Both names of the layer table */
const LAYER_COLLECTIONS = ['tier_definitions', 'layers'] as const;

/**
 * 第 5 批（B5-5）：层的 documentId 指向包里和本机都没有的文稿时，只去掉 documentId（层归项目的默认 /
 * 当前文稿，与工作台“不凭空消失”一致），不把整层当孤儿丢掉。`layers` 别名同样处理，所以两个集合写进的
 * 是同一份层，跳过报告里也不会出现实际没丢的层。
 * Batch 5 (B5-5): a layer whose documentId names a document that is neither in the package nor local
 * keeps the layer and only loses the documentId (it falls back to the project's default / current
 * document, matching the workbench rule). The `layers` alias gets the same treatment, so both names write
 * the same layer and the skip report never lists layers that were in fact written.
 */
function detachMissingDocumentRefs(
  collections: ProjectCollections,
  localParentIds?: ReadonlyMap<string, ReadonlySet<string>>,
): { collections: ProjectCollections; detached: number } {
  const documentIds = new Set(
    rowsOf(collections, 'annotation_documents').map((row) => String(row.id)),
  );
  for (const id of localParentIds?.get('annotation_documents') ?? []) documentIds.add(id);
  let next = collections;
  let detached = 0;
  for (const name of LAYER_COLLECTIONS) {
    const rows = collections[name];
    if (!Array.isArray(rows)) continue;
    let changed = false;
    const mapped = rows.map((row: unknown) => {
      if (row === null || typeof row !== 'object') return row;
      const { documentId, ...rest } = row as Row;
      if (typeof documentId !== 'string' || documentId === '' || documentIds.has(documentId)) {
        return row;
      }
      changed = true;
      detached += 1;
      return rest;
    });
    if (changed) next = { ...next, [name]: mapped };
  }
  return { collections: next, detached };
}

export function dropOrphanRows(
  collections: ProjectCollections,
  /** 本机库里已有的父行 id（按表），也算父行在（BF1N3-1）| Parent ids already in the local DB (BF1N3-1) */
  localParentIds?: ReadonlyMap<string, ReadonlySet<string>>,
): {
  collections: ProjectCollections;
  skipped: SkippedOrphanRows;
  /** 去掉了 documentId 的层行数（B5-5），不算跳过 | Layer rows whose documentId was dropped (B5-5); not skips */
  detachedDocumentRefs: number;
} {
  const repaired = detachMissingDocumentRefs(collections, localParentIds);
  const rules = Object.entries(JIEYU_PARENT_CONSISTENCY_RULES).filter(([name]) =>
    Array.isArray(repaired.collections[name]),
  );
  const counts = new Map<string, number>();
  let next = repaired.collections;
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
  return { collections: next, skipped, detachedDocumentRefs: repaired.detached };
}
