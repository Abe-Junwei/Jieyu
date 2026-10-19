import { getDb } from './engine';
import type { TextDocType } from './types';

export type ForeignOwnedRow = { id: string; textId: string };

function uniqueIds(ids: Iterable<string>): string[] {
  return [...new Set([...ids].map((id) => id.trim()).filter((id) => id.length > 0))];
}

function foreignRows(rows: { id: string; textId: string }[], textId: string): ForeignOwnedRow[] {
  return rows.flatMap((row) => (row.textId !== textId ? [{ id: row.id, textId: row.textId }] : []));
}

export async function readProject(textId: string): Promise<TextDocType | undefined> {
  const id = textId.trim();
  if (id.length === 0) return undefined;
  const database = await getDb();
  return database.dexie.texts.get(id);
}

export async function listForeignOwnedUnits(
  unitIds: Iterable<string>,
  textId: string,
): Promise<ForeignOwnedRow[]> {
  const ids = uniqueIds(unitIds);
  if (ids.length === 0) return [];
  const database = await getDb();
  const rows = await database.dexie.layer_units.bulkGet(ids);
  return foreignRows(
    rows.flatMap((row) => (row ? [row] : [])),
    textId,
  );
}

export async function listForeignOwnedLayers(
  layerIds: Iterable<string>,
  textId: string,
): Promise<ForeignOwnedRow[]> {
  const ids = uniqueIds(layerIds);
  if (ids.length === 0) return [];
  const database = await getDb();
  const rows = await database.dexie.tier_definitions.bulkGet(ids);
  return foreignRows(
    rows.flatMap((row) => (row ? [row] : [])),
    textId,
  );
}

export async function listForeignOwnedMedia(
  mediaIds: Iterable<string>,
  textId: string,
): Promise<ForeignOwnedRow[]> {
  const ids = uniqueIds(mediaIds);
  if (ids.length === 0) return [];
  const database = await getDb();
  const rows = await database.dexie.media_items.bulkGet(ids);
  return foreignRows(
    rows.flatMap((row) => (row ? [row] : [])),
    textId,
  );
}
