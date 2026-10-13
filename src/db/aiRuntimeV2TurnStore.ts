/**
 * #280/#274：AI 运行时 v2 的存储业务操作（审批行读写 + 目标指纹），不暴露表本身。
 * Business storage ops for AI runtime v2 (turn rows + target fingerprints); the table itself is not exposed.
 */
import { db } from './engine';

const turns = () => db.table('ai_runtime_v2_turns');

export async function getTurn<T>(conversationId: string): Promise<T | undefined> {
  return (await turns().get(conversationId)) as T | undefined;
}
export async function putTurn<T extends { conversationId: string }>(row: T): Promise<void> {
  await turns().put(row);
}
export async function deleteTurn(conversationId: string): Promise<void> {
  await turns().delete(conversationId);
}
export async function sweepExpiredTurns(now: number): Promise<void> {
  await turns().where('expiresAt').below(now).delete();
}

// shortcut: 目标按 *Id/*Ids 参数在常见表里按主键查 | targets = *Id/*Ids args looked up by primary key
const TARGET_TABLES = [
  'layer_units',
  'tier_definitions',
  'layer_unit_contents',
  'texts',
  'unit_tokens',
];

/** 目标指纹：`表名:updatedAt`；句段再并入其文本内容行 | fingerprint; segments include their content rows */
export async function fingerprintTarget(id: string): Promise<string | undefined> {
  for (const name of TARGET_TABLES) {
    const row = (await db.table(name).get(id)) as Record<string, unknown> | undefined;
    if (!row) continue;
    let fp = `${name}:${String(row.updatedAt ?? JSON.stringify(row))}`;
    if (name === 'layer_units') {
      // S2：句段指纹并入其文本内容行 | include the segment's content rows
      const contents = await db.table('layer_unit_contents').where('unitId').equals(id).toArray();
      fp += `|${contents
        .map((c: Record<string, unknown>) => `${String(c.id)}@${String(c.updatedAt)}`)
        .sort()
        .join(',')}`;
    }
    return fp;
  }
  return undefined;
}
