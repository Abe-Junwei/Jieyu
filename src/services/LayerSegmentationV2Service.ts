import { featureFlags } from '../ai/config/featureFlags';
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
  private static ensureEnabled(): void {
    if (!featureFlags.segmentBoundaryV2Enabled) {
      throw new Error('segmentBoundaryV2Enabled is disabled');
    }
  }

  static async createSegment(segment: LayerSegmentDocType): Promise<void> {
    this.ensureEnabled();
    const db = await getDb();
    await db.collections.layer_segments.insert(segment);
  }

  static async updateSegment(id: string, changes: Partial<LayerSegmentDocType>): Promise<void> {
    this.ensureEnabled();
    const db = await getDb();
    await db.collections.layer_segments.update(id, changes);
  }

  static async listSegmentsByLayerMedia(layerId: string, mediaId: string): Promise<LayerSegmentDocType[]> {
    this.ensureEnabled();
    const db = await getDb();
    return db.dexie.layer_segments.where('[layerId+mediaId]').equals([layerId, mediaId]).toArray();
  }

  static async upsertSegmentContent(content: LayerSegmentContentDocType): Promise<void> {
    this.ensureEnabled();
    const db = await getDb();
    await db.collections.layer_segment_contents.insert(content);
  }

  static async listSegmentContents(segmentId: string): Promise<LayerSegmentContentDocType[]> {
    this.ensureEnabled();
    const db = await getDb();
    const docs = await db.collections.layer_segment_contents.findByIndex('segmentId', segmentId);
    return docs.map((row) => row.toJSON());
  }

  static async createSegmentLink(link: SegmentLinkDocType): Promise<void> {
    this.ensureEnabled();
    const db = await getDb();
    await db.collections.segment_links.insert(link);
  }

  static async deleteSegment(segmentId: string): Promise<void> {
    this.ensureEnabled();
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
    this.ensureEnabled();
    const db = await getDb();
    return cleanupOrphanSegmentsBridge(db, candidateSegmentIds);
  }

  /**
   * 拆分 segment：在 splitTime 处将一条 segment 拆分为两条 | Split a segment at splitTime into two segments
   */
  static async splitSegment(segmentId: string, splitTime: number): Promise<{ first: LayerSegmentDocType; second: LayerSegmentDocType }> {
    this.ensureEnabled();
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
      textId: newId('stx'),
      startTime: splitFixed,
      createdAt: now,
      updatedAt: now,
    };

    await db.collections.layer_segments.update(segmentId, { endTime: splitFixed, updatedAt: now });
    await db.collections.layer_segments.insert(second);

    return { first, second };
  }

  /**
   * 合并相邻 segment：保留 keepId 的起止较早一端，删除 removeId | Merge two adjacent segments: keep one, remove the other
   */
  static async mergeAdjacentSegments(keepId: string, removeId: string): Promise<LayerSegmentDocType> {
    this.ensureEnabled();
    const db = await getDb();
    const keep = await db.dexie.layer_segments.get(keepId);
    const remove = await db.dexie.layer_segments.get(removeId);
    if (!keep || !remove) throw new Error('Segment(s) not found for merge');

    const now = new Date().toISOString();
    const mergedStart = Math.min(keep.startTime, remove.startTime);
    const mergedEnd = Math.max(keep.endTime, remove.endTime);

    await db.collections.layer_segments.update(keepId, {
      startTime: mergedStart,
      endTime: mergedEnd,
      updatedAt: now,
    });
    await this.deleteSegment(removeId);

    return { ...keep, startTime: mergedStart, endTime: mergedEnd, updatedAt: now };
  }
}
