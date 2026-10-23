/** ADR-0079：桌面壳换上 SQLite 存储接口的开关。没设、空串和其他值都是关。 */
export function sqliteStoragePortFlagEnabled(raw: string | undefined): boolean {
  const normalized = raw?.trim().toLowerCase();
  return normalized === '1' || normalized === 'true';
}
