import type Database from 'better-sqlite3';
import { keepEmptyUnitText } from './unitTextAudios';
import { readUnitTextBody, resolveUnitTextContext } from './unitTextLayers';

type SqliteDatabase = InstanceType<typeof Database>;
export interface CreatedTextCarrier {
  id: string;
  unitId: string;
  textLayerId: string;
}

/** Only remove carriers owned by this edit, after its notes have been removed. */
export function removeCreatedTextCarrier(db: SqliteDatabase, carrier: CreatedTextCarrier): void {
  if (!keepEmptyUnitText(db, carrier.id)) {
    db.prepare(
      "DELETE FROM unit_texts WHERE id = ? AND unit_id = ? AND layer_id = ? AND body = ''",
    ).run(carrier.id, carrier.unitId, carrier.textLayerId);
  }
}

/** Restore the original anchor identity without replacing a newer carrier. */
export function restoreCreatedTextCarrier(db: SqliteDatabase, carrier: CreatedTextCarrier): void {
  const context = resolveUnitTextContext(db, carrier.unitId, carrier.textLayerId);
  const current = readUnitTextBody(db, context);
  if (current.id === carrier.id) return;
  if (current.id !== null) throw new Error('note carrier redo is stale');
  db.prepare(
    `INSERT INTO unit_texts (id, unit_id, layer_id, role, body, updated_at)
    VALUES (?, ?, ?, ?, '', ?)`,
  ).run(carrier.id, carrier.unitId, carrier.textLayerId, context.role, new Date().toISOString());
}
