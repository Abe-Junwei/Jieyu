/**
 * #280/#274：AI 运行时 v2 的存储操作（审批行 + 目标指纹查询），调用方不再直连 db 桶。
 * Storage ops for AI runtime v2 (turn rows + target fingerprint lookups) so callers avoid the db barrel.
 */
import { db } from './engine';

export const aiRuntimeV2TurnsTable = <T>() => db.table<T, string>('ai_runtime_v2_turns');

/** 按主键依次在给定表里找一行 | first row with this primary key among the given tables */
export async function findRowInTables(
  tables: readonly string[],
  id: string,
): Promise<{ table: string; row: Record<string, unknown> } | undefined> {
  for (const table of tables) {
    const row = (await db.table(table).get(id)) as Record<string, unknown> | undefined;
    if (row) return { table, row };
  }
  return undefined;
}

/** 句段的文本内容行 | content rows of a segment */
export function listUnitContentRows(unitId: string): Promise<Array<Record<string, unknown>>> {
  return db.table('layer_unit_contents').where('unitId').equals(unitId).toArray();
}
