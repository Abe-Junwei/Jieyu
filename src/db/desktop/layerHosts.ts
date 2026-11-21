import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { descendantIds } from './layerStructure';
import { listLayerLinks, type LayerHostInput, type LayerLink, type LayerLinkType } from './layers';

type SqliteDatabase = InstanceType<typeof Database>;

const LINK_TYPES: readonly LayerLinkType[] = ['direct', 'free', 'literal', 'pedagogical'];

export interface LayerHostsSet {
  layerId: string;
  /** Ordered, unique, and non-empty. */
  hostLayerIds: string[];
  preferredHostLayerId: string;
  linkType: LayerLinkType;
}

export interface LayerHostsPreview {
  layerId: string;
  removed: Array<{ hostLayerId: string; texts: number; drafts: number }>;
  blocked: boolean;
}

interface CurrentLink {
  hostLayerId: string;
  isPreferred: boolean;
  sortOrder: number;
}

interface CheckedHosts {
  manuscriptId: string;
  current: CurrentLink[];
  removed: string[];
}

/** Shared with layer creation. Preferred link appends under its host; others keep their index. */
export function insertHostLinks(
  db: SqliteDatabase,
  layerId: string,
  manuscriptId: string,
  hosts: LayerHostInput[],
  now: string,
): void {
  if (hosts.length === 0) return;
  const preferredCount = hosts.filter((host) => host.preferred === true).length;
  if (preferredCount > 1) throw new Error('layer has more than one preferred host');
  const preferredIndex =
    preferredCount === 0 ? 0 : hosts.findIndex((host) => host.preferred === true);
  const insert = db.prepare(
    `INSERT INTO layer_links (
      id, manuscript_id, layer_id, host_layer_id, link_type, is_preferred, sort_order, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  // The preferred link's sort order places the layer among its host's children: append it.
  const lastChild = db.prepare(
    `SELECT COALESCE(MAX(sort_order), -1) AS last FROM layer_links
     WHERE host_layer_id = ? AND is_preferred = 1`,
  );
  hosts.forEach((host, index) => {
    const preferred = index === preferredIndex;
    insert.run(
      randomUUID(),
      manuscriptId,
      layerId,
      host.hostLayerId,
      host.linkType ?? 'free',
      preferred ? 1 : 0,
      preferred ? (lastChild.get(host.hostLayerId) as { last: number }).last + 1 : index,
      now,
    );
  });
}

/** How many of this layer's texts sit on hosts that would be detached. Read-only. */
export function previewLayerHosts(db: SqliteDatabase, input: LayerHostsSet): LayerHostsPreview {
  const checked = checkHosts(db, input);
  const removed = countRemoved(db, input.layerId, checked.removed);
  return {
    layerId: input.layerId,
    removed,
    blocked: removed.some((row) => row.texts + row.drafts > 0),
  };
}

/** Replace the live host links in one transaction. Links to deleted hosts stay as they are. */
export function setLayerHosts(db: SqliteDatabase, input: LayerHostsSet): LayerLink[] {
  const write = db.transaction(() => {
    const checked = checkHosts(db, input);
    const removed = countRemoved(db, input.layerId, checked.removed);
    if (removed.some((row) => row.texts + row.drafts > 0)) {
      throw new Error('layer host still has texts');
    }
    const oldPreferred = checked.current.find((link) => link.isPreferred);
    const now = new Date().toISOString();
    if (checked.current.length > 0) {
      const marks = checked.current.map(() => '?').join(', ');
      db.prepare(`DELETE FROM layer_links WHERE layer_id = ? AND host_layer_id IN (${marks})`).run(
        input.layerId,
        ...checked.current.map((link) => link.hostLayerId),
      );
    }
    const insert = db.prepare(
      `INSERT INTO layer_links (
        id, manuscript_id, layer_id, host_layer_id, link_type, is_preferred, sort_order, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const lastChild = db.prepare(
      `SELECT COALESCE(MAX(sort_order), -1) AS last FROM layer_links
       WHERE host_layer_id = ? AND is_preferred = 1 AND layer_id <> ?`,
    );
    input.hostLayerIds.forEach((hostId, index) => {
      const preferred = hostId === input.preferredHostLayerId;
      const sortOrder = preferred
        ? oldPreferred?.hostLayerId === hostId
          ? oldPreferred.sortOrder
          : (lastChild.get(hostId, input.layerId) as { last: number }).last + 1
        : index;
      insert.run(
        randomUUID(),
        checked.manuscriptId,
        input.layerId,
        hostId,
        input.linkType,
        preferred ? 1 : 0,
        sortOrder,
        now,
      );
    });
    db.prepare('UPDATE layers SET updated_at = ? WHERE id = ?').run(now, input.layerId);
    return listLayerLinks(db, checked.manuscriptId).filter(
      (link) => link.layerId === input.layerId,
    );
  });
  return write();
}

function checkHosts(db: SqliteDatabase, input: LayerHostsSet): CheckedHosts {
  if (!LINK_TYPES.includes(input.linkType)) throw new Error('layer cannot change hosts');
  if (
    input.hostLayerIds.length === 0 ||
    new Set(input.hostLayerIds).size !== input.hostLayerIds.length
  ) {
    throw new Error('layer cannot change hosts');
  }
  if (!input.hostLayerIds.includes(input.preferredHostLayerId)) {
    throw new Error('layer cannot change hosts');
  }
  const layer = db
    .prepare(
      `SELECT layers.id, layers.manuscript_id AS manuscriptId, layers.tier_type AS tierType,
              layers.deleted_at AS deletedAt
       FROM layers
       JOIN manuscripts ON manuscripts.id = layers.manuscript_id AND manuscripts.deleted_at IS NULL
       WHERE layers.id = ?`,
    )
    .get(input.layerId) as
    { id: string; manuscriptId: string; tierType: string; deletedAt: string | null } | undefined;
  if (!layer || layer.deletedAt !== null || layer.tierType !== 'symbolic-association') {
    throw new Error('layer cannot change hosts');
  }
  const descendants = new Set(descendantIds(db, layer.id));
  for (const hostId of input.hostLayerIds) {
    const host = db
      .prepare(
        `SELECT id, manuscript_id AS manuscriptId, content_type AS contentType,
                deleted_at AS deletedAt
         FROM layers WHERE id = ?`,
      )
      .get(hostId) as
      | { id: string; manuscriptId: string; contentType: string; deletedAt: string | null }
      | undefined;
    if (
      !host ||
      host.deletedAt !== null ||
      host.manuscriptId !== layer.manuscriptId ||
      host.contentType !== 'transcription' ||
      host.id === layer.id
    ) {
      throw new Error('layer host is not a transcription layer');
    }
    if (descendants.has(host.id)) throw new Error('layer host would form a cycle');
  }
  const current = db
    .prepare(
      `SELECT layer_links.host_layer_id AS hostLayerId, layer_links.is_preferred AS isPreferred,
              layer_links.sort_order AS sortOrder
       FROM layer_links
       JOIN layers AS host ON host.id = layer_links.host_layer_id AND host.deleted_at IS NULL
       WHERE layer_links.layer_id = ?`,
    )
    .all(input.layerId) as { hostLayerId: string; isPreferred: number; sortOrder: number }[];
  const next = new Set(input.hostLayerIds);
  return {
    manuscriptId: layer.manuscriptId,
    current: current.map((row) => ({
      hostLayerId: row.hostLayerId,
      isPreferred: row.isPreferred === 1,
      sortOrder: row.sortOrder,
    })),
    removed: current.map((row) => row.hostLayerId).filter((id) => !next.has(id)),
  };
}

function countRemoved(
  db: SqliteDatabase,
  layerId: string,
  hostIds: readonly string[],
): LayerHostsPreview['removed'] {
  const texts = db.prepare(
    `SELECT COUNT(*) AS n FROM unit_texts
     JOIN units ON units.id = unit_texts.unit_id
     WHERE unit_texts.layer_id = ? AND units.layer_id = ?`,
  );
  const drafts = db.prepare(
    `SELECT COUNT(*) AS n FROM unit_text_drafts
     JOIN units ON units.id = unit_text_drafts.unit_id
     WHERE unit_text_drafts.layer_id = ? AND units.layer_id = ?`,
  );
  return hostIds.map((hostLayerId) => ({
    hostLayerId,
    texts: (texts.get(layerId, hostLayerId) as { n: number }).n,
    drafts: (drafts.get(layerId, hostLayerId) as { n: number }).n,
  }));
}
