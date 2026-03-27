import type {
  JieyuDatabase,
  LayerSegmentContentDocType,
  LayerSegmentDocType,
  SegmentLinkDocType,
} from '../db';
import {
  bulkDeleteLayerUnitContentsByIds,
  bulkUpsertSegmentLayerUnitContents,
  bulkUpsertSegmentLayerUnits,
  deleteSegmentLayerUnitCascade,
  upsertSegmentLinkUnitRelation,
} from './LayerUnitSegmentMirrorPrimitives';

/**
 * 迁移期 legacy mirror 收口服务 | Transitional legacy mirror consolidation service
 *
 * 在 LayerUnit 真源完全收口前，集中封装 legacy rows 与配套 LayerUnit mirror 的同步写入，
 * 避免业务服务分散手写多表双写细节。
 *
 * Before LayerUnit becomes the sole source of truth, centralize legacy row writes
 * together with their paired LayerUnit mirror sync to keep business services thin.
 */
export class LegacyMirrorService {
  static async insertSegments(db: JieyuDatabase, segments: readonly LayerSegmentDocType[]): Promise<void> {
    if (segments.length === 0) return;
    await bulkUpsertSegmentLayerUnits(db, segments);
  }

  static async upsertSegments(db: JieyuDatabase, segments: readonly LayerSegmentDocType[]): Promise<void> {
    if (segments.length === 0) return;
    await bulkUpsertSegmentLayerUnits(db, segments);
  }

  static async insertSegmentContents(db: JieyuDatabase, contents: readonly LayerSegmentContentDocType[]): Promise<void> {
    if (contents.length === 0) return;
    await bulkUpsertSegmentLayerUnitContents(db, contents);
  }

  static async upsertSegmentContents(db: JieyuDatabase, contents: readonly LayerSegmentContentDocType[]): Promise<void> {
    if (contents.length === 0) return;
    await bulkUpsertSegmentLayerUnitContents(db, contents);
  }

  static async insertSegmentLinks(db: JieyuDatabase, links: readonly SegmentLinkDocType[]): Promise<void> {
    if (links.length === 0) return;
    await Promise.all(links.map((link) => upsertSegmentLinkUnitRelation(db, link)));
  }

  static async upsertSegmentLinks(db: JieyuDatabase, links: readonly SegmentLinkDocType[]): Promise<void> {
    if (links.length === 0) return;
    await Promise.all(links.map((link) => upsertSegmentLinkUnitRelation(db, link)));
  }

  static async deleteSegmentContentsByIds(db: JieyuDatabase, contentIds: readonly string[]): Promise<void> {
    const ids = [...new Set(contentIds.filter((id) => id.trim().length > 0))];
    if (ids.length === 0) return;
    await bulkDeleteLayerUnitContentsByIds(db, ids);
  }

  static async deleteSegmentLinksByIds(db: JieyuDatabase, linkIds: readonly string[]): Promise<void> {
    const ids = [...new Set(linkIds.filter((id) => id.trim().length > 0))];
    if (ids.length === 0) return;
    await db.dexie.unit_relations.bulkDelete(ids);
  }

  static async deleteSegmentsByIds(db: JieyuDatabase, segmentIds: readonly string[]): Promise<void> {
    const ids = [...new Set(segmentIds.filter((id) => id.trim().length > 0))];
    if (ids.length === 0) return;
    await deleteSegmentLayerUnitCascade(db, ids);
  }

  static async updateSegmentPatch(
    db: JieyuDatabase,
    segmentId: string,
    changes: Partial<LayerSegmentDocType>,
  ): Promise<void> {
    await db.dexie.layer_units.update(segmentId, {
      ...(changes.textId !== undefined ? { textId: changes.textId } : {}),
      ...(changes.layerId !== undefined ? { layerId: changes.layerId } : {}),
      ...(changes.mediaId !== undefined ? { mediaId: changes.mediaId } : {}),
      ...(changes.startTime !== undefined ? { startTime: changes.startTime } : {}),
      ...(changes.endTime !== undefined ? { endTime: changes.endTime } : {}),
      ...(changes.startAnchorId !== undefined ? { startAnchorId: changes.startAnchorId } : {}),
      ...(changes.endAnchorId !== undefined ? { endAnchorId: changes.endAnchorId } : {}),
      ...(changes.ordinal !== undefined ? { orderKey: String(changes.ordinal) } : {}),
      ...(changes.speakerId !== undefined ? { speakerId: changes.speakerId } : {}),
      ...(changes.externalRef !== undefined ? { externalRef: changes.externalRef } : {}),
      ...(changes.provenance !== undefined ? { provenance: changes.provenance } : {}),
      ...(changes.updatedAt !== undefined ? { updatedAt: changes.updatedAt } : {}),
    });
  }
}