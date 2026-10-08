/**
 * 代码内置的系统结构规则模板（rev5 4.2-9；切片 2B-B；ADR-0044 第 2 条）
 * Code-only system structural rule templates (rev5 4.2-9; slice 2B-B; ADR-0044 §2).
 *
 * - 存放：只在代码里，从不写入数据库，也不属于任何项目。
 * - 查询：列表 = 这里的系统模板（只读、带系统标记）+ 当前项目的行。
 * - 引用：解析 ID 时先查这里，再查项目行。
 * - 修改：先“复制到项目”（新 UUID，记录 `derivedFromSystemId`），再改副本。
 * - 版本：冻结点之后已发布的 ID 内容不再改动；要改就发布新 ID（如 `.v2`）。
 */
import { isSystemTemplateId } from '../db/catalogOwnership';
import {
  DEFAULT_LEIPZIG_STRUCTURAL_PROFILE,
  type StructuralRuleProfile,
} from './structuralRuleProfile';

export type SystemStructuralRuleProfileTemplate = Readonly<{
  id: string;
  scope: 'system';
  isSystem: true;
  enabled: true;
  priority: number;
  profile: StructuralRuleProfile;
}>;

/** 系统 Leipzig 结构模板 ID | System Leipzig structural template id */
export const SYSTEM_LEIPZIG_STRUCTURAL_TEMPLATE_ID = 'system.leipzig-structural.v1';

export const SYSTEM_STRUCTURAL_RULE_PROFILE_TEMPLATES: readonly SystemStructuralRuleProfileTemplate[] =
  Object.freeze([
    Object.freeze({
      id: SYSTEM_LEIPZIG_STRUCTURAL_TEMPLATE_ID,
      scope: 'system',
      isSystem: true,
      enabled: true,
      priority: 0,
      profile: DEFAULT_LEIPZIG_STRUCTURAL_PROFILE,
    } as const),
  ]);

export function getSystemStructuralRuleProfileTemplate(
  id: string,
): SystemStructuralRuleProfileTemplate | undefined {
  if (!isSystemTemplateId(id)) return undefined;
  return SYSTEM_STRUCTURAL_RULE_PROFILE_TEMPLATES.find((template) => template.id === id);
}

/** 当前代码里不存在的系统引用 | System refs that the running code cannot resolve */
export function listUnresolvedSystemRefs(ids: readonly string[]): string[] {
  return [...new Set(ids)].filter((id) => !getSystemStructuralRuleProfileTemplate(id));
}
