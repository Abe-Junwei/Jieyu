/**
 * 数据层桶文件 — 统一对外导出
 * Data-layer barrel — unified public exports
 */

// ── 纯类型 | Pure types ──
export * from './types';

// ── Zod 校验 | Zod schemas & validators ──
export * from './schemas';

// ── 集合适配器与桥接 | Collection adapters & bridge helpers ──
export * from './adapter';

// ── Dexie 引擎、迁移与实例 | Dexie engine, migrations & instance ──
export {
  buildSegmentationV2BackfillRows,
  buildV28BackfillPlanForText,
  JIEYU_DEXIE_DB_NAME,
  JieyuDexie,
  db,
  getDb,
} from './engine';
export type { JieyuDatabase } from './engine';

export { trackEntityDocumentId } from './trackEntityIds';

export {
  dexieStoresForAiTaskSnapshotsRw,
  dexieStoresForCustomFieldDefinitionDeleteCascadeRw,
  dexieStoresForDeleteAudioKeepTimeline,
  dexieStoresForDeleteProjectByTextIdCascadeRw,
  dexieStoresForGetUnitLinguisticMemoryRead,
  dexieStoresForLanguageAssetOverviewRw,
  dexieStoresForLanguageCatalogMutateRw,
  dexieStoresForLanguageCatalogProjectionRead,
  dexieStoresForLayerSegmentGraphRw,
  dexieStoresForLayerUnitsAndContentsRw,
  dexieStoresForLayerUnitsAndUnitRelationsRw,
  dexieStoresForLayerUnitsRw,
  dexieStoresForLayerUnitsTableRead,
  dexieStoresForOrthographyBridgeUpsertRw,
  dexieStoresForRemoveUnitCascadeRw,
  dexieStoresForSegmentMetaRebuildSourceRead,
  dexieStoresForSegmentMetaRw,
  dexieStoresForSegmentMetaSyncForUnitIdsRead,
  dexieStoresForTierAnnotationAtomicRw,
  dexieStoresForTrackEntitiesRw,
  dexieStoresForUnitDocProjectionRead,
  dexieStoresForWorkspaceSnapshotRebuildRw,
} from './dexieTranscriptionGraphStores';

// ── 导入 / 导出 | Import / export ──
export {
  exportDatabaseAsJson,
  downloadDatabaseAsJson,
  importDatabaseFromJson,
} from './io';
