/**
 * Collaboration project snapshots are a textId-scoped subset of the Dexie dump.
 * User whole-DB backup (`exportDatabaseAsJson`) stays on a separate path (ADR-0008 / ADR-0034).
 */
import { exportDatabaseAsJson, importDatabaseFromJson } from './io';
import type { ImportResult } from './types';
import { getDb, type JieyuDatabase } from './engine';
import { dexieStoresForProjectScopedSnapshotPruneRw } from './dexieTranscriptionGraphStores';
import { withTransaction } from './withTransaction';
import { PROJECT_CATALOG_TEXT_ID_TABLES } from './tableRegistry';

export const COLLAB_PROJECT_SNAPSHOT_EXCLUDED_COLLECTIONS = new Set<string>([
  'ai_tasks',
  'ai_task_snapshots',
  'embeddings',
  'ai_conversations',
  'ai_messages',
  'ai_session_memories',
  'project_ai_memories',
  'mcp_tool_call_audits',
  'external_mcp_trust',
  'agent_artifacts',
  'ai_source_sets',
  'audit_logs',
  'language_asset_overviews',
]);

/** 目录表清单来自 `tableRegistry`；说话人另按单元引用裁剪 | Catalog list comes from `tableRegistry`; speakers are pruned via unit refs */
const PROJECT_OWNED_CATALOG_COLLECTIONS = PROJECT_CATALOG_TEXT_ID_TABLES.filter(
  (name) => name !== 'speakers',
);

const TEXT_ID_COLLECTIONS = [
  'media_items',
  'layers',
  'tier_definitions',
  'layer_units',
  'unit_tokens',
  'unit_morphemes',
  'unit_relations',
  'segment_meta',
  'segment_quality_snapshots',
  'speaker_profile_snapshots',
  'translation_status_snapshots',
  'track_entities',
  'source_records',
  'annotation_documents',
] as const;

type SnapshotCollections = Record<string, unknown[]>;

function isRow(value: unknown): value is Record<string, unknown> {
  return (
    value !== null && value !== undefined && typeof value === 'object' && !Array.isArray(value)
  );
}

function rowString(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function rowsOf(collections: SnapshotCollections, name: string): Record<string, unknown>[] {
  const raw = collections[name];
  if (!Array.isArray(raw)) return [];
  return raw.filter(isRow);
}

function idsOf(rows: readonly Record<string, unknown>[]): Set<string> {
  const ids = new Set<string>();
  for (const row of rows) {
    const id = rowString(row, 'id');
    if (id !== null) ids.add(id);
  }
  return ids;
}

/** Pure filter used by export and by restore of legacy whole-DB cloud payloads. */
export function filterCollectionsForProject(
  collections: SnapshotCollections,
  textId: string,
): SnapshotCollections {
  const projectId = textId.trim();
  if (projectId.length === 0) {
    throw new Error('filterCollectionsForProject requires a non-empty textId');
  }

  const next: SnapshotCollections = {};
  next.texts = rowsOf(collections, 'texts').filter((row) => rowString(row, 'id') === projectId);

  for (const name of TEXT_ID_COLLECTIONS) {
    const filtered = rowsOf(collections, name).filter(
      (row) => rowString(row, 'textId') === projectId,
    );
    if (filtered.length > 0 || Array.isArray(collections[name])) {
      next[name] = filtered;
    }
  }

  const scopeStats = rowsOf(collections, 'scope_stats_snapshots').filter(
    (row) => rowString(row, 'textId') === projectId || rowString(row, 'scopeKey') === projectId,
  );
  if (scopeStats.length > 0 || Array.isArray(collections.scope_stats_snapshots)) {
    next.scope_stats_snapshots = scopeStats;
  }

  const unitIds = idsOf(rowsOf(next, 'layer_units'));
  const tokenIds = idsOf(rowsOf(next, 'unit_tokens'));
  const morphemeIds = idsOf(rowsOf(next, 'unit_morphemes'));
  const layerIds = new Set<string>([
    ...idsOf(rowsOf(next, 'layers')),
    ...idsOf(rowsOf(next, 'tier_definitions')),
  ]);
  const mediaIds = idsOf(rowsOf(next, 'media_items'));

  const contents = rowsOf(collections, 'layer_unit_contents').filter((row) => {
    if (rowString(row, 'textId') === projectId) return true;
    const unitId = rowString(row, 'unitId') ?? rowString(row, 'segmentId');
    return unitId !== null && unitIds.has(unitId);
  });
  if (contents.length > 0 || Array.isArray(collections.layer_unit_contents)) {
    next.layer_unit_contents = contents;
  }

  const links = rowsOf(collections, 'layer_links').filter((row) => {
    const host = rowString(row, 'hostTranscriptionLayerId');
    const layerId = rowString(row, 'layerId');
    return (host !== null && layerIds.has(host)) || (layerId !== null && layerIds.has(layerId));
  });
  if (links.length > 0 || Array.isArray(collections.layer_links)) {
    next.layer_links = links;
  }

  const anchors = rowsOf(collections, 'anchors').filter((row) => {
    const mediaId = rowString(row, 'mediaId');
    return mediaId !== null && mediaIds.has(mediaId);
  });
  if (anchors.length > 0 || Array.isArray(collections.anchors)) {
    next.anchors = anchors;
  }

  const annotations = rowsOf(collections, 'tier_annotations').filter((row) => {
    const tierId = rowString(row, 'tierId');
    return tierId !== null && layerIds.has(tierId);
  });
  if (annotations.length > 0 || Array.isArray(collections.tier_annotations)) {
    next.tier_annotations = annotations;
  }

  const annotationIds = idsOf(rowsOf(next, 'tier_annotations'));
  const contentIds = idsOf(rowsOf(next, 'layer_unit_contents'));
  const lexemeIds = idsOf(
    rowsOf(collections, 'lexemes').filter((row) => rowString(row, 'textId') === projectId),
  );
  // 每种备注目标都按本项目的行判断（R-SCOPED-NOTES）：单元格备注 `unitId::layerId[::…]`、词条 / 义项备注等
  // Every note target kind is matched against this project's rows (R-SCOPED-NOTES): cell notes
  // `unitId::layerId[::…]`, lexeme / sense notes, etc.
  const notes = rowsOf(collections, 'user_notes').filter((row) => {
    const targetType = rowString(row, 'targetType');
    const targetId = rowString(row, 'targetId');
    const parentTargetId = rowString(row, 'parentTargetId');
    if (targetId === null) return false;
    switch (targetType) {
      case 'text':
        return targetId === projectId;
      case 'unit':
        return unitIds.has(targetId);
      case 'token':
        return tokenIds.has(targetId);
      case 'morpheme':
        return morphemeIds.has(targetId);
      case 'translation':
        return contentIds.has(targetId);
      case 'annotation':
        return annotationIds.has(targetId);
      case 'lexeme':
        return lexemeIds.has(targetId);
      case 'sense':
        return parentTargetId !== null && lexemeIds.has(parentTargetId);
      case 'tier_annotation': {
        if (annotationIds.has(targetId)) return true;
        const [unitPart, layerPart] = targetId.split('::');
        return (
          (unitPart !== undefined && unitIds.has(unitPart)) ||
          (layerPart !== undefined && layerIds.has(layerPart))
        );
      }
      default:
        return false;
    }
  });
  if (notes.length > 0 || Array.isArray(collections.user_notes)) {
    next.user_notes = notes;
  }

  // 2B-B：说话人和其他目录行一样只按归属取 | Speakers are filtered by owner like every catalog row
  const speakers = rowsOf(collections, 'speakers').filter(
    (row) => rowString(row, 'textId') === projectId,
  );
  if (speakers.length > 0) {
    next.speakers = speakers;
  }

  for (const name of PROJECT_OWNED_CATALOG_COLLECTIONS) {
    const filtered = rowsOf(collections, name).filter(
      (row) => rowString(row, 'textId') === projectId,
    );
    if (filtered.length > 0) next[name] = filtered;
  }

  const profiles = rowsOf(collections, 'structural_rule_profiles').filter(
    (row) => rowString(row, 'projectId') === projectId,
  );
  if (profiles.length > 0) next.structural_rule_profiles = profiles;

  const lexemeLinks = rowsOf(collections, 'token_lexeme_links').filter((row) => {
    const targetId = rowString(row, 'targetId');
    return targetId !== null && (tokenIds.has(targetId) || morphemeIds.has(targetId));
  });
  if (lexemeLinks.length > 0) next.token_lexeme_links = lexemeLinks;

  return next;
}

/** Drop links whose token or morpheme row is gone. Links for surviving targets stay. */
export async function dropLexemeLinksWithMissingTargets(): Promise<void> {
  const db = await getDb();
  const [tokens, morphemes, links] = await Promise.all([
    db.dexie.unit_tokens.toArray(),
    db.dexie.unit_morphemes.toArray(),
    db.dexie.token_lexeme_links.toArray(),
  ]);
  const tokenIds = new Set(tokens.map((row) => row.id));
  const morphemeIds = new Set(morphemes.map((row) => row.id));
  const staleIds = links
    .filter((link) => {
      if (link.targetType === 'token') return !tokenIds.has(link.targetId);
      if (link.targetType === 'morpheme') return !morphemeIds.has(link.targetId);
      return true;
    })
    .map((link) => link.id);
  if (staleIds.length > 0) {
    await db.dexie.token_lexeme_links.bulkDelete(staleIds);
  }
}

export async function exportProjectScopedDatabaseAsJson(textId: string): Promise<{
  schemaVersion: number;
  exportedAt: string;
  dbName: string;
  collections: SnapshotCollections;
}> {
  // 不读 AI / 向量 / 审计等与项目快照无关的大表（JY-15）| Skip AI / embedding / audit tables (JY-15)
  const full = await exportDatabaseAsJson({
    skipCollections: COLLAB_PROJECT_SNAPSHOT_EXCLUDED_COLLECTIONS,
  });
  return {
    schemaVersion: full.schemaVersion,
    exportedAt: full.exportedAt,
    dbName: full.dbName,
    collections: filterCollectionsForProject(full.collections, textId),
  };
}

async function pruneProjectOwnedRows(db: JieyuDatabase, textId: string): Promise<void> {
  const projectId = textId.trim();
  // 可嵌套在导入事务内执行（父事务须包含这些表）| May run nested inside the import transaction
  await withTransaction(
    db,
    'rw',
    [...dexieStoresForProjectScopedSnapshotPruneRw(db)],
    async () => {
      const units = await db.dexie.layer_units.where('textId').equals(projectId).toArray();
      const unitIds = units.map((row) => row.id);
      const tokens = await db.dexie.unit_tokens.where('textId').equals(projectId).toArray();
      const morphemes = await db.dexie.unit_morphemes.where('textId').equals(projectId).toArray();
      const tokenIds = tokens.map((row) => row.id);
      const morphemeIds = morphemes.map((row) => row.id);
      const tiers = await db.dexie.tier_definitions.where('textId').equals(projectId).toArray();
      const layerIds = tiers.map((row) => row.id);
      const mediaItems = await db.dexie.media_items.where('textId').equals(projectId).toArray();
      const mediaIds = mediaItems.map((row) => row.id);

      const linkTargets: Array<[string, string]> = [
        ...tokenIds.map((id) => ['token', id] as [string, string]),
        ...morphemeIds.map((id) => ['morpheme', id] as [string, string]),
      ];
      if (linkTargets.length > 0) {
        await db.dexie.token_lexeme_links
          .where('[targetType+targetId]')
          .anyOf(linkTargets)
          .delete();
      }

      if (unitIds.length > 0) {
        await db.dexie.user_notes
          .where('[targetType+targetId]')
          .anyOf(unitIds.map((id) => ['unit', id] as [string, string]))
          .delete();
      }
      if (tokenIds.length > 0) {
        await db.dexie.user_notes
          .where('[targetType+targetId]')
          .anyOf(tokenIds.map((id) => ['token', id] as [string, string]))
          .delete();
      }
      if (morphemeIds.length > 0) {
        await db.dexie.user_notes
          .where('[targetType+targetId]')
          .anyOf(morphemeIds.map((id) => ['morpheme', id] as [string, string]))
          .delete();
      }
      await db.dexie.user_notes.where('[targetType+targetId]').equals(['text', projectId]).delete();

      await db.dexie.layer_unit_contents.where('textId').equals(projectId).delete();
      if (unitIds.length > 0) {
        await db.dexie.layer_unit_contents.where('unitId').anyOf(unitIds).delete();
      }
      await db.dexie.unit_relations.where('textId').equals(projectId).delete();
      await db.dexie.unit_tokens.where('textId').equals(projectId).delete();
      await db.dexie.unit_morphemes.where('textId').equals(projectId).delete();
      await db.dexie.layer_units.where('textId').equals(projectId).delete();

      if (layerIds.length > 0) {
        await db.dexie.tier_annotations.where('tierId').anyOf(layerIds).delete();
        const links = await db.dexie.layer_links.toArray();
        const staleLinkIds = links
          .filter(
            (link) =>
              layerIds.includes(link.hostTranscriptionLayerId) || layerIds.includes(link.layerId),
          )
          .map((link) => link.id);
        if (staleLinkIds.length > 0) {
          await db.dexie.layer_links.bulkDelete(staleLinkIds);
        }
      }
      await db.dexie.tier_definitions.where('textId').equals(projectId).delete();

      if (mediaIds.length > 0) {
        await db.dexie.anchors.where('mediaId').anyOf(mediaIds).delete();
      }
      await db.dexie.media_items.where('textId').equals(projectId).delete();
      await db.dexie.segment_meta.where('textId').equals(projectId).delete();
      await db.dexie.segment_quality_snapshots.where('textId').equals(projectId).delete();
      await db.dexie.scope_stats_snapshots.where('textId').equals(projectId).delete();
      await db.dexie.speaker_profile_snapshots.where('textId').equals(projectId).delete();
      await db.dexie.translation_status_snapshots.where('textId').equals(projectId).delete();
      await db.dexie.track_entities.where('textId').equals(projectId).delete();
      await db.dexie.source_records.where('textId').equals(projectId).delete();
      await db.dexie.annotation_documents.where('textId').equals(projectId).delete();
      for (const name of PROJECT_CATALOG_TEXT_ID_TABLES) {
        const table = db.dexie.table<{ id: string; textId?: string }, string>(name);
        const stale = await table
          .filter((row) => (row as { textId?: string }).textId === projectId)
          .toArray();
        if (stale.length > 0) await table.bulkDelete(stale.map((row) => row.id));
      }
      const staleProfiles = await db.dexie.structural_rule_profiles
        .filter((row) => row.projectId === projectId)
        .toArray();
      if (staleProfiles.length > 0) {
        await db.dexie.structural_rule_profiles.bulkDelete(staleProfiles.map((row) => row.id));
      }
      await db.dexie.texts.delete(projectId);
    },
    { label: 'projectScopedSnapshot.prune' },
  );
}

function parseSnapshotCollections(input: unknown): SnapshotCollections {
  const parsed: unknown = typeof input === 'string' ? JSON.parse(input) : input;
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Project snapshot must be a JSON object');
  }
  const collections = (parsed as { collections?: unknown }).collections;
  if (collections === null || typeof collections !== 'object' || Array.isArray(collections)) {
    throw new Error('Project snapshot missing collections');
  }
  const asRows: SnapshotCollections = {};
  for (const [name, value] of Object.entries(collections as Record<string, unknown>)) {
    asRows[name] = Array.isArray(value) ? value : [];
  }
  return asRows;
}

export async function importProjectScopedDatabaseFromJson(
  input: unknown,
  textId: string,
): Promise<ImportResult> {
  const projectId = textId.trim();
  if (projectId.length === 0) {
    throw new Error('importProjectScopedDatabaseFromJson requires a non-empty textId');
  }

  const filteredCollections = filterCollectionsForProject(
    parseSnapshotCollections(input),
    projectId,
  );
  const envelope =
    typeof input === 'string'
      ? (JSON.parse(input) as Record<string, unknown>)
      : ((input ?? {}) as Record<string, unknown>);
  const scopedSnapshot = {
    schemaVersion: envelope.schemaVersion,
    exportedAt: envelope.exportedAt,
    dbName: envelope.dbName,
    collections: filteredCollections,
  };

  // N2：清理与写入放在同一个事务里；本机媒体/附件字节在清理前读出并保留，失败时整体回滚。
  // N2: prune and write share one transaction; local media/asset bytes are read before the prune
  // and kept, and any failure rolls everything back.
  const db = await getDb();
  const result = await importDatabaseFromJson(scopedSnapshot, {
    strategy: 'upsert',
    preWrite: {
      tables: dexieStoresForProjectScopedSnapshotPruneRw(db),
      run: () => pruneProjectOwnedRows(db, projectId),
    },
  });
  await dropLexemeLinksWithMissingTargets();
  return result;
}
