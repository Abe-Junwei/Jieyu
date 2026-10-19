import { getDb } from './engine';
import type { JieyuDatabase } from './engine';

/**
 * 还没迁走的发送阶段仍要一个数据库句柄。句柄本身不读不写行。
 * Send-turn phases that still take a database argument need the open handle.
 */
export async function openChatDatabase(): Promise<JieyuDatabase> {
  return getDb();
}
