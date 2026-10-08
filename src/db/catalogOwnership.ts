/**
 * 目录归属与系统模板 ID 的写入规则（rev5 4.2-9 / 4.4；切片 2B-B）
 * Catalog ownership and system-template id rules enforced on every write (rev5 4.2-9 / 4.4).
 *
 * - 每个目录行都必须带项目归属（`ownerField` 来自表登记处）。
 * - 系统模板只放在代码里：任何目录表都不能写入 `system.*` ID。
 * - Every catalog row must carry its owning project (`ownerField` from the table registry).
 * - System templates are code-only, so no catalog table accepts a `system.*` id.
 */
import { JIEYU_MAIN_TABLE_REGISTRY, type JieyuMainTableName } from './tableRegistry';
import type { JieyuRowValidator, JieyuTableValidators } from './writeValidationMiddleware';

/** 系统模板 ID 前缀 | System template id prefix */
const SYSTEM_TEMPLATE_ID_PREFIX = 'system.';

export function isSystemTemplateId(id: unknown): id is string {
  return typeof id === 'string' && id.startsWith(SYSTEM_TEMPLATE_ID_PREFIX);
}

/** 带字段路径的归属错误，写入校验据此报出字段名 | Ownership error carrying the offending field */
export class CatalogOwnershipError extends Error {
  constructor(
    public readonly fieldPath: string,
    message: string,
  ) {
    super(message);
    this.name = 'CatalogOwnershipError';
  }
}

export function assertCatalogRowOwnership(tableName: JieyuMainTableName, row: unknown): void {
  const registration = JIEYU_MAIN_TABLE_REGISTRY[tableName];
  if (registration.dataClass !== 'project_catalog' || registration.ownerField === undefined) return;
  const record = (row ?? {}) as Record<string, unknown>;
  if (isSystemTemplateId(record.id)) {
    throw new CatalogOwnershipError(
      'id',
      `system template ids ("${SYSTEM_TEMPLATE_ID_PREFIX}*") are code-only and cannot be stored`,
    );
  }
  const owner = record[registration.ownerField];
  if (typeof owner !== 'string' || owner.trim().length === 0) {
    throw new CatalogOwnershipError(
      registration.ownerField,
      `catalog rows must name their owning project in "${registration.ownerField}"`,
    );
  }
}

/** 在各表校验器之后追加归属检查 | Append the ownership check after each table validator */
export function withCatalogOwnershipRules<TableName extends JieyuMainTableName>(
  validators: JieyuTableValidators<TableName>,
): JieyuTableValidators<TableName> {
  const wrapped = { ...validators };
  for (const tableName of Object.keys(validators) as TableName[]) {
    const registration = JIEYU_MAIN_TABLE_REGISTRY[tableName];
    if (registration.dataClass !== 'project_catalog') continue;
    const validate = validators[tableName];
    const combined: JieyuRowValidator = (doc: never) => {
      validate(doc);
      assertCatalogRowOwnership(tableName, doc);
    };
    wrapped[tableName] = combined;
  }
  return wrapped;
}
