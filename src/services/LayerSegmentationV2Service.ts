import {
  getDb,
  type LayerSegmentContentDocType,
  type LayerSegmentDocType,
  type SegmentLinkDocType,
} from '../db';
import { cleanupOrphanSegments as cleanupOrphanSegmentsBridge } from './LayerSegmentationTextService';
import {
  buildClonedSegmentGraphForSplit,
  deleteLayerSegmentGraphBySegmentIds,
} from './LayerSegmentGraphService';
import { LayerUnitRelationQueryService } from './LayerUnitRelationQueryService';
import { LayerSegmentQueryService } from './LayerSegmentQueryService';
import { LegacyMirrorService } from './LegacyMirrorService';
import { enforceTimeSubdivisionParentBounds } from './LayerSegmentationTextService';
import { newId } from '../utils/transcriptionFormatters';

async function assertGenericSegmentCreateAllowed(db: Awaited<ReturnType<typeof getDb>>, segment: LayerSegmentDocType): Promise<void> {
  const layerDoc = await db.collections.layers.findOne({ selector: { id: segment.layerId } }).exec();
  const layer = layerDoc?.toJSON();
  if (!layer) return;
  if (layer.constraint === 'time_subdivision') {
    throw new Error('time_subdivision segments must be created with parent constraint');
  }
}

async function enforceParentBoundsForSegments(db: Awaited<ReturnType<typeof getDb>>, segmentIds: readonly string[]): Promise<void> {
  const ids = [...new Set(segmentIds.map((id) => id.trim()).filter((id) => id.length > 0))];
  if (ids.length === 0) return;
  const parentIds = await LayerUnitRelationQueryService.listParentUnitIdsByChildUnitIds(
    ids,
    { relationType: 'derived_from' },
    db,
  );
  if (parentIds.length === 0) return;
  const parents = await db.dexie.utterances.bulkGet(parentIds);
  for (const parent of parents) {
    if (!parent) continue;
    await enforceTimeSubdivisionParentBounds(db, parent.id, parent.startTime, parent.endTime);
  }
}

/**
 * 分层切分 v2 服务：独立边界 + 内容 + 跨层链接 | Segmentation v2 service: independent boundaries + content + cross-layer links
 */
export class LayerSegmentationV2Service {
  static async createSegment(segment: LayerSegmentDocType): Promise<void> {
    const db = await getDb();
    await assertGenericSegmentCreateAllowed(db, segment);
    await db.dexie.transaction('rw', db.dexie.layer_units, async () => {
      await LegacyMirrorService.insertSegments(db, [segment]);
    });
  }

  /**
   * 原子写入 segment 与 content，避免导入场景出现孤儿 segment | Atomically create segment and content to avoid orphan segments during import
   */
  static async createSegmentWithContentAtomic(
    segment: LayerSegmentDocType,
    content: LayerSegmentContentDocType,
  ): Promise<void> {
    const db = await getDb();
    await assertGenericSegmentCreateAllowed(db, segment);
    await db.dexie.transaction('rw', db.dexie.layer_units, db.dexie.layer_unit_contents, async () => {
      await LegacyMirrorService.insertSegments(db, [segment]);
      await LegacyMirrorService.insertSegmentContents(db, [content]);
    });
  }

  /**
   * 带父约束创建 segment（time_subdivision 专用）| Create segment with parent constraint (for time_subdivision)
   * 自动裁剪至父 utterance 范围 + 写入 segment_link | Auto-clips to parent utterance range + writes segment_link
   */
  static async createSegmentWithParentConstraint(
    segment: LayerSegmentDocType,
    parentUtteranceId: string,
    parentStart: number,
    parentEnd: number,
  ): Promise<LayerSegmentDocType> {
    const clipped: LayerSegmentDocType = {
      ...segment,
      utteranceId: parentUtteranceId,
      startTime: Number(Math.max(segment.startTime, parentStart).toFixed(3)),
      endTime: Number(Math.min(segment.endTime, parentEnd).toFixed(3)),
    };
    if (clipped.endTime - clipped.startTime < 0.05) {
      throw new Error('Segment too short after clipping to parent utterance range');
    }
    const db = await getDb();
    const now = new Date().toISOString();
    await db.dexie.transaction('rw', db.dexie.layer_units, db.dexie.unit_relations, async () => {
      await LegacyMirrorService.insertSegments(db, [clipped]);
      const link = {
        id: newId('sl'),
        textId: clipped.textId,
        sourceSegmentId: clipped.id,
        targetSegmentId: parentUtteranceId,
        linkType: 'time_subdivision',
        createdAt: now,
        updatedAt: now,
      } as SegmentLinkDocType;
      await LegacyMirrorService.insertSegmentLinks(db, [link]);
    });
    return clipped;
  }

  static async updateSegment(id: string, changes: Partial<LayerSegmentDocType>): Promise<void> {
    const db = await getDb();
    const existing = (await LayerSegmentQueryService.listSegmentsByIds([id]))[0];

    await db.dexie.transaction('rw', db.dexie.layer_units, async () => {
      if (existing) {
        const nextRow: LayerSegmentDocType = {
          ...existing,
          ...changes,
          id: existing.id,
        };
        await LegacyMirrorService.upsertSegments(db, [nextRow]);
        return;
      }

      await LegacyMirrorService.updateSegmentPatch(db, id, changes);
    });
  }

  static async listSegmentsByLayerMedia(layerId: string, mediaId: string): Promise<LayerSegmentDocType[]> {
    return LayerSegmentQueryService.listSegmentsByLayerMedia(layerId, mediaId);
  }

  static async upsertSegmentContent(content: LayerSegmentContentDocType): Promise<void> {
    const db = await getDb();
    await db.dexie.transaction('rw', db.dexie.layer_unit_contents, async () => {
      await LegacyMirrorService.insertSegmentContents(db, [content]);
    });
  }

  static async deleteSegmentContent(contentId: string): Promise<void> {
    const db = await getDb();
    await db.dexie.transaction('rw', db.dexie.layer_unit_contents, async () => {
      await LegacyMirrorService.deleteSegmentContentsByIds(db, [contentId]);
    });
  }

  static async listSegmentContents(segmentId: string): Promise<LayerSegmentContentDocType[]> {
    return LayerSegmentQueryService.listSegmentContentsBySegmentIds([segmentId]);
  }

  static async createSegmentLink(link: SegmentLinkDocType): Promise<void> {
    const db = await getDb();
    await db.dexie.transaction('rw', db.dexie.unit_relations, async () => {
      await LegacyMirrorService.insertSegmentLinks(db, [link]);
    });
  }

  static async deleteSegment(segmentId: string): Promise<void> {
    const db = await getDb();

    await db.dexie.transaction(
      'rw',
      [
        db.dexie.layer_units,
        db.dexie.layer_unit_contents,
        db.dexie.unit_relations,
      ],
      async () => {
        await deleteLayerSegmentGraphBySegmentIds(db, [segmentId]);
      },
    );
  }

  /**
   * 批量删除 segment（原子）| Batch delete segments (atomic)
   */
  static async deleteSegmentsBatch(segmentIds: readonly string[]): Promise<void> {
    const ids = [...new Set(segmentIds.map((id) => id.trim()).filter((id) => id.length > 0))];
    if (ids.length === 0) return;

    const db = await getDb();
    await db.dexie.transaction(
      'rw',
      [
        db.dexie.layer_units,
        db.dexie.layer_unit_contents,
        db.dexie.unit_relations,
      ],
      async () => {
        await deleteLayerSegmentGraphBySegmentIds(db, ids);
      },
    );
  }

  static async cleanupOrphanSegments(candidateSegmentIds?: Iterable<string>): Promise<string[]> {
    const db = await getDb();
    return cleanupOrphanSegmentsBridge(db, candidateSegmentIds);
  }

  /**
   * 拆分 segment：在 splitTime 处将一条 segment 拆分为两条 | Split a segment at splitTime into two segments
   */
  static async splitSegment(segmentId: string, splitTime: number): Promise<{ first: LayerSegmentDocType; second: LayerSegmentDocType }> {
    const db = await getDb();
    const existing = (await LayerSegmentQueryService.listSegmentsByIds([segmentId]))[0];
    if (!existing) throw new Error(`Segment ${segmentId} not found`);

    const minSpan = 0.05;
    const splitFixed = Number(splitTime.toFixed(3));
    if (splitFixed - existing.startTime < minSpan || existing.endTime - splitFixed < minSpan) {
      throw new Error('Split point too close to segment boundary');
    }

    const now = new Date().toISOString();
    const first: LayerSegmentDocType = {
      ...existing,
      endTime: splitFixed,
      updatedAt: now,
    };
    const second: LayerSegmentDocType = {
      ...existing,
      id: newId('seg'),
      textId: existing.textId,
      startTime: splitFixed,
      createdAt: now,
      updatedAt: now,
    };

    const { clonedContents, clonedLinks } = await buildClonedSegmentGraphForSplit(
      db,
      segmentId,
      second.id,
      now,
    );

    await db.dexie.transaction(
      'rw',
      [
        db.dexie.layer_units,
        db.dexie.layer_unit_contents,
        db.dexie.unit_relations,
      ],
      async () => {
        await LegacyMirrorService.upsertSegments(db, [first]);
        await LegacyMirrorService.insertSegments(db, [second]);
        if (clonedContents.length > 0) {
          await LegacyMirrorService.upsertSegmentContents(db, clonedContents);
        }
        if (clonedLinks.length > 0) {
          await LegacyMirrorService.insertSegmentLinks(db, clonedLinks);
        }
      },
    );

    await enforceParentBoundsForSegments(db, [first.id, second.id]);

    const [firstNext, secondNext] = await LayerSegmentQueryService.listSegmentsByIds([first.id, second.id]);

    return {
      first: firstNext ?? first,
      second: secondNext ?? second,
    };
  }

  /**
   * 合并相邻 segment：保留 keepId 的起止较早一端，删除 removeId | Merge two adjacent segments: keep one, remove the other
   */
  static async mergeAdjacentSegments(keepId: string, removeId: string): Promise<LayerSegmentDocType> {
    const db = await getDb();
    const segments = await LayerSegmentQueryService.listSegmentsByIds([keepId, removeId]);
    const segmentById = new Map(segments.map((segment) => [segment.id, segment] as const));
    const keep = segmentById.get(keepId);
    const remove = segmentById.get(removeId);
    if (!keep || !remove) throw new Error('Segment(s) not found for merge');
    if (keep.layerId !== remove.layerId || keep.mediaId !== remove.mediaId) {
      throw new Error('Segments must be in the same layer and media to merge');
    }

    const siblings = await LayerSegmentQueryService.listSegmentsByLayerMedia(keep.layerId, keep.mediaId);
    siblings.sort((a, b) => a.startTime - b.startTime);
    const keepIndex = siblings.findIndex((item) => item.id === keepId);
    const removeIndex = siblings.findIndex((item) => item.id === removeId);
    if (keepIndex < 0 || removeIndex < 0) {
      throw new Error('Segment(s) not found in layer timeline');
    }
    if (Math.abs(keepIndex - removeIndex) !== 1) {
      throw new Error('Only adjacent segments can be merged');
    }

    // const left = keep.startTime <= remove.startTime ? keep : remove;
    // const right = left.id === keep.id ? remove : keep;

    const now = new Date().toISOString();
    const mergedStart = Math.min(keep.startTime, remove.startTime);
    const mergedEnd = Math.max(keep.endTime, remove.endTime);
    const mergedKeep: LayerSegmentDocType = {
      ...keep,
      startTime: mergedStart,
      endTime: mergedEnd,
      updatedAt: now,
    };

    // 原子事务：更新保留段 + 级联删除移除段 | Atomic transaction: update kept + cascade-delete removed
    await db.dexie.transaction(
      'rw',
      [
        db.dexie.layer_units,
        db.dexie.layer_unit_contents,
        db.dexie.unit_relations,
      ],
      async () => {
        await LegacyMirrorService.upsertSegments(db, [mergedKeep]);
        await deleteLayerSegmentGraphBySegmentIds(db, [removeId]);
      },
    );

    await enforceParentBoundsForSegments(db, [mergedKeep.id]);

    const mergedNext = (await LayerSegmentQueryService.listSegmentsByIds([mergedKeep.id]))[0];

    return mergedNext ?? mergedKeep;
  }
}
