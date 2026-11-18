import { getDb } from './engine';
import { withTransaction } from './withTransaction';
import {
  dexieStoresForLayerSegmentGraphRw,
  dexieStoresForLayerUnitsAndContentsRw,
  dexieStoresForLayerUnitsAndUnitRelationsRw,
  dexieStoresForLayerUnitsRw,
} from './dexieTranscriptionGraphStores';
import type {
  LayerSegmentViewDocType,
  LayerUnitContentDocType,
  LayerUnitDocType,
  UnitRelationDocType,
} from './types';
import { cleanupOrphanSegments as cleanupOrphanSegmentsBridge } from './storagePortServiceLayerSegmentationText';
import {
  bulkGetLayerUnits,
  buildClonedSegmentGraphForSplit,
  deleteLayerSegmentGraphBySegmentIds,
} from './storagePortServiceLayerSegmentGraph';
import { LayerUnitRelationQueryService } from './storagePortServiceLayerUnitRelationQuery';
import { LayerSegmentQueryService } from './storagePortServiceLayerSegmentQuery';
import { LayerUnitSegmentWriteService } from '../services/LayerUnitSegmentWriteService';
import { enforceTimeSubdivisionParentBounds } from './storagePortServiceLayerSegmentationText';
import { newId } from '../utils/transcriptionFormatters';

async function assertGenericSegmentCreateAllowed(
  db: Awaited<ReturnType<typeof getDb>>,
  segment: LayerUnitDocType,
): Promise<void> {
  const layerId = segment.layerId?.trim();
  if (!layerId) return;
  const layerDoc = await db.collections.layers.findOne({ selector: { id: layerId } }).exec();
  const layer = layerDoc?.toJSON();
  if (!layer) return;
  if (layer.constraint === 'time_subdivision') {
    throw new Error('time_subdivision segments must be created with parent constraint');
  }
}

function normalizeSegmentChainIds(
  keepId: string,
  removeIds: readonly string[],
): { keepId: string; removeIds: string[] } {
  const keep = keepId.trim();
  const removes: string[] = [];
  const seen = new Set<string>();
  for (const rawId of removeIds) {
    const id = rawId.trim();
    if (id.length === 0 || id === keep || seen.has(id)) continue;
    seen.add(id);
    removes.push(id);
  }
  return { keepId: keep, removeIds: removes };
}

function compareTimelineSiblings(left: LayerUnitDocType, right: LayerUnitDocType): number {
  if (left.startTime !== right.startTime) return left.startTime - right.startTime;
  if (left.endTime !== right.endTime) return left.endTime - right.endTime;
  return left.id.localeCompare(right.id);
}

/**
 * 连续选区的最终保留段。与逐对 mergeAdjacentSegments 一样只扩大时间范围，不拼接正文。
 * Final kept row for a contiguous selection. Like pairwise merge, this only widens time and does not join text.
 */
function planAdjacentSegmentChain(
  keepId: string,
  removeIds: readonly string[],
  members: readonly LayerUnitDocType[],
  siblings: readonly LayerUnitDocType[],
): LayerUnitDocType {
  const segmentById = new Map(
    members.filter((row) => row.unitType === 'segment').map((row) => [row.id, row] as const),
  );
  const keep = segmentById.get(keepId);
  const removeRows = removeIds.map((id) => segmentById.get(id));
  if (!keep || removeRows.some((row) => row === undefined)) {
    throw new Error('Segment(s) not found for merge');
  }
  const removes = removeRows as LayerUnitDocType[];
  const keepLayerId = keep.layerId?.trim();
  const keepMediaId = keep.mediaId?.trim();
  if (
    !keepLayerId ||
    !keepMediaId ||
    removes.some((row) => keepLayerId !== row.layerId || keepMediaId !== row.mediaId)
  ) {
    throw new Error('Segments must be in the same layer and media to merge');
  }

  const ordered = siblings
    .filter((row) => row.unitType === 'segment')
    .sort(compareTimelineSiblings);
  const indexById = new Map(ordered.map((row, index) => [row.id, index] as const));
  const indexes = [keepId, ...removeIds].map((id) => indexById.get(id) ?? -1);
  if (indexes.some((index) => index < 0)) {
    throw new Error('Segment(s) not found in layer timeline');
  }
  const minIndex = Math.min(...indexes);
  const maxIndex = Math.max(...indexes);
  if (maxIndex - minIndex + 1 !== indexes.length) {
    throw new Error('Only adjacent segments can be merged');
  }

  return {
    ...keep,
    startTime: Math.min(keep.startTime, ...removes.map((row) => row.startTime)),
    endTime: Math.max(keep.endTime, ...removes.map((row) => row.endTime)),
    updatedAt: new Date().toISOString(),
  };
}

async function enforceParentBoundsForSegments(
  db: Awaited<ReturnType<typeof getDb>>,
  segmentIds: readonly string[],
): Promise<void> {
  const ids = [...new Set(segmentIds.map((id) => id.trim()).filter((id) => id.length > 0))];
  if (ids.length === 0) return;
  const parentIds = await LayerUnitRelationQueryService.listParentUnitIdsByChildUnitIds(
    ids,
    { relationType: 'derived_from' },
    db,
  );
  if (parentIds.length === 0) return;
  const parents = await bulkGetLayerUnits(db, parentIds);
  for (const parent of parents) {
    if (!parent || parent.unitType !== 'unit') continue;
    await enforceTimeSubdivisionParentBounds(db, parent.id, parent.startTime, parent.endTime);
  }
}

/**
 * 分层切分 v2 服务：独立边界 + 内容 + 跨层链接 | Segmentation v2 service: independent boundaries + content + cross-layer links
 */
export class LayerSegmentationV2Service {
  static async createSegment(segment: LayerUnitDocType): Promise<void> {
    const db = await getDb();
    await assertGenericSegmentCreateAllowed(db, segment);
    await withTransaction(db, 'rw', [...dexieStoresForLayerUnitsRw(db)], async () => {
      await LayerUnitSegmentWriteService.insertSegments(db, [segment]);
    });
  }

  /**
   * 原子写入 segment 与 content，避免导入场景出现孤儿 segment | Atomically create segment and content to avoid orphan segments during import
   */
  static async createSegmentWithContentAtomic(
    segment: LayerUnitDocType,
    content: LayerUnitContentDocType,
  ): Promise<void> {
    const db = await getDb();
    await assertGenericSegmentCreateAllowed(db, segment);
    await withTransaction(db, 'rw', [...dexieStoresForLayerUnitsAndContentsRw(db)], async () => {
      await LayerUnitSegmentWriteService.insertSegments(db, [segment]);
      await LayerUnitSegmentWriteService.insertSegmentContents(db, [content]);
    });
  }

  /**
   * 带父约束创建 segment（time_subdivision 专用）| Create segment with parent constraint (for time_subdivision)
   * 自动裁剪至父 unit 范围 + 写入 segment_link | Auto-clips to parent unit range + writes segment_link
   */
  static async createSegmentWithParentConstraint(
    segment: LayerUnitDocType,
    parentUnitId: string,
    parentStart: number,
    parentEnd: number,
  ): Promise<LayerSegmentViewDocType> {
    const clipped: LayerSegmentViewDocType = {
      ...segment,
      parentUnitId: parentUnitId,
      unitId: parentUnitId,
      startTime: Number(Math.max(segment.startTime, parentStart).toFixed(3)),
      endTime: Number(Math.min(segment.endTime, parentEnd).toFixed(3)),
    };
    if (clipped.endTime - clipped.startTime < 0.05) {
      throw new Error('Segment too short after clipping to parent unit range');
    }
    const db = await getDb();
    const now = new Date().toISOString();
    await withTransaction(
      db,
      'rw',
      [...dexieStoresForLayerUnitsAndUnitRelationsRw(db)],
      async () => {
        await LayerUnitSegmentWriteService.insertSegments(db, [clipped]);
        const link = {
          id: newId('sl'),
          textId: clipped.textId,
          sourceUnitId: clipped.id,
          targetUnitId: parentUnitId,
          relationType: 'derived_from',
          createdAt: now,
          updatedAt: now,
        } as UnitRelationDocType;
        await LayerUnitSegmentWriteService.insertSegmentLinks(db, [link]);
      },
    );
    return clipped;
  }

  static async updateSegment(id: string, changes: Partial<LayerUnitDocType>): Promise<void> {
    const db = await getDb();
    const existing = (await LayerSegmentQueryService.listSegmentsByIds([id]))[0];

    await withTransaction(db, 'rw', [...dexieStoresForLayerUnitsRw(db)], async () => {
      if (existing) {
        const nextRow: LayerUnitDocType = {
          ...existing,
          ...changes,
          id: existing.id,
        };
        await LayerUnitSegmentWriteService.upsertSegments(db, [nextRow]);
        return;
      }

      await LayerUnitSegmentWriteService.updateSegmentPatch(db, id, changes);
    });
  }

  static async listSegmentsByLayerMedia(
    layerId: string,
    mediaId: string,
  ): Promise<LayerUnitDocType[]> {
    return LayerSegmentQueryService.listSegmentsByLayerMedia(layerId, mediaId);
  }

  static async upsertSegmentContent(content: LayerUnitContentDocType): Promise<void> {
    const db = await getDb();
    await withTransaction(db, 'rw', [...dexieStoresForLayerSegmentGraphRw(db)], async () => {
      await LayerUnitSegmentWriteService.insertSegmentContents(db, [content]);
    });
  }

  static async deleteSegmentContent(contentId: string): Promise<void> {
    const db = await getDb();
    await withTransaction(db, 'rw', [...dexieStoresForLayerSegmentGraphRw(db)], async () => {
      await LayerUnitSegmentWriteService.deleteSegmentContentsByIds(db, [contentId]);
    });
  }

  static async listSegmentContents(segmentId: string): Promise<LayerUnitContentDocType[]> {
    return LayerSegmentQueryService.listSegmentContentsBySegmentIds([segmentId]);
  }

  static async createSegmentLink(link: UnitRelationDocType): Promise<void> {
    const db = await getDb();
    await withTransaction(db, 'rw', [...dexieStoresForLayerSegmentGraphRw(db)], async () => {
      await LayerUnitSegmentWriteService.insertSegmentLinks(db, [link]);
    });
  }

  static async deleteSegment(segmentId: string): Promise<void> {
    const db = await getDb();

    await withTransaction(db, 'rw', [...dexieStoresForLayerSegmentGraphRw(db)], async () => {
      await deleteLayerSegmentGraphBySegmentIds(db, [segmentId]);
    });
  }

  /**
   * 批量删除 segment（原子）| Batch delete segments (atomic)
   */
  static async deleteSegmentsBatch(segmentIds: readonly string[]): Promise<void> {
    const ids = [...new Set(segmentIds.map((id) => id.trim()).filter((id) => id.length > 0))];
    if (ids.length === 0) return;

    const db = await getDb();
    await withTransaction(db, 'rw', [...dexieStoresForLayerSegmentGraphRw(db)], async () => {
      await deleteLayerSegmentGraphBySegmentIds(db, ids);
    });
  }

  static async cleanupOrphanSegments(candidateSegmentIds?: Iterable<string>): Promise<string[]> {
    const db = await getDb();
    return cleanupOrphanSegmentsBridge(db, candidateSegmentIds);
  }

  /**
   * 拆分 segment：在 splitTime 处将一条 segment 拆分为两条 | Split a segment at splitTime into two segments
   */
  static async splitSegment(
    segmentId: string,
    splitTime: number,
  ): Promise<{ first: LayerUnitDocType; second: LayerUnitDocType }> {
    const db = await getDb();
    const existing = (await LayerSegmentQueryService.listSegmentsByIds([segmentId]))[0];
    if (!existing) throw new Error(`Segment ${segmentId} not found`);

    const minSpan = 0.05;
    const splitFixed = Number(splitTime.toFixed(3));
    if (splitFixed - existing.startTime < minSpan || existing.endTime - splitFixed < minSpan) {
      throw new Error('Split point too close to segment boundary');
    }

    const now = new Date().toISOString();
    const first: LayerUnitDocType = {
      ...existing,
      endTime: splitFixed,
      updatedAt: now,
    };
    const second: LayerUnitDocType = {
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

    await withTransaction(db, 'rw', [...dexieStoresForLayerSegmentGraphRw(db)], async () => {
      await LayerUnitSegmentWriteService.upsertSegments(db, [first]);
      await LayerUnitSegmentWriteService.insertSegments(db, [second]);
      if (clonedContents.length > 0) {
        await LayerUnitSegmentWriteService.upsertSegmentContents(db, clonedContents);
      }
      if (clonedLinks.length > 0) {
        await LayerUnitSegmentWriteService.insertSegmentLinks(db, clonedLinks);
      }
    });

    await enforceParentBoundsForSegments(db, [first.id, second.id]);

    const [firstNext, secondNext] = await LayerSegmentQueryService.listSegmentsByIds([
      first.id,
      second.id,
    ]);

    return {
      first: firstNext ?? first,
      second: secondNext ?? second,
    };
  }

  /**
   * 合并相邻 segment：保留 keepId 的起止较早一端，删除 removeId | Merge two adjacent segments: keep one, remove the other
   */
  static async mergeAdjacentSegments(keepId: string, removeId: string): Promise<LayerUnitDocType> {
    const db = await getDb();
    const segments = await LayerSegmentQueryService.listSegmentsByIds([keepId, removeId]);
    const segmentById = new Map(segments.map((segment) => [segment.id, segment] as const));
    const keep = segmentById.get(keepId);
    const remove = segmentById.get(removeId);
    if (!keep || !remove) throw new Error('Segment(s) not found for merge');
    const keepLayerId = keep.layerId?.trim();
    const keepMediaId = keep.mediaId?.trim();
    if (
      !keepLayerId ||
      !keepMediaId ||
      keepLayerId !== remove.layerId ||
      keepMediaId !== remove.mediaId
    ) {
      throw new Error('Segments must be in the same layer and media to merge');
    }

    const siblings = await LayerSegmentQueryService.listSegmentsByLayerMedia(
      keepLayerId,
      keepMediaId,
    );
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
    const mergedKeep: LayerUnitDocType = {
      ...keep,
      startTime: mergedStart,
      endTime: mergedEnd,
      updatedAt: now,
    };

    // 原子事务：更新保留段 + 级联删除移除段 | Atomic transaction: update kept + cascade-delete removed
    await withTransaction(db, 'rw', [...dexieStoresForLayerSegmentGraphRw(db)], async () => {
      await LayerUnitSegmentWriteService.upsertSegments(db, [mergedKeep]);
      await deleteLayerSegmentGraphBySegmentIds(db, [removeId]);
    });

    await enforceParentBoundsForSegments(db, [mergedKeep.id]);

    const mergedNext = (await LayerSegmentQueryService.listSegmentsByIds([mergedKeep.id]))[0];

    return mergedNext ?? mergedKeep;
  }

  /**
   * 一次事务合并连续选区：保留 keepId，级联删除其余段。失败则整单回滚。
   * Merge a contiguous selection in one transaction. Failure rolls the whole write back.
   */
  static async mergeAdjacentSegmentChain(
    keepId: string,
    removeIds: readonly string[],
  ): Promise<LayerUnitDocType> {
    const chain = normalizeSegmentChainIds(keepId, removeIds);
    if (chain.keepId.length === 0 || chain.removeIds.length === 0) {
      throw new Error('Segment(s) not found for merge');
    }

    const db = await getDb();
    const mergedKeep = await withTransaction(
      db,
      'rw',
      [...dexieStoresForLayerSegmentGraphRw(db)],
      async () => {
        const memberRows = await db.dexie.layer_units.bulkGet([chain.keepId, ...chain.removeIds]);
        const members = memberRows.filter((row): row is LayerUnitDocType => Boolean(row));
        const keep = members.find((row) => row.id === chain.keepId && row.unitType === 'segment');
        const layerId = keep?.layerId?.trim();
        const mediaId = keep?.mediaId?.trim();
        const siblingRows =
          layerId && mediaId
            ? await db.dexie.layer_units
                .where('[layerId+mediaId]')
                .equals([layerId, mediaId])
                .toArray()
            : [];
        const planned = planAdjacentSegmentChain(
          chain.keepId,
          chain.removeIds,
          members,
          siblingRows,
        );
        await LayerUnitSegmentWriteService.upsertSegments(db, [planned]);
        const [contentIds, sourceRelationIds, targetRelationIds] = await Promise.all([
          db.dexie.layer_unit_contents
            .where('unitId')
            .anyOf(chain.removeIds)
            .primaryKeys() as Promise<string[]>,
          db.dexie.unit_relations
            .where('sourceUnitId')
            .anyOf(chain.removeIds)
            .primaryKeys() as Promise<string[]>,
          db.dexie.unit_relations
            .where('targetUnitId')
            .anyOf(chain.removeIds)
            .primaryKeys() as Promise<string[]>,
        ]);
        const relationIds = [...new Set([...sourceRelationIds, ...targetRelationIds])];
        if (contentIds.length > 0) {
          await db.dexie.layer_unit_contents.bulkDelete(contentIds);
        }
        if (relationIds.length > 0) {
          await db.dexie.unit_relations.bulkDelete(relationIds);
        }
        await db.dexie.layer_units.bulkDelete(chain.removeIds);
        return planned;
      },
    );

    await enforceParentBoundsForSegments(db, [mergedKeep.id]);

    const mergedNext = (await LayerSegmentQueryService.listSegmentsByIds([mergedKeep.id]))[0];
    return mergedNext ?? mergedKeep;
  }
}
