/**
 * 查询给定单元 / 图层里哪些属于另一个项目（2B-G / JY-03）。
 * Find which of the given units / layers belong to another project (2B-G / JY-03).
 */
import { getDb } from '../db';

export type ForeignOwnedRow = { id: string; textId: string };

function uniqueIds(ids: Iterable<string>): string[] {
  return [...new Set([...ids].map((id) => id.trim()).filter((id) => id.length > 0))];
}

/** 已存在、且 `textId` 不是 `textId` 的单元 | Existing units whose `textId` differs */
export async function listForeignOwnedUnits(
  unitIds: Iterable<string>,
  textId: string,
): Promise<ForeignOwnedRow[]> {
  const ids = uniqueIds(unitIds);
  if (ids.length === 0) return [];
  const db = await getDb();
  const rows = await db.dexie.layer_units.bulkGet(ids);
  return rows.flatMap((row) =>
    row && row.textId !== textId ? [{ id: row.id, textId: row.textId }] : [],
  );
}

/** 已存在、且 `textId` 不是 `textId` 的图层 | Existing layers whose `textId` differs */
export async function listForeignOwnedLayers(
  layerIds: Iterable<string>,
  textId: string,
): Promise<ForeignOwnedRow[]> {
  const ids = uniqueIds(layerIds);
  if (ids.length === 0) return [];
  const db = await getDb();
  const rows = await db.dexie.tier_definitions.bulkGet(ids);
  return rows.flatMap((row) =>
    row && row.textId !== textId ? [{ id: row.id, textId: row.textId }] : [],
  );
}
