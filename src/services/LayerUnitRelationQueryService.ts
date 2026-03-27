import {
  getDb,
  type JieyuDatabase,
  type UnitRelationDocType,
} from '../db';

export class LayerUnitRelationQueryService {
  static async listRelationsBySourceUnitIds(
    sourceUnitIds: readonly string[],
    options?: { relationType?: UnitRelationDocType['relationType'] },
    database?: JieyuDatabase,
  ): Promise<UnitRelationDocType[]> {
    const ids = [...new Set(sourceUnitIds.filter((id) => id.trim().length > 0))];
    if (ids.length === 0) return [];

    const db = database ?? await getDb();
    return (await db.dexie.unit_relations.where('sourceUnitId').anyOf(ids).toArray())
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
    return (await db.dexie.unit_relations.where('targetUnitId').anyOf(ids).toArray())
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
    return this.listTimeSubdivisionChildUnitIds(parentUnitIds, database);
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