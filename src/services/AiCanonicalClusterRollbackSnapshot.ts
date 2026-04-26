/**
 * Snapshots / restores canonical utterance units (and their segment subgraph + tokens + notes)
 * for AI `propose_changes` rollback — complements segment-only `snapshotLayerSegmentGraphBySegmentIds`.
 */
import type { Table } from 'dexie';
import { invalidateUnitEmbeddings } from '../ai/embeddings/EmbeddingInvalidationService';
import { SegmentMetaService } from './SegmentMetaService';
import type {
  AnchorDocType,
  JieyuDatabase,
  LayerUnitContentDocType,
  LayerUnitDocType,
  TokenLexemeLinkDocType,
  UnitMorphemeDocType,
  UnitTokenDocType,
  UserNoteDocType,
} from '../db';
import { dexieStoresForLayerSegmentGraphRw, dexieStoresForRemoveUnitCascadeRw } from '../db/dexieTranscriptionGraphStores';
import { withTransaction } from '../db/withTransaction';
import {
  bulkUpsertLayerUnitContents,
  bulkUpsertLayerUnits,
} from './LayerUnitSegmentWritePrimitives';
import {
  deleteLayerSegmentGraphByUnitIds,
  type LayerSegmentGraphSnapshot,
  snapshotLayerSegmentGraphBySegmentIds,
} from './LayerSegmentGraphService';
import { LayerSegmentQueryService } from './LayerSegmentQueryService';
import { LayerUnitRelationQueryService } from './LayerUnitRelationQueryService';
import { LayerUnitSegmentWriteService } from './LayerUnitSegmentWriteService';

function uniqueIds(ids: readonly string[]): string[] {
  return [...new Set(ids.filter((id) => id.trim().length > 0))];
}

/**
 * Hard cap for IDs participating in one structural AI snapshot (merge / delete / allSegments).
 * Read on each call so tests can `vi.stubEnv('JIEYU_AI_STRUCTURAL_ROLLBACK_MAX_SELECTION_IDS', '…')`.
 * Default 4000; see `docs/architecture/ai-propose-changes-rollback-scale.md`.
 */
export function getAiStructuralRollbackMaxSelectionIds(): number {
  const raw = typeof process !== 'undefined' ? process.env.JIEYU_AI_STRUCTURAL_ROLLBACK_MAX_SELECTION_IDS : undefined;
  const n = raw != null && String(raw).trim() !== '' ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 4000;
}

function dedupeDexieStores(db: JieyuDatabase): Table<any, any, any>[] {
  const a = [...dexieStoresForLayerSegmentGraphRw(db), ...dexieStoresForRemoveUnitCascadeRw(db)];
  const byName = new Map<string, Table<any, any, any>>();
  for (const t of a) {
    byName.set(t.name, t);
  }
  return [...byName.values()];
}

export type AiCanonicalClusterRollbackSnapshot = {
  canonicalUnitIds: string[];
  /** Segment rows + segment-layer contents + links under the canonical cluster at capture time. */
  segmentGraph: LayerSegmentGraphSnapshot;
  canonicalUnits: LayerUnitDocType[];
  /** `layer_unit_contents` rows whose `unitId` is a canonical (utterance) id — not segment rows. */
  canonicalContents: LayerUnitContentDocType[];
  tokens: UnitTokenDocType[];
  morphemes: UnitMorphemeDocType[];
  tokenLexemeLinks: TokenLexemeLinkDocType[];
  anchors: AnchorDocType[];
  userNotes: UserNoteDocType[];
};

function isCanonicalHostRow(row: LayerUnitDocType | undefined): row is LayerUnitDocType {
  return row != null && row.unitType !== 'segment';
}

/**
 * Returns null if any id is missing or is a segment row (merge/delete must target canonical hosts for this path).
 */
export async function captureAiCanonicalClusterRollbackSnapshot(
  db: JieyuDatabase,
  canonicalUnitIds: readonly string[],
): Promise<AiCanonicalClusterRollbackSnapshot | null> {
  const ids = uniqueIds(canonicalUnitIds);
  if (ids.length === 0) return null;
  if (ids.length > getAiStructuralRollbackMaxSelectionIds()) return null;

  const rows = await db.dexie.layer_units.bulkGet(ids);
  if (rows.length !== ids.length || rows.some((r) => !isCanonicalHostRow(r))) {
    return null;
  }

  const canonicalUnits = rows.filter(isCanonicalHostRow);

  const [indexedSegments, subdivisionChildIds] = await Promise.all([
    LayerSegmentQueryService.listSegmentsByParentUnitIds(ids),
    LayerUnitRelationQueryService.listTimeSubdivisionChildUnitIds(ids, db),
  ]);
  const segmentIds = uniqueIds([
    ...indexedSegments.map((segment) => segment.id),
    ...subdivisionChildIds,
  ]);
  const segmentGraph = await snapshotLayerSegmentGraphBySegmentIds(db, segmentIds);

  const canonicalContents = await db.dexie.layer_unit_contents.where('unitId').anyOf(ids).toArray();

  const tokens = await db.dexie.unit_tokens.where('unitId').anyOf(ids).toArray();
  const morphemes = await db.dexie.unit_morphemes.where('unitId').anyOf(ids).toArray();
  const tokenIds = tokens.map((t) => t.id);
  const morphIds = morphemes.map((m) => m.id);
  const linkTargets: Array<[string, string]> = [
    ...tokenIds.map((id) => ['token', id] as [string, string]),
    ...morphIds.map((id) => ['morpheme', id] as [string, string]),
  ];
  const tokenLexemeLinks = linkTargets.length === 0
    ? []
    : await db.dexie.token_lexeme_links.where('[targetType+targetId]').anyOf(linkTargets).toArray();

  const anchorIds = new Set<string>();
  for (const row of canonicalUnits) {
    if (row.startAnchorId) anchorIds.add(row.startAnchorId);
    if (row.endAnchorId) anchorIds.add(row.endAnchorId);
  }
  const anchors = anchorIds.size === 0
    ? []
    : (await db.dexie.anchors.bulkGet([...anchorIds])).filter((a): a is AnchorDocType => Boolean(a));

  const noteTargets = ids.map((id) => ['unit', id] as [string, string]);
  const userNotes = await db.dexie.user_notes.where('[targetType+targetId]').anyOf(noteTargets).toArray();

  return {
    canonicalUnitIds: ids,
    segmentGraph,
    canonicalUnits,
    canonicalContents,
    tokens,
    morphemes,
    tokenLexemeLinks,
    anchors,
    userNotes,
  };
}

/**
 * Restores DB rows captured by {@link captureAiCanonicalClusterRollbackSnapshot}.
 * Clears current segment subgraph under the cluster hosts, then re-upserts anchors → hosts → segment graph → contents → lexical rows → notes.
 */
export async function restoreAiCanonicalClusterRollbackSnapshot(
  db: JieyuDatabase,
  snapshot: AiCanonicalClusterRollbackSnapshot,
): Promise<void> {
  const ids = snapshot.canonicalUnitIds;
  if (ids.length === 0) return;

  await deleteLayerSegmentGraphByUnitIds(db, ids);

  await withTransaction(
    db,
    'rw',
    dedupeDexieStores(db),
    async () => {
      if (snapshot.anchors.length > 0) {
        await db.dexie.anchors.bulkPut(snapshot.anchors);
      }

      if (snapshot.canonicalUnits.length > 0) {
        await bulkUpsertLayerUnits(db, snapshot.canonicalUnits);
      }

      if (snapshot.segmentGraph.units.length > 0) {
        await bulkUpsertLayerUnits(db, snapshot.segmentGraph.units);
      }
      if (snapshot.segmentGraph.contents.length > 0) {
        await bulkUpsertLayerUnitContents(db, snapshot.segmentGraph.contents);
      }
      if (snapshot.segmentGraph.links.length > 0) {
        await LayerUnitSegmentWriteService.upsertSegmentLinks(db, snapshot.segmentGraph.links);
      }

      for (const id of ids) {
        await db.dexie.layer_unit_contents.where('unitId').equals(id).delete();
      }
      if (snapshot.canonicalContents.length > 0) {
        await bulkUpsertLayerUnitContents(db, snapshot.canonicalContents);
      }

      await db.dexie.unit_tokens.where('unitId').anyOf(ids).delete();
      if (snapshot.tokens.length > 0) {
        await db.dexie.unit_tokens.bulkPut(snapshot.tokens);
      }

      await db.dexie.unit_morphemes.where('unitId').anyOf(ids).delete();
      if (snapshot.morphemes.length > 0) {
        await db.dexie.unit_morphemes.bulkPut(snapshot.morphemes);
      }

      const linkTargets: Array<[string, string]> = [
        ...snapshot.tokens.map((t) => ['token', t.id] as [string, string]),
        ...snapshot.morphemes.map((m) => ['morpheme', m.id] as [string, string]),
      ];
      if (linkTargets.length > 0) {
        await db.dexie.token_lexeme_links.where('[targetType+targetId]').anyOf(linkTargets).delete();
      }
      if (snapshot.tokenLexemeLinks.length > 0) {
        await db.dexie.token_lexeme_links.bulkPut(snapshot.tokenLexemeLinks);
      }

      const noteTargets = ids.map((id) => ['unit', id] as [string, string]);
      await db.dexie.user_notes.where('[targetType+targetId]').anyOf(noteTargets).delete();
      if (snapshot.userNotes.length > 0) {
        await db.dexie.user_notes.bulkPut(snapshot.userNotes);
      }
    },
    { label: 'AiCanonicalClusterRollbackSnapshot.restore' },
  );

  await invalidateUnitEmbeddings(db, ids);

  const metaIds = uniqueIds([
    ...ids,
    ...snapshot.segmentGraph.units.map((u) => u.id),
  ]);
  void SegmentMetaService.syncForUnitIds(metaIds).catch(() => {
    // Same fire-and-forget posture as removeUnitCascade | SegmentMeta refresh must not block rollback.
  });
}
