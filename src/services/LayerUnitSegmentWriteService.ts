import type { JieyuDatabase, LayerUnitContentDocType, LayerUnitDocType, UnitRelationDocType } from '../db';
import { bulkDeleteLayerUnitContentsByIds, bulkUpsertLayerUnitContents, bulkUpsertLayerUnits, bulkUpsertUnitRelations, deleteSegmentLayerUnitCascade } from './LayerUnitSegmentWritePrimitives';

/**
 * Canonical persistence for timeline units (Dexie v31+).
 *
 * All writes land in `layer_units`, `layer_unit_contents`, and `unit_relations`.
 */
export class LayerUnitSegmentWriteService {
  static async insertSegments(db: JieyuDatabase, segments: readonly LayerUnitDocType[]): Promise<void> {
    if (segments.length === 0) return;
    await bulkUpsertLayerUnits(db, segments.map((segment) => ({
      ...segment,
      unitType: 'segment',
    })));
  }

  static async upsertSegments(db: JieyuDatabase, segments: readonly LayerUnitDocType[]): Promise<void> {
    if (segments.length === 0) return;
    await bulkUpsertLayerUnits(db, segments.map((segment) => ({
      ...segment,
      unitType: 'segment',
    })));
  }

  static async insertSegmentContents(db: JieyuDatabase, contents: readonly LayerUnitContentDocType[]): Promise<void> {
    if (contents.length === 0) return;
    await bulkUpsertLayerUnitContents(db, contents);
  }

  static async upsertSegmentContents(db: JieyuDatabase, contents: readonly LayerUnitContentDocType[]): Promise<void> {
    if (contents.length === 0) return;
    await bulkUpsertLayerUnitContents(db, contents);
  }

  static async insertSegmentLinks(db: JieyuDatabase, links: readonly UnitRelationDocType[]): Promise<void> {
    if (links.length === 0) return;
    await bulkUpsertUnitRelations(db, links);
  }

  static async upsertSegmentLinks(db: JieyuDatabase, links: readonly UnitRelationDocType[]): Promise<void> {
    if (links.length === 0) return;
    await bulkUpsertUnitRelations(db, links);
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
    changes: Partial<LayerUnitDocType>,
  ): Promise<void> {
    await db.dexie.layer_units.update(segmentId, {
      unitType: 'segment',
      ...(changes.textId !== undefined ? { textId: changes.textId } : {}),
      ...(changes.layerId !== undefined ? { layerId: changes.layerId } : {}),
      ...(changes.mediaId !== undefined ? { mediaId: changes.mediaId } : {}),
      ...(changes.parentUnitId !== undefined ? { parentUnitId: changes.parentUnitId } : {}),
      ...(changes.startTime !== undefined ? { startTime: changes.startTime } : {}),
      ...(changes.endTime !== undefined ? { endTime: changes.endTime } : {}),
      ...(changes.startAnchorId !== undefined ? { startAnchorId: changes.startAnchorId } : {}),
      ...(changes.endAnchorId !== undefined ? { endAnchorId: changes.endAnchorId } : {}),
      ...(changes.orderKey !== undefined ? { orderKey: changes.orderKey } : {}),
      ...(changes.speakerId !== undefined ? { speakerId: changes.speakerId } : {}),
      ...(changes.selfCertainty !== undefined ? { selfCertainty: changes.selfCertainty } : {}),
      ...(changes.status !== undefined ? { status: changes.status } : {}),
      ...(changes.externalRef !== undefined ? { externalRef: changes.externalRef } : {}),
      ...(changes.provenance !== undefined ? { provenance: changes.provenance } : {}),
      ...(changes.updatedAt !== undefined ? { updatedAt: changes.updatedAt } : {}),
    });
  }
}
