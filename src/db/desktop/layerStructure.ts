import type Database from 'better-sqlite3';
import {
  BASE_FONT_SIZE,
  scriptLineHeightScale,
  storedFontSizeForLaneHeight,
  storedLaneHeightForFontSize,
} from '../../utils/layerDisplayStyle';
import { getLayer, type Layer } from './layers';
import { readStringMap } from './stringMap';

type SqliteDatabase = InstanceType<typeof Database>;

export interface LayerRename {
  id: string;
  name: Record<string, string>;
}

export interface LayerHeight {
  id: string;
  laneHeight: number;
}

export interface LayerStyle {
  id: string;
  orthographyId: string | null;
  displayFont: string | null;
  displayFontSize: number | null;
  displayBold: boolean;
  displayItalic: boolean;
  reset?: boolean;
}

export interface LayerMove {
  id: string;
  direction: 'up' | 'down';
}

export interface LayerDelete {
  id: string;
  mode: 'soft' | 'migrate' | 'purge';
  targetLayerId?: string;
}

export interface DeletedLayer {
  id: string;
  manuscriptId: string;
  key: string;
  name: Record<string, string>;
  deletedAt: string;
  retainUntil: string;
}

const RETAIN_DAYS = 90;
let deleteStampSeq = 0;

/** Same clock millisecond can hide two deletes. The extra digits keep one delete's subtree together. */
function deleteStamp(now: string): string {
  deleteStampSeq += 1;
  return `${now.slice(0, -1)}${String(deleteStampSeq).padStart(6, '0')}Z`;
}

export function renameLayer(db: SqliteDatabase, input: LayerRename): Layer {
  assertName(input.name);
  const write = db.transaction(() => {
    const current = activeLayer(db, input.id);
    const now = new Date().toISOString();
    db.prepare('UPDATE layers SET name_json = ?, updated_at = ? WHERE id = ?').run(
      JSON.stringify(input.name),
      now,
      current.id,
    );
    return readBack(db, current.id);
  });
  return write();
}

export function setLayerHeight(db: SqliteDatabase, input: LayerHeight): Layer {
  if (!Number.isInteger(input.laneHeight) || input.laneHeight <= 0) {
    throw new Error('layer height is invalid');
  }
  const write = db.transaction(() => {
    const current = activeLayer(db, input.id);
    const fontSize = storedFontSizeForLaneHeight(
      input.laneHeight,
      scriptLineHeightScale(scriptTag(db, current.orthographyId)),
    );
    const now = new Date().toISOString();
    db.prepare(
      'UPDATE layers SET lane_height = ?, display_font_size = ?, updated_at = ? WHERE id = ?',
    ).run(input.laneHeight, fontSize, now, current.id);
    const next = readBack(db, current.id);
    if (next.laneHeight !== input.laneHeight || next.displayFontSize !== fontSize) {
      throw new Error('layer height readback failed');
    }
    return next;
  });
  return write();
}

export function setLayerStyle(db: SqliteDatabase, input: LayerStyle): Layer {
  const write = db.transaction(() => {
    const current = activeLayer(db, input.id);
    const now = new Date().toISOString();
    if (input.reset === true) {
      db.prepare(
        `UPDATE layers
         SET orthography_id = NULL, display_font = NULL, display_font_size = NULL,
             display_bold = NULL, display_italic = NULL, lane_height = ?, updated_at = ?
         WHERE id = ?`,
      ).run(storedLaneHeightForFontSize(BASE_FONT_SIZE), now, current.id);
      return readBack(db, current.id);
    }
    const orthographyId = input.orthographyId;
    if (orthographyId !== null) {
      if (current.languageId === null) throw new Error('layer language is missing');
      const orthography = db
        .prepare('SELECT language_id AS languageId FROM orthographies WHERE id = ?')
        .get(orthographyId) as { languageId: string } | undefined;
      if (!orthography) throw new Error('orthography is missing');
      if (orthography.languageId !== current.languageId) {
        throw new Error('orthography language does not match');
      }
    }
    const font = input.displayFont === null ? null : input.displayFont.trim();
    const displayFont = font === null || font.length === 0 ? null : font;
    const fontSize = input.displayFontSize;
    if (fontSize !== null && (!Number.isInteger(fontSize) || fontSize < 8 || fontSize > 36)) {
      throw new Error('font size is out of range');
    }
    const laneHeight = storedLaneHeightForFontSize(
      fontSize ?? BASE_FONT_SIZE,
      scriptLineHeightScale(scriptTag(db, orthographyId)),
    );
    db.prepare(
      `UPDATE layers
       SET orthography_id = ?, display_font = ?, display_font_size = ?,
           display_bold = ?, display_italic = ?, lane_height = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      orthographyId,
      displayFont,
      fontSize,
      input.displayBold ? 1 : null,
      input.displayItalic ? 1 : null,
      laneHeight,
      now,
      current.id,
    );
    const next = readBack(db, current.id);
    if (
      next.orthographyId !== orthographyId ||
      next.displayFont !== displayFont ||
      next.displayFontSize !== fontSize ||
      next.displayBold !== input.displayBold ||
      next.displayItalic !== input.displayItalic ||
      next.laneHeight !== laneHeight
    ) {
      throw new Error('layer style readback failed');
    }
    return next;
  });
  return write();
}

function scriptTag(db: SqliteDatabase, orthographyId: string | null): string | null {
  if (orthographyId === null) return null;
  const row = db
    .prepare('SELECT script_tag AS scriptTag FROM orthographies WHERE id = ?')
    .get(orthographyId) as { scriptTag: string } | undefined;
  return row?.scriptTag ?? null;
}

/** Swap this layer with its previous or next sibling. Roots use `sort_order`; hosted layers use the link order. */
export function moveLayer(db: SqliteDatabase, input: LayerMove): Layer {
  const write = db.transaction(() => {
    const current = activeLayer(db, input.id);
    const hostId = preferredHostId(db, current.id);
    if (hostId === null) swapRoot(db, current, input.direction);
    else swapHosted(db, current.id, hostId, input.direction);
    return readBack(db, current.id);
  });
  return write();
}

export function deleteLayer(db: SqliteDatabase, input: LayerDelete): { id: string } {
  const write = db.transaction(() => {
    const current = activeLayer(db, input.id);
    const now = new Date().toISOString();
    const deletedAt = deleteStamp(now);
    const retainUntil = plusUtcDays(now, RETAIN_DAYS);
    if (input.mode === 'purge') {
      purgeLayers(db, [current.id, ...descendantIds(db, current.id, true)]);
      return { id: current.id };
    }
    if (input.mode === 'migrate') {
      const targetId = input.targetLayerId;
      if (targetId === undefined || targetId.length === 0)
        throw new Error('layer target is missing');
      migrateOnto(db, current, targetId, now);
      markDeleted(db, [current.id], deletedAt, retainUntil);
    } else {
      markDeleted(db, [current.id, ...descendantIds(db, current.id)], deletedAt, retainUntil);
    }
    const stored = db
      .prepare(
        'SELECT deleted_at AS deletedAt, retain_until AS retainUntil FROM layers WHERE id = ?',
      )
      .get(current.id) as { deletedAt: string | null; retainUntil: string | null };
    if (stored.deletedAt !== deletedAt || stored.retainUntil !== retainUntil) {
      throw new Error('layer delete readback failed');
    }
    return { id: current.id };
  });
  return write();
}

export function listDeletedLayers(db: SqliteDatabase): DeletedLayer[] {
  const rows = db
    .prepare(
      `SELECT layers.id, layers.manuscript_id, layers.key, layers.name_json,
              layers.deleted_at, layers.retain_until
       FROM layers
       JOIN manuscripts ON manuscripts.id = layers.manuscript_id
       WHERE layers.deleted_at IS NOT NULL AND layers.retain_until IS NOT NULL
         AND manuscripts.deleted_at IS NULL
       ORDER BY layers.deleted_at, layers.id`,
    )
    .all() as {
    id: string;
    manuscript_id: string;
    key: string;
    name_json: string;
    deleted_at: string;
    retain_until: string;
  }[];
  return rows.map((row) => ({
    id: row.id,
    manuscriptId: row.manuscript_id,
    key: row.key,
    name: readStringMap(row.name_json),
    deletedAt: row.deleted_at,
    retainUntil: row.retain_until,
  }));
}

export function restoreLayer(db: SqliteDatabase, id: string): Layer {
  const write = db.transaction(() => {
    const row = db
      .prepare(
        `SELECT layers.id, layers.parent_id AS parentId, layers.deleted_at AS deletedAt
         FROM layers
         JOIN manuscripts ON manuscripts.id = layers.manuscript_id
         WHERE layers.id = ? AND manuscripts.deleted_at IS NULL`,
      )
      .get(id) as { id: string; parentId: string | null; deletedAt: string | null } | undefined;
    if (!row) throw new Error('layer is missing');
    if (row.deletedAt === null) throw new Error('layer is active');
    if (row.parentId !== null && isDeleted(db, row.parentId))
      throw new Error('layer parent is deleted');
    const hostId = preferredHostId(db, id);
    if (hostId !== null && isDeleted(db, hostId)) throw new Error('layer host is deleted');
    const stamp = row.deletedAt;
    if (stamp === null) throw new Error('layer is active');
    const ids = [id, ...deletedTogether(db, id, stamp)];
    const now = new Date().toISOString();
    const clear = db.prepare(
      `UPDATE layers
       SET deleted_at = NULL, retain_until = NULL, reminder_shown_at = NULL, updated_at = ?
       WHERE id = ? AND deleted_at IS NOT NULL`,
    );
    for (const layerId of ids) {
      if (layerId !== id) assertRestoreParent(db, layerId, ids);
      clear.run(now, layerId);
    }
    return readBack(db, id);
  });
  return write();
}

function migrateOnto(db: SqliteDatabase, source: Layer, targetId: string, now: string) {
  const target = activeLayer(db, targetId);
  if (target.id === source.id || target.manuscriptId !== source.manuscriptId) {
    throw new Error('layer target is incompatible');
  }
  if (target.contentType !== source.contentType || target.tierType !== source.tierType) {
    throw new Error('layer target is incompatible');
  }
  if (preferredHostId(db, source.id) !== preferredHostId(db, target.id)) {
    throw new Error('layer target is incompatible');
  }
  if (descendantIds(db, source.id).includes(target.id))
    throw new Error('layer target is incompatible');
  if (!textsStayLinked(db, source.id, target.id)) throw new Error('layer target is incompatible');
  if (source.contentType === 'point') movePoints(db, source.id, target.id, now);
  else {
    try {
      moveUnits(db, source.id, target.id, now);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message.includes('overlap') || message.includes('sort order')) {
        throw new Error('layer units conflict');
      }
      throw error;
    }
  }
  moveTexts(db, source.id, target.id, now);
  moveDrafts(db, source.id, target.id, now);
  retargetChildren(db, source.id, target.id);
}

function moveTexts(db: SqliteDatabase, sourceId: string, targetId: string, now: string) {
  const rows = db
    .prepare('SELECT unit_id AS unitId, role FROM unit_texts WHERE layer_id = ?')
    .all(sourceId) as { unitId: string; role: string }[];
  const taken = db.prepare(
    'SELECT 1 FROM unit_texts WHERE layer_id = ? AND unit_id = ? AND role = ?',
  );
  for (const row of rows) {
    if (taken.get(targetId, row.unitId, row.role) !== undefined) {
      throw new Error('layer text conflicts');
    }
  }
  db.prepare('UPDATE unit_texts SET layer_id = ?, updated_at = ? WHERE layer_id = ?').run(
    targetId,
    now,
    sourceId,
  );
}

function moveDrafts(db: SqliteDatabase, sourceId: string, targetId: string, now: string) {
  const rows = db
    .prepare('SELECT unit_id AS unitId FROM unit_text_drafts WHERE layer_id = ?')
    .all(sourceId) as { unitId: string }[];
  const taken = db.prepare('SELECT 1 FROM unit_text_drafts WHERE layer_id = ? AND unit_id = ?');
  for (const row of rows) {
    if (taken.get(targetId, row.unitId) !== undefined) throw new Error('layer text conflicts');
  }
  db.prepare('UPDATE unit_text_drafts SET layer_id = ?, updated_at = ? WHERE layer_id = ?').run(
    targetId,
    now,
    sourceId,
  );
}

/** Units that stay behind still need their text layer linked to the unit layer. Units on the source move first. */
function textsStayLinked(db: SqliteDatabase, sourceId: string, targetId: string): boolean {
  const broken = db
    .prepare(
      `SELECT 1
       FROM unit_texts
       JOIN units ON units.id = unit_texts.unit_id
       WHERE unit_texts.layer_id = ?
         AND units.layer_id <> ?
         AND units.layer_id <> ?
         AND NOT EXISTS (
           SELECT 1 FROM layer_links
           WHERE layer_links.layer_id = ? AND layer_links.host_layer_id = units.layer_id
         )`,
    )
    .get(sourceId, targetId, sourceId, targetId);
  return broken === undefined;
}

function movePoints(db: SqliteDatabase, sourceId: string, targetId: string, now: string) {
  const clash = db
    .prepare(
      `SELECT 1 FROM points AS source
       JOIN points AS target ON target.layer_id = ? AND target.time_ms = source.time_ms
       WHERE source.layer_id = ?`,
    )
    .get(targetId, sourceId);
  if (clash !== undefined) throw new Error('layer units conflict');
  db.prepare('UPDATE points SET layer_id = ?, updated_at = ? WHERE layer_id = ?').run(
    targetId,
    now,
    sourceId,
  );
}

function moveUnits(db: SqliteDatabase, sourceId: string, targetId: string, now: string) {
  const source = db
    .prepare(`SELECT id, start_ms AS startMs FROM units WHERE layer_id = ? ORDER BY sort_order, id`)
    .all(sourceId) as { id: string; startMs: number | null }[];
  if (source.length === 0) return;
  const target = db
    .prepare(`SELECT id, start_ms AS startMs FROM units WHERE layer_id = ? ORDER BY sort_order, id`)
    .all(targetId) as { id: string; startMs: number | null }[];
  const sourceIds = new Set(source.map((row) => row.id));
  const merged = [
    ...target.map((row) => ({ id: row.id, startMs: row.startMs })),
    ...source.map((row) => ({ id: row.id, startMs: row.startMs })),
  ].sort((a, b) => {
    const byTime = (a.startMs ?? Number.MAX_SAFE_INTEGER) - (b.startMs ?? Number.MAX_SAFE_INTEGER);
    return byTime !== 0 ? byTime : a.id.localeCompare(b.id);
  });
  const park = db.prepare('UPDATE units SET sort_order = ? WHERE id = ?');
  const placeTarget = db.prepare('UPDATE units SET sort_order = ?, updated_at = ? WHERE id = ?');
  const placeSource = db.prepare(
    'UPDATE units SET layer_id = ?, sort_order = ?, updated_at = ? WHERE id = ?',
  );
  for (const [index, row] of merged.entries()) {
    if (!sourceIds.has(row.id)) park.run(-(index + 1), row.id);
  }
  for (const [index, row] of merged.entries()) {
    if (!sourceIds.has(row.id)) placeTarget.run(index, now, row.id);
  }
  for (const [index, row] of merged.entries()) {
    if (sourceIds.has(row.id)) placeSource.run(targetId, index, now, row.id);
  }
}

function retargetChildren(db: SqliteDatabase, sourceId: string, targetId: string) {
  const links = db
    .prepare(
      `SELECT id, layer_id AS layerId, is_preferred AS isPreferred
       FROM layer_links WHERE host_layer_id = ?`,
    )
    .all(sourceId) as { id: string; layerId: string; isPreferred: number }[];
  const existing = db.prepare(
    'SELECT id, is_preferred AS isPreferred FROM layer_links WHERE layer_id = ? AND host_layer_id = ?',
  );
  const drop = db.prepare('DELETE FROM layer_links WHERE id = ?');
  const retarget = db.prepare('UPDATE layer_links SET host_layer_id = ? WHERE id = ?');
  const prefer = db.prepare('UPDATE layer_links SET is_preferred = ? WHERE id = ?');
  for (const link of links) {
    if (link.layerId === targetId) {
      drop.run(link.id);
      continue;
    }
    const already = existing.get(link.layerId, targetId) as
      { id: string; isPreferred: number } | undefined;
    if (already) {
      if (link.isPreferred === 1 && already.isPreferred !== 1) {
        db.prepare('UPDATE layer_links SET is_preferred = 0 WHERE layer_id = ?').run(link.layerId);
        prefer.run(1, already.id);
      }
      drop.run(link.id);
      continue;
    }
    retarget.run(targetId, link.id);
  }
  db.prepare('UPDATE layers SET parent_id = ? WHERE parent_id = ? AND id <> ?').run(
    targetId,
    sourceId,
    targetId,
  );
  db.prepare('UPDATE layers SET parent_id = NULL WHERE parent_id = ? AND id = ?').run(
    sourceId,
    targetId,
  );
}

function swapRoot(db: SqliteDatabase, current: Layer, direction: LayerMove['direction']) {
  const rows = db
    .prepare(
      `SELECT id FROM layers
       WHERE manuscript_id = ? AND deleted_at IS NULL
         AND id NOT IN (
           SELECT layer_links.layer_id FROM layer_links
           JOIN layers AS host ON host.id = layer_links.host_layer_id AND host.deleted_at IS NULL
         )
       ORDER BY sort_order, id`,
    )
    .all(current.manuscriptId) as { id: string }[];
  const ordered = swapped(
    rows.map((row) => row.id),
    current.id,
    direction,
  );
  if (ordered === null) throw endedMove(direction);
  const now = new Date().toISOString();
  const write = db.prepare('UPDATE layers SET sort_order = ?, updated_at = ? WHERE id = ?');
  ordered.forEach((id, index) => write.run(index, now, id));
}

function endedMove(direction: LayerMove['direction']): Error {
  return new Error(direction === 'up' ? 'layer is already first' : 'layer is already last');
}

/** Siblings in their new order, or null at an end. Callers renumber all of them, so equal sort orders still move. */
function swapped(ids: readonly string[], id: string, direction: LayerMove['direction']) {
  const index = ids.indexOf(id);
  const other = direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || other < 0 || other >= ids.length) return null;
  const next = [...ids];
  next[index] = ids[other] as string;
  next[other] = id;
  return next;
}

function swapHosted(
  db: SqliteDatabase,
  layerId: string,
  hostId: string,
  direction: LayerMove['direction'],
) {
  const rows = db
    .prepare(
      `SELECT layer_links.id, layer_links.layer_id AS layerId, layer_links.sort_order AS sortOrder
       FROM layer_links
       JOIN layers ON layers.id = layer_links.layer_id AND layers.deleted_at IS NULL
       WHERE layer_links.host_layer_id = ? AND layer_links.is_preferred = 1
       ORDER BY layer_links.sort_order, layer_links.layer_id`,
    )
    .all(hostId) as { id: string; layerId: string }[];
  const ordered = swapped(
    rows.map((row) => row.layerId),
    layerId,
    direction,
  );
  if (ordered === null) throw endedMove(direction);
  const linkOf = new Map(rows.map((row) => [row.layerId, row.id]));
  const write = db.prepare('UPDATE layer_links SET sort_order = ? WHERE id = ?');
  ordered.forEach((id, index) => write.run(index, linkOf.get(id)));
}

function markDeleted(db: SqliteDatabase, ids: readonly string[], now: string, retainUntil: string) {
  const write = db.prepare(
    `UPDATE layers
     SET deleted_at = ?, retain_until = ?, reminder_shown_at = NULL, updated_at = ?
     WHERE id = ? AND deleted_at IS NULL`,
  );
  for (const id of ids) write.run(now, retainUntil, now, id);
}

function assertRestoreParent(db: SqliteDatabase, layerId: string, restoring: readonly string[]) {
  const parent = db
    .prepare('SELECT parent_id AS parentId FROM layers WHERE id = ?')
    .get(layerId) as {
    parentId: string | null;
  };
  if (
    parent.parentId !== null &&
    isDeleted(db, parent.parentId) &&
    !restoring.includes(parent.parentId)
  ) {
    throw new Error('layer parent is deleted');
  }
  const hostId = preferredHostId(db, layerId);
  if (hostId !== null && isDeleted(db, hostId) && !restoring.includes(hostId)) {
    throw new Error('layer host is deleted');
  }
}

function deletedTogether(db: SqliteDatabase, rootId: string, deletedAt: string): string[] {
  const found: string[] = [];
  const seen = new Set([rootId]);
  const queue = [rootId];
  const next = db.prepare(
    `SELECT id FROM layers WHERE parent_id = ? AND deleted_at = ?
     UNION
     SELECT layer_links.layer_id FROM layer_links
     JOIN layers ON layers.id = layer_links.layer_id AND layers.deleted_at = ?
     WHERE layer_links.host_layer_id = ?`,
  );
  while (queue.length > 0) {
    const id = queue.shift();
    if (id === undefined) break;
    const rows = next.all(id, deletedAt, deletedAt, id) as { id: string }[];
    for (const row of rows) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      found.push(row.id);
      queue.push(row.id);
    }
  }
  return found;
}

/** Removes the layers and every row that depends on them, found through the schema's foreign keys. */
function purgeLayers(db: SqliteDatabase, layerIds: string[]) {
  const marks = layerIds.map(() => '?').join(',');
  db.prepare(`DELETE FROM notes WHERE layer_id IN (${marks})`).run(...layerIds);
  db.prepare(
    `DELETE FROM notes WHERE unit_id IN (SELECT id FROM units WHERE layer_id IN (${marks}))`,
  ).run(...layerIds);
  purgeRows(db, 'layer_links', 'layer_id', layerIds, new Set());
  purgeRows(db, 'layer_links', 'host_layer_id', layerIds, new Set());
  purgeRows(db, 'layers', 'id', layerIds, new Set());
  const left = db
    .prepare(`SELECT COUNT(*) AS n FROM layers WHERE id IN (${marks})`)
    .get(...layerIds) as { n: number };
  if (left.n !== 0) throw new Error('layer purge readback failed');
}

function purgeRows(
  db: SqliteDatabase,
  table: string,
  column: string,
  values: string[],
  active: Set<string>,
) {
  const key = `${table}.${column}`;
  if (active.has(key)) return;
  active.add(key);
  const marks = values.map(() => '?').join(',');
  const ids = db
    .prepare(`SELECT rowid AS id FROM ${table} WHERE ${column} IN (${marks})`)
    .all(...values) as { id: number }[];
  if (ids.length > 0) {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as {
      name: string;
    }[];
    const pk = (
      db.prepare(`PRAGMA table_info(${table})`).all() as { name: string; pk: number }[]
    ).find((col) => col.pk === 1)?.name;
    if (pk !== undefined) {
      const keys = (
        db
          .prepare(`SELECT ${pk} AS v FROM ${table} WHERE ${column} IN (${marks})`)
          .all(...values) as { v: string }[]
      ).map((row) => row.v);
      for (const other of tables) {
        const refs = db.prepare(`PRAGMA foreign_key_list(${other.name})`).all() as {
          table: string;
          from: string;
          to: string | null;
        }[];
        for (const ref of refs) {
          if (ref.table !== table || (ref.to !== null && ref.to !== pk)) continue;
          if (other.name === table) continue;
          purgeRows(db, other.name, ref.from, keys, active);
        }
      }
    }
    db.prepare(`DELETE FROM ${table} WHERE ${column} IN (${marks})`).run(...values);
  }
  active.delete(key);
}

export function descendantIds(
  db: SqliteDatabase,
  rootId: string,
  includeDeleted = false,
): string[] {
  const found: string[] = [];
  const seen = new Set([rootId]);
  const queue = [rootId];
  const next = db.prepare(
    `SELECT id FROM layers WHERE parent_id = ? AND (? OR deleted_at IS NULL)
     UNION
     SELECT layer_links.layer_id FROM layer_links
     JOIN layers ON layers.id = layer_links.layer_id AND (? OR layers.deleted_at IS NULL)
     WHERE layer_links.host_layer_id = ?`,
  );
  while (queue.length > 0) {
    const id = queue.shift();
    if (id === undefined) break;
    const rows = next.all(id, includeDeleted ? 1 : 0, includeDeleted ? 1 : 0, id) as {
      id: string;
    }[];
    for (const row of rows) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      found.push(row.id);
      queue.push(row.id);
    }
  }
  return found;
}

function preferredHostId(db: SqliteDatabase, layerId: string): string | null {
  const row = db
    .prepare(
      `SELECT layer_links.host_layer_id AS hostId
       FROM layer_links
       JOIN layers AS host ON host.id = layer_links.host_layer_id AND host.manuscript_id = layer_links.manuscript_id
       WHERE layer_links.layer_id = ?
       ORDER BY layer_links.is_preferred DESC, layer_links.sort_order, layer_links.host_layer_id
       LIMIT 1`,
    )
    .get(layerId) as { hostId: string } | undefined;
  return row?.hostId ?? null;
}

function activeLayer(db: SqliteDatabase, id: string): Layer {
  const layer = getLayer(db, id);
  if (!layer) throw new Error('layer is missing');
  const deleted = db.prepare('SELECT deleted_at AS deletedAt FROM layers WHERE id = ?').get(id) as {
    deletedAt: string | null;
  };
  if (deleted.deletedAt !== null) throw new Error('layer is deleted');
  return layer;
}

function isDeleted(db: SqliteDatabase, id: string): boolean {
  const row = db.prepare('SELECT deleted_at AS deletedAt FROM layers WHERE id = ?').get(id) as
    { deletedAt: string | null } | undefined;
  return row === undefined || row.deletedAt !== null;
}

function readBack(db: SqliteDatabase, id: string): Layer {
  const layer = getLayer(db, id);
  if (!layer) throw new Error('layer readback failed');
  return layer;
}

function assertName(name: Record<string, string>) {
  if (!Object.values(name).some((value) => value.trim().length > 0)) {
    throw new Error('layer name is empty');
  }
}

function plusUtcDays(iso: string, days: number): string {
  const date = new Date(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}
