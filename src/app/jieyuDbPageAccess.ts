/**
 * 应用层 Dexie 入口转发 — 供 `src/pages/*` 使用（M3：页面不直连 `../db`）。
 * Application-layer Dexie entry re-exports for pages (M3: no direct `../db` from pages).
 */

export { db, getDb, withTransaction } from '../db';
export { stripForbiddenTranslationParentLayerId } from '../db';
export { brandLayerUnitWriteTarget, type LayerUnitWriteTarget } from '../db/unitIdBrands';
