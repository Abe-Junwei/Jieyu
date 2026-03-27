import {
  getDb,
  type LayerSegmentContentDocType,
  type LayerSegmentDocType,
  type SegmentLinkDocType,
} from '../db';
import { cleanupOrphanSegments as cleanupOrphanSegmentsBridge } from './LayerSegmentationV2BridgeService';
import { newId } from '../utils/transcriptionFormatters';

/**
 * 分层切分 v2 服务：独立边界 + 内容 + 跨层链接 | Segmentation v2 service: independent boundaries + content + cross-layer links
 */
export class LayerSegmentationV2Service {
  static async createSegment(segment: LayerSegmentDocType): Promise<void> {
    const db = await getDb();
    await db.collections.layer_segments.insert(segment);
  }

  /**
   * 原子写入 segment 与 content，避免导入场景出现孤儿 segment | Atomically create segment and content to avoid orphan segments during import
   */
  static async createSegmentWithContentAtomic(
    segment: LayerSegmentDocType,
    content: LayerSegmentContentDocType,
  ): Promise<void> {
    const db = await getDb();
    await db.dexie.transaction('rw', db.dexie.layer_segments, db.dexie.layer_segment_contents, async () => {
      await db.collections.layer_segments.insert(segment);
      await db.collections.layer_segment_contents.insert(content);
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
      startTime: Number(Math.max(segment.startTime, parentStart).toFixed(3)),
      endTime: Number(Math.min(segment.endTime, parentEnd).toFixed(3)),
    };
    if (clipped.endTime - clipped.startTime < 0.05) {
      throw new Error('Segment too short after clipping to parent utterance range');
    }
    const db = await getDb();
    const now = new Date().toISOString();
    await db.dexie.transaction('rw', db.dexie.layer_segments, db.dexie.segment_links, async () => {
      await db.collections.layer_segments.insert(clipped);
      await db.collections.segment_links.insert({
        id: newId('sl'),
        textId: clipped.textId,
        sourceSegmentId: clipped.id,
        targetSegmentId: parentUtteranceId,
        linkType: 'time_subdivision',
        createdAt: now,
        updatedAt: now,
      } as SegmentLinkDocType);
    });
    return clipped;
  }

  static async updateSegment(id: string, changes: Partial<LayerSegmentDocType>): Promise<void> {
    const db = await getDb();
    await db.collections.layer_segments.update(id, changes);
  }

  static async listSegmentsByLayerMedia(layerId: string, mediaId: string): Promise<LayerSegmentDocType[]> {
    const db = await getDb();
    return db.dexie.layer_segments.where('[layerId+mediaId]').equals([layerId, mediaId]).toArray();
  }

  static async upsertSegmentContent(content: LayerSegmentContentDocType): Promise<void> {
    const db = await getDb();
    await db.collections.layer_segment_contents.insert(content);
  }

  static async listSegmentContents(segmentId: string): Promise<LayerSegmentContentDocType[]> {
    const db = await getDb();
    const docs = await db.collections.layer_segment_contents.findByIndex('segmentId', segmentId);
    return docs.map((row) => row.toJSON());
  }

  static async createSegmentLink(link: SegmentLinkDocType): Promise<void> {
    const db = await getDb();
    await db.collections.segment_links.insert(link);
  }

  static async deleteSegment(segmentId: string): Promise<void> {
    const db = await getDb();

    await db.dexie.transaction(
      'rw',
      db.dexie.layer_segments,
      db.dexie.layer_segment_contents,
      db.dexie.segment_links,
      async () => {
        const contentIds = (await db.dexie.layer_segment_contents
          .where('segmentId')
          .equals(segmentId)
          .primaryKeys()) as string[];

        if (contentIds.length > 0) {
          await db.dexie.layer_segment_contents.bulkDelete(contentIds);
        }

        const sourceLinkIds = (await db.dexie.segment_links
          .where('sourceSegmentId')
          .equals(segmentId)
          .primaryKeys()) as string[];

        const targetLinkIds = (await db.dexie.segment_links
          .where('targetSegmentId')
          .equals(segmentId)
          .primaryKeys()) as string[];

        const linkIds = [...new Set([...sourceLinkIds, ...targetLinkIds])];
        if (linkIds.length > 0) {
          await db.dexie.segment_links.bulkDelete(linkIds);
        }

        await db.collections.layer_segments.remove(segmentId);
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
    const existing = await db.dexie.layer_segments.get(segmentId);
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

    const existingContents = await db.dexie.layer_segment_contents.where('segmentId').equals(segmentId).toArray();
    const clonedContents: LayerSegmentContentDocType[] = existingContents.map((content) => ({
      ...content,
      id: newId('stx'),
      segmentId: second.id,
      createdAt: now,
      updatedAt: now,
    }));

    // 克隆 source 方向的 segment_links（如 time_subdivision 父链接）| Clone source-side segment_links (e.g. time_subdivision parent link)
    const existingLinks = await db.dexie.segment_links.where('sourceSegmentId').equals(segmentId).toArray();
    const clonedLinks: SegmentLinkDocType[] = existingLinks.map((link) => ({
      ...link,
      id: newId('sl'),
      sourceSegmentId: second.id,
      createdAt: now,
      updatedAt: now,
    }));

    await db.dexie.transaction(
      'rw',
      db.dexie.layer_segments,
      db.dexie.layer_segment_contents,
      db.dexie.segment_links,
      async () => {
        await db.collections.layer_segments.update(segmentId, { endTime: splitFixed, updatedAt: now });
        await db.collections.layer_segments.insert(second);
        if (clonedContents.length > 0) {
          await db.dexie.layer_segment_contents.bulkPut(clonedContents);
        }
        if (clonedLinks.length > 0) {
          for (const link of clonedLinks) {
            await db.collections.segment_links.insert(link);
          }
        }
      },
    );

    return { first, second };
  }

  /**
   * 合并相邻 segment：保留 keepId 的起止较早一端，删除 removeId | Merge two adjacent segments: keep one, remove the other
   */
  static async mergeAdjacentSegments(keepId: string, removeId: string): Promise<LayerSegmentDocType> {
    const db = await getDb();
    const keep = await db.dexie.layer_segments.get(keepId);
    const remove = await db.dexie.layer_segments.get(removeId);
    if (!keep || !remove) throw new Error('Segment(s) not found for merge');
    if (keep.layerId !== remove.layerId || keep.mediaId !== remove.mediaId) {
      throw new Error('Segments must be in the same layer and media to merge');
    }

    const siblings = await db.dexie.layer_segments
      .where('[layerId+mediaId]')
      .equals([keep.layerId, keep.mediaId])
      .toArray();
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

    // 原子事务：更新保留段 + 级联删除移除段 | Atomic transaction: update kept + cascade-delete removed
    await db.dexie.transaction(
      'rw',
      db.dexie.layer_segments,
      db.dexie.layer_segment_contents,
      db.dexie.segment_links,
      async () => {
        await db.collections.layer_segments.update(keepId, {
          startTime: mergedStart,
          endTime: mergedEnd,
          updatedAt: now,
        });

        // 内联删除（避免嵌套事务）| Inline delete (avoids nested transaction)
        const contentIds = (await db.dexie.layer_segment_contents
          .where('segmentId')
          .equals(removeId)
          .primaryKeys()) as string[];
        if (contentIds.length > 0) {
          await db.dexie.layer_segment_contents.bulkDelete(contentIds);
        }
        const sourceLinkIds = (await db.dexie.segment_links
          .where('sourceSegmentId')
          .equals(removeId)
          .primaryKeys()) as string[];
        const targetLinkIds = (await db.dexie.segment_links
          .where('targetSegmentId')
          .equals(removeId)
          .primaryKeys()) as string[];
        const linkIds = [...new Set([...sourceLinkIds, ...targetLinkIds])];
        if (linkIds.length > 0) {
          await db.dexie.segment_links.bulkDelete(linkIds);
        }
        await db.collections.layer_segments.remove(removeId);
      },
    );

    return { ...keep, startTime: mergedStart, endTime: mergedEnd, updatedAt: now };
  }
}
