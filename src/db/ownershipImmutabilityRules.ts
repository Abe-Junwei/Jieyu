/**
 * 归属不可变规则（2B-G / JY-03）| Ownership immutability rules (2B-G / JY-03)
 *
 * 覆盖：目录表的 `ownerField`（表登记处）；带 `textId` 的项目内容表（含 token / morpheme 自身的
 * `textId`）。
 *
 * 父引用（token 的 `unitId`、morpheme 的 `unitId` / `tokenId`、`token_lexeme_links.targetId` /
 * `lexemeId`）不做不可变：同一项目内的编辑会合法地改指它们（词的拆分 / 合并 / 删除、单元拆分）。
 * 改为由同一中间件做父行一致性检查（GAP-1，`JIEYU_PARENT_CONSISTENCY_RULES`）：子行与父行必须
 * 同项目；写事务会把父表并入作用域，所以隐式单表写也覆盖。仍不覆盖：派生表（segment_meta、
 * 各类 snapshots，整组删除后重建）、anchors、tier_annotations、layer_links、user_notes、
 * `layer_units.layerId` / `parentUnitId`、`layer_unit_contents.unitId` / `layerId`。
 *
 * Covered: catalog `ownerField` (from the registry) and `textId` of project content tables
 * (including tokens' and morphemes' own `textId`).
 * Parent references (token `unitId`, morpheme `unitId` / `tokenId`, `token_lexeme_links.targetId`
 * / `lexemeId`) are NOT immutable: in-project edits repoint them legitimately (token split / merge
 * / delete, unit split). Instead the same middleware checks parent consistency (GAP-1,
 * `JIEYU_PARENT_CONSISTENCY_RULES`): child and parent must be in the same project; rw scopes are
 * widened with the parent tables, so implicit single-table writes are covered too. Still not
 * covered: derived tables (rebuilt by delete + put), anchors, tier annotations, layer links, notes,
 * unit `layerId` / `parentUnitId`, content `unitId` / `layerId`.
 *
 * 合法的跨项目搬迁路径审计：没有复制 / 合并 / 接管项目的功能；项目快照导入先清空本项目再写入，
 * 归档 / JSON upsert 导入与跨项目 LIFT 导入撞上别的项目的 id 时，前两者现在会被中间件拒绝（整笔
 * 事务回滚），LIFT 导入则换新 id（JY-07）。不提供绕过中间件的后门。
 * Move-path audit: there is no copy / merge / takeover feature. Project snapshot import prunes the
 * project before writing; JSON / archive upsert import that collides with another project's id is
 * now rejected by the middleware (the transaction rolls back), and cross-project LIFT import gets new
 * ids (JY-07). There is no backdoor around the middleware.
 */
import type { OwnershipImmutableFieldRules } from './ownershipImmutabilityMiddleware';
import { JIEYU_MAIN_TABLE_REGISTRY, type JieyuMainTableName } from './tableRegistry';

const PROJECT_CONTENT_TEXT_ID_TABLES = [
  'media_items',
  'layer_units',
  'layer_unit_contents',
  'unit_relations',
  'unit_tokens',
  'unit_morphemes',
  'tier_definitions',
  'track_entities',
  'source_records',
  'annotation_documents',
] as const satisfies readonly JieyuMainTableName[];

function buildRules(): OwnershipImmutableFieldRules {
  const rules: Record<string, string[]> = {};
  const add = (table: string, fields: readonly string[]) => {
    const bucket = rules[table] ?? (rules[table] = []);
    for (const field of fields) if (!bucket.includes(field)) bucket.push(field);
  };
  for (const [table, registration] of Object.entries(JIEYU_MAIN_TABLE_REGISTRY)) {
    if (
      registration.dataClass === 'project_catalog' &&
      typeof registration.ownerField === 'string'
    ) {
      add(table, [registration.ownerField]);
    }
  }
  for (const table of PROJECT_CONTENT_TEXT_ID_TABLES) add(table, ['textId']);
  return rules;
}

export const JIEYU_OWNERSHIP_IMMUTABLE_FIELDS: OwnershipImmutableFieldRules = buildRules();
