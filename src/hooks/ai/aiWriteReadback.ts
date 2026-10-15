import { getDb } from '../../db';

/** 这些 id 里还有几行。读不了库时返回 undefined。 */
export async function presentUnitCount(ids: readonly string[]): Promise<number | undefined> {
  try {
    const db = await getDb();
    const rows = await db.dexie.layer_units.bulkGet([...ids]);
    return rows.filter((row) => row != null).length;
  } catch {
    return undefined;
  }
}

/** 句段是否还在。读不了库时返回 unreadable，调用方不得把它当成「没写」。 */
export async function unitPresence(
  ids: readonly string[],
): Promise<'all-present' | 'all-absent' | 'partial' | 'unreadable'> {
  try {
    const db = await getDb();
    const rows = await db.dexie.layer_units.bulkGet([...ids]);
    const present = rows.filter((row) => row != null).length;
    if (present === 0) return 'all-absent';
    if (present === ids.length) return 'all-present';
    return 'partial';
  } catch {
    return 'unreadable';
  }
}

/** 层行是否还在 tier_definitions。读不了库时返回 undefined。 */
export async function tierRowExists(layerId: string): Promise<boolean | undefined> {
  try {
    const db = await getDb();
    const row = await db.dexie.tier_definitions.get(layerId);
    return row != null;
  } catch {
    return undefined;
  }
}

/** 同一内容类型和语言下已经落盘的层 id。读不了库时返回 undefined。 */
export async function persistedLayerIds(
  contentType: 'transcription' | 'translation',
  languageId: string,
): Promise<string[] | undefined> {
  try {
    const db = await getDb();
    const rows = await db.dexie.tier_definitions.where('contentType').equals(contentType).toArray();
    return rows.filter((row) => row.languageId === languageId).map((row) => row.id);
  } catch {
    return undefined;
  }
}

/**
 * 抛错之后，这个 textId 下是否多了一行句段。
 * 没有 textId、读不了库、或新行不止一条时返回 undefined。
 */
export async function createdUnitId(
  textId: string | undefined,
  beforeIds: ReadonlySet<string> | undefined,
): Promise<string | null | undefined> {
  if (!textId || beforeIds === undefined) return undefined;
  try {
    const db = await getDb();
    const after = await db.dexie.layer_units.where('textId').equals(textId).primaryKeys();
    const created = after.filter((id) => !beforeIds.has(String(id)));
    if (created.length === 1) return String(created[0]);
    if (created.length === 0) return null;
    return undefined;
  } catch {
    return undefined;
  }
}

export async function unitTextId(unitId: string): Promise<string | undefined> {
  try {
    const db = await getDb();
    const row = await db.dexie.layer_units.get(unitId);
    return typeof row?.textId === 'string' && row.textId.length > 0 ? row.textId : undefined;
  } catch {
    return undefined;
  }
}

export async function unitIdsForText(textId: string): Promise<Set<string> | undefined> {
  try {
    const db = await getDb();
    const keys = await db.dexie.layer_units.where('textId').equals(textId).primaryKeys();
    return new Set(keys.map((id) => String(id)));
  } catch {
    return undefined;
  }
}

/**
 * 切分是否已经落到原句段的结束时间，或同一媒体上出现了以切分时间为起点的新句段。
 * 原句段读不到时返回 undefined。
 */
export async function splitBoundaryLanded(
  segmentId: string,
  splitTime: number,
  originalEnd: number,
): Promise<boolean | undefined> {
  try {
    const db = await getDb();
    const row = await db.dexie.layer_units.get(segmentId);
    if (!row) return undefined;
    if (row.endTime < originalEnd - 0.001 && row.endTime <= splitTime + 0.001) return true;
    if (!row.mediaId) return false;
    const siblings = await db.dexie.layer_units
      .where('[mediaId+startTime]')
      .equals([row.mediaId, splitTime])
      .toArray();
    return siblings.some((sibling) => sibling.id !== segmentId);
  } catch {
    return undefined;
  }
}
