/**
 * 项目包恢复为新项目时的 ID 重映射（rev5 7.4-2，T22、T28）。
 * ID remapping when a project package is restored as a new project (rev5 7.4-2; T22, T28).
 *
 * 包里每一行的 `id`（包括 textId、documentId）都换成新的 UUID；所有引用随之替换：
 * - 字段值正好等于某个旧 id；
 * - 对象的键正好等于某个旧 id（按 id 索引的设置）；
 * - `a::b[::c]` 组合引用（单元格备注）里等于旧 id 的部分。
 * 语言目录行以语言代码为主键（自然键），不重映射；冲突由调用方处理。
 * Every row `id` in the package (textId and documentId included) gets a new UUID, and every
 * reference follows: exact-match field values, exact-match object keys (id-keyed settings) and the
 * parts of `a::b[::c]` composite refs (cell notes). Language rows are keyed by the language code
 * (a natural key) and are not remapped; the caller handles collisions.
 */

/** 主键是自然键、不重映射的集合 | Collections keyed by a natural key, never remapped */
export const NATURAL_KEY_COLLECTIONS: ReadonlySet<string> = new Set(['languages']);

export type ProjectCollections = Record<string, unknown[]>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
}

/** 为包里每一行的 id 分配新 id | Allocate a new id for every row id in the package */
export function buildProjectIdRemap(
  collections: ProjectCollections,
  newId: () => string = () => globalThis.crypto.randomUUID(),
): Map<string, string> {
  const map = new Map<string, string>();
  for (const [name, rows] of Object.entries(collections)) {
    if (NATURAL_KEY_COLLECTIONS.has(name)) continue;
    for (const row of rows) {
      const id = isPlainObject(row) ? row.id : undefined;
      if (typeof id === 'string' && id.length > 0 && !map.has(id)) map.set(id, newId());
    }
  }
  return map;
}

function remapString(value: string, map: ReadonlyMap<string, string>): string {
  const direct = map.get(value);
  if (direct !== undefined) return direct;
  if (!value.includes('::')) return value;
  return value
    .split('::')
    .map((part) => map.get(part) ?? part)
    .join('::');
}

function remapValue(value: unknown, map: ReadonlyMap<string, string>): unknown {
  if (typeof value === 'string') return remapString(value, map);
  if (Array.isArray(value)) return value.map((item) => remapValue(item, map));
  if (!isPlainObject(value)) return value;
  const next: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) {
    next[map.get(key) ?? key] = remapValue(inner, map);
  }
  return next;
}

/** 按映射替换全部 id 与引用（返回新对象，不改输入）| Remap every id and reference (pure) */
export function remapProjectCollections(
  collections: ProjectCollections,
  map: ReadonlyMap<string, string>,
): ProjectCollections {
  const next: ProjectCollections = {};
  for (const [name, rows] of Object.entries(collections)) {
    next[name] = rows.map((row) => remapValue(row, map));
  }
  return next;
}
