import { featureFlags } from '../ai/config/featureFlags';
import {
  getDb,
  type LayerSegmentContentDocType,
  type LayerSegmentDocType,
  type SegmentLinkDocType,
} from '../db';
import { cleanupOrphanSegments as cleanupOrphanSegmentsBridge } from './LayerSegmentationV2BridgeService';

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
}
