import {
  dexieStoresForLayerSegmentGraphRw,
  dexieStoresForLayerUnitsAndContentsRw,
  getDb,
  withTransaction,
  type LayerUnitContentDocType,
  type LayerUnitDocType,
  type UnitRelationDocType,
} from '../db';
import { bulkUpsertLayerUnitContents, bulkUpsertLayerUnits, bulkUpsertUnitRelations, buildClonedLayerUnitGraphForSplit, deleteLayerUnitCascade, getLayerUnitById, listLayerUnitContentsByUnitId, listLayerUnitsByIds, listLayerUnitsByLayerMedia, putLayerUnit, putLayerUnitContent, putUnitRelation, updateLayerUnit } from './LayerUnitSegmentWritePrimitives';
import { newId } from '../utils/transcriptionFormatters';

/**
 * 统一层单元写服务 | Unified layer unit write service
 */
export class LayerUnitService {
  static async createUnit(unit: LayerUnitDocType): Promise<void> {
    const db = await getDb();
    await putLayerUnit(db, unit);
  }

  /**
   * 原子写入单元与主内容 | Atomically write unit and primary content
   */
  static async createUnitWithContentAtomic(
    unit: LayerUnitDocType,
    content: LayerUnitContentDocType,
  ): Promise<void> {
    if (content.unitId !== unit.id) {
      throw new Error('LayerUnitContent.unitId must match LayerUnit.id');
    }
    const db = await getDb();
    await withTransaction(db, 'rw', [...dexieStoresForLayerUnitsAndContentsRw(db)], async () => {
      await putLayerUnit(db, unit);
      await putLayerUnitContent(db, content);
    });
  }

  static async updateUnit(id: string, changes: Partial<LayerUnitDocType>): Promise<void> {
    const db = await getDb();
    await updateLayerUnit(db, id, changes);
  }

  static async upsertUnitContent(content: LayerUnitContentDocType): Promise<void> {
    const db = await getDb();
    await putLayerUnitContent(db, content);
  }

  static async listUnitContents(unitId: string): Promise<LayerUnitContentDocType[]> {
    const db = await getDb();
    return listLayerUnitContentsByUnitId(db, unitId);
  }

  static async createUnitRelation(relation: UnitRelationDocType): Promise<void> {
    const db = await getDb();
    await putUnitRelation(db, relation);
  }

  static async assignSpeakerToUnits(unitIds: readonly string[], speakerId?: string): Promise<void> {
    if (unitIds.length === 0) return;
    const db = await getDb();
    const rows = await listLayerUnitsByIds(db, unitIds);
    if (rows.length === 0) return;
    const now = new Date().toISOString();
    const updates = rows.map((row) => ({
      ...row,
      ...(speakerId ? { speakerId } : {}),
      ...(!speakerId && row.speakerId ? { speakerId: undefined } : {}),
      updatedAt: now,
    }));
    await bulkUpsertLayerUnits(db, updates.map((row) => {
      if (!speakerId) {
        const { speakerId: _speakerId, ...rest } = row;
        void _speakerId;
        return rest;
      }
      return row;
    }));
  }

  static async deleteUnit(unitId: string): Promise<void> {
    const db = await getDb();

    await withTransaction(db,
      'rw',
      [...dexieStoresForLayerSegmentGraphRw(db)],
      async () => {
        await deleteLayerUnitCascade(db, [unitId]);
      },
    );
  }

  /**
   * 拆分统一单元，并克隆内容与 source 关系 | Split a unit and clone contents plus source-side relations
   */
  static async splitUnit(unitId: string, splitTime: number): Promise<{ first: LayerUnitDocType; second: LayerUnitDocType }> {
    const db = await getDb();
    const existing = await getLayerUnitById(db, unitId);
    if (!existing) throw new Error(`Layer unit ${unitId} not found`);

    const minSpan = 0.05;
    const splitFixed = Number(splitTime.toFixed(3));
    if (splitFixed - existing.startTime < minSpan || existing.endTime - splitFixed < minSpan) {
      throw new Error('Split point too close to unit boundary');
    }

    const now = new Date().toISOString();
    const secondId = newId('lu');
    const first: LayerUnitDocType = {
      ...existing,
      endTime: splitFixed,
      updatedAt: now,
    };
    const second: LayerUnitDocType = {
      ...existing,
      id: secondId,
      startTime: splitFixed,
      createdAt: now,
      updatedAt: now,
    };

    const { clonedContents, clonedRelations } = await buildClonedLayerUnitGraphForSplit(
      db,
      unitId,
      second.id,
      now,
    );

    await withTransaction(db,
      'rw',
      [...dexieStoresForLayerSegmentGraphRw(db)],
      async () => {
        await updateLayerUnit(db, unitId, { endTime: splitFixed, updatedAt: now });
        await putLayerUnit(db, second);
        if (clonedContents.length > 0) {
          await bulkUpsertLayerUnitContents(db, clonedContents);
        }
        if (clonedRelations.length > 0) {
          await bulkUpsertUnitRelations(db, clonedRelations);
        }
      },
    );

    return { first, second };
  }

  /**
   * 合并同轴相邻单元 | Merge adjacent units within the same layer timeline
   */
  static async mergeAdjacentUnits(keepId: string, removeId: string): Promise<LayerUnitDocType> {
    const db = await getDb();
    const [keep, remove] = await Promise.all([
      getLayerUnitById(db, keepId),
      getLayerUnitById(db, removeId),
    ]);
    if (!keep || !remove) throw new Error('Layer unit(s) not found for merge');
    const keepLayerId = keep.layerId?.trim();
    const keepMediaId = keep.mediaId?.trim();
    if (!keepLayerId || !keepMediaId || keepLayerId !== remove.layerId || keepMediaId !== remove.mediaId) {
      throw new Error('Layer units must be in the same layer and media to merge');
    }

    const siblings = await listLayerUnitsByLayerMedia(db, keepLayerId, keepMediaId);
    siblings.sort((a, b) => a.startTime - b.startTime);
    const keepIndex = siblings.findIndex((item) => item.id === keepId);
    const removeIndex = siblings.findIndex((item) => item.id === removeId);
    if (keepIndex < 0 || removeIndex < 0) {
      throw new Error('Layer unit(s) not found in layer timeline');
    }
    if (Math.abs(keepIndex - removeIndex) !== 1) {
      throw new Error('Only adjacent layer units can be merged');
    }

    const now = new Date().toISOString();
    const mergedStart = Math.min(keep.startTime, remove.startTime);
    const mergedEnd = Math.max(keep.endTime, remove.endTime);

    await withTransaction(db,
      'rw',
      [...dexieStoresForLayerSegmentGraphRw(db)],
      async () => {
        await updateLayerUnit(db, keepId, {
          startTime: mergedStart,
          endTime: mergedEnd,
          updatedAt: now,
        });
        await deleteLayerUnitCascade(db, [removeId]);
      },
    );

    return { ...keep, startTime: mergedStart, endTime: mergedEnd, updatedAt: now };
  }
}