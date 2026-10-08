/**
 * 归属不可变规则（2B-G / JY-03）| Ownership immutability rules (2B-G / JY-03)
 *
 * 覆盖：目录表的 `ownerField`（表登记处）；带 `textId` 的项目内容表（含 token / morpheme 自身的
 * `textId`）。
 *
 * 明确不覆盖（父引用不可变，审查约定里的可选项）：token 的 `unitId`、morpheme 的 `unitId` /
 * `tokenId`、`token_lexeme_links.targetId`。同一项目内的编辑会合法地改指它们（词的拆分 / 合并 /
 * 删除会把 morpheme 和词条链接挪到相邻 token 上，单元拆分会把 token 挪到新单元），而要判断
 * 「新父行是否属于另一个项目」需要读父表，父表通常不在当前事务范围内，中间件里做不到。这些行
 * 自身的 `textId` 仍不可变，所以不能被搬进另一个项目；剩下的风险是同项目行指向别的项目的父行，
 * 记为未覆盖。同理不覆盖：派生表（segment_meta、各类 snapshots，整组删除后重建）、anchors、
 * tier_annotations、layer_links、user_notes、`layer_units.layerId` / `parentUnitId`、
 * `layer_unit_contents.unitId` / `layerId`、`token_lexeme_links.lexemeId`。
 *
 * Covered: catalog `ownerField` (from the registry) and `textId` of project content tables
 * (including tokens' and morphemes' own `textId`).
 * NOT covered (parent-reference immutability, the optional part of the agreed rules): token
 * `unitId`, morpheme `unitId` / `tokenId`, `token_lexeme_links.targetId`. In-project edits repoint
 * them legitimately (token split / merge / delete move morphemes and lexeme links onto a neighbour,
 * unit split moves tokens), and checking whether the NEW parent lives in another project needs a
 * read of the parent table, which is usually outside the transaction scope. The rows' own `textId`
 * stays immutable, so they cannot be moved into another project; a same-project row pointing at a
 * foreign parent remains uncovered. Also not covered: derived tables (rebuilt by delete + put),
 * anchors, tier annotations, layer links, notes, unit `layerId` / `parentUnitId`, content
 * `unitId` / `layerId`, and `token_lexeme_links.lexemeId`.
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
