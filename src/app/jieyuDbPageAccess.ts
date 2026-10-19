/**
 * 应用层 Dexie 入口转发 — 供 `src/pages/*` 使用（M3：页面不直连 `../db`）。
 * Application-layer Dexie entry re-exports for pages (M3: no direct `../db` from pages).
 */

export { db, getDb } from '../db/engine';
export { withTransaction } from '../db/withTransaction';
export { patchProjectMetadata } from '../services/projectMetadataPatch';
export { stripForbiddenTranslationParentLayerId } from '../db/types';
export { isLexemeEntry } from '../db/lexemeNestedIds';
export { dmlexResourceIdForProject } from '../db/dmlexTypes';
export { brandLayerUnitWriteTarget, type LayerUnitWriteTarget } from '../db/unitIdBrands';
export type { DmlexRelation, DmlexSense, JieyuLexemeExtras } from '../db/dmlexTypes';
