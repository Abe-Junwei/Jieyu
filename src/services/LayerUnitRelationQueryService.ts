import {
  getDb,
  type JieyuDatabase,
  type SegmentLinkDocType,
  type UnitRelationDocType,
} from '../db';
import { featureFlags } from '../ai/config/featureFlags';
import {
  collectStaleRowsByIdAndUpdatedAt,
  mergeRowsByIdPreferNewest,
} from './LayerUnitLegacyProjection';
import { upsertSegmentLinkUnitRelation } from './LayerUnitSegmentMirrorPrimitives';

function mapSegmentLinkToUnitRelation(link: SegmentLinkDocType): UnitRelationDocType {
  return {
    id: link.id,
    textId: link.textId,
    sourceUnitId: link.sourceSegmentId,
    targetUnitId: link.targetSegmentId,
    relationType: link.linkType === 'time_subdivision' ? 'derived_from' : 'aligned_to',
    ...(link.provenance ? { provenance: link.provenance } : {}),
    createdAt: link.createdAt,
    updatedAt: link.updatedAt,
  };
}

async function backfillMissingLegacyLinks(
  legacyRows: SegmentLinkDocType[],
  unitRows: UnitRelationDocType[],
): Promise<void> {
  if (legacyRows.length === 0) return;

  const db = await getDb();
  const staleLegacyLinks = collectStaleRowsByIdAndUpdatedAt(legacyRows, unitRows);
  if (staleLegacyLinks.length === 0) return;

  await Promise.all(staleLegacyLinks.map((link) => upsertSegmentLinkUnitRelation(db, link)));
}

export class LayerUnitRelationQueryService {
  static async listRelationsBySourceUnitIds(
    sourceUnitIds: readonly string[],
    options?: { relationType?: UnitRelationDocType['relationType'] },
    database?: JieyuDatabase,
  ): Promise<UnitRelationDocType[]> {
    const ids = [...new Set(sourceUnitIds.filter((id) => id.trim().length > 0))];
    if (ids.length === 0) return [];

    const db = database ?? await getDb();
    const unitRows = await db.dexie.unit_relations.where('sourceUnitId').anyOf(ids).toArray();
    const legacyRows = featureFlags.legacySegmentationReadFallbackEnabled
      ? await db.dexie.segment_links.where('sourceSegmentId').anyOf(ids).toArray()
      : [];
    if (featureFlags.legacySegmentationReadFallbackEnabled) {
      await backfillMissingLegacyLinks(legacyRows, unitRows);
    }

    return mergeRowsByIdPreferNewest(legacyRows.map(mapSegmentLinkToUnitRelation), unitRows)
      .filter((row) => !options?.relationType || row.relationType === options.relationType);
  }

  static async listRelationsByTargetUnitIds(
    targetUnitIds: readonly string[],
    options?: { relationType?: UnitRelationDocType['relationType'] },
    database?: JieyuDatabase,
  ): Promise<UnitRelationDocType[]> {
    const ids = [...new Set(targetUnitIds.filter((id) => id.trim().length > 0))];
    if (ids.length === 0) return [];

    const db = database ?? await getDb();
    const unitRows = await db.dexie.unit_relations.where('targetUnitId').anyOf(ids).toArray();
    const legacyRows = featureFlags.legacySegmentationReadFallbackEnabled
      ? await db.dexie.segment_links.where('targetSegmentId').anyOf(ids).toArray()
      : [];
    if (featureFlags.legacySegmentationReadFallbackEnabled) {
      await backfillMissingLegacyLinks(legacyRows, unitRows);
    }

    return mergeRowsByIdPreferNewest(legacyRows.map(mapSegmentLinkToUnitRelation), unitRows)
      .filter((row) => !options?.relationType || row.relationType === options.relationType);
  }

  static async listSourceUnitIdsByTargetUnitIds(
    targetUnitIds: readonly string[],
    options?: { relationType?: UnitRelationDocType['relationType'] },
    database?: JieyuDatabase,
  ): Promise<string[]> {
    const relations = await this.listRelationsByTargetUnitIds(targetUnitIds, options, database);
    return [...new Set(relations.map((row) => row.sourceUnitId))];
  }

  static async listTimeSubdivisionChildUnitIds(
    parentUnitIds: readonly string[],
    database?: JieyuDatabase,
  ): Promise<string[]> {
    return this.listSourceUnitIdsByTargetUnitIds(
      parentUnitIds,
      { relationType: 'derived_from' },
      database,
    );
  }

  static async listResidualAwareTimeSubdivisionChildUnitIds(
    parentUnitIds: readonly string[],
    database?: JieyuDatabase,
  ): Promise<string[]> {
    const ids = [...new Set(parentUnitIds.filter((id) => id.trim().length > 0))];
    if (ids.length === 0) return [];

    const db = database ?? await getDb();
    const [canonicalChildIds, legacyRows] = await Promise.all([
      this.listTimeSubdivisionChildUnitIds(ids, db),
      db.dexie.segment_links.where('targetSegmentId').anyOf(ids).toArray(),
    ]);

    return [...new Set([
      ...canonicalChildIds,
      ...legacyRows
        .filter((row) => row.linkType === 'time_subdivision')
        .map((row) => row.sourceSegmentId),
    ])];
  }

  static async listParentUnitIdsByChildUnitIds(
    childUnitIds: readonly string[],
    options?: { relationType?: UnitRelationDocType['relationType'] },
    database?: JieyuDatabase,
  ): Promise<string[]> {
    const relations = await this.listRelationsBySourceUnitIds(childUnitIds, options, database);
    return [...new Set(relations.map((row) => row.targetUnitId))];
  }
}