---
title: lexicon-lift-export requirements
doc_type: execution-spec-requirements
status: completed
owner: lexicon
last_reviewed: 2026-09-20
source_of_truth: lexicon-lift-export-spec
depends_on:
  - ../lexicon-sense-form-ids/requirements.md
---

# Requirements — Lexicon LIFT Export

## 1. What & Why

- **要做什么**：`/lexicon` 把当前 `lexemes` 列表序列化为 SIL **LIFT 0.13** XML 并下载 `.lift`。只出站，不写库。
- **为什么现在做**：M3 编辑闭环已齐（B3b/c/d + nested id）；缺词典自己的交换入口。R5：不得从 `/corpus` 做词典包。转写 flextext 是 IGT，不是词库。
- **不做什么**：LIFT 导入 / round-trip；义项树；DMLex；附件包；variant-entry 关系；C3d Word；ChatWindow；新 flag；不改 R8 键。

## 2. 用户场景（≤ 3 条）

1. 词典有词条时点「导出 LIFT」，得到可被 FLEx/WeSay 打开的 `.lift`。
2. 空词库时按钮不可用，零下载。
3. 额外义项与词形出现在 `<sense>` / `<variant>`（allomorph），sense `id` 与存库 id 一致。

## 3. 验收标准（可测）

- [ ] `serializeLexemesToLift`：`<lift version="0.13">`；entry `id`=lexeme.id；lemma→`lexical-unit/form`；gloss→`sense/gloss`；definition→`sense/definition/form`；forms→entry 级 `variant/form`
- [ ] 空数组不序列化、不 download
- [ ] `/lexicon` 按钮走词典文案；不出现在 `/corpus`
- [ ] XML 转义 `&` `<`；`default` 语言键映射到 `lexeme.language` 或 `und`
- [ ] 无新 flag；ChatWindow 零 diff

## 4. 受影响代码地图

| 类别 | 文件 / 目录 | 改动性质 |
| --- | --- | --- |
| 页面 | `LexiconPage.tsx` | 仅装配导出按钮 |
| Helper | `src/utils/lexiconLiftExport.ts` | 序列化 + download |
| i18n | `dictKeys` / zh-CN / en-US | 新键 |
| 测试 | `lexiconLiftExport.test.ts` + `LexiconPage.test.tsx` | 新增 / 修改 |
| e2e | `tests/e2e/criticalPaths.spec.ts` | 按钮可见 |

## 5. 已知风险与依赖

- 同一 parent 下同一 `lang` 只能有一个 `form`（RNG）。
- FLEx 把 entry 下 `<variant>` 当 **allomorph**，不是跨条 variant 关系。
- 无 id 的 sense 仅导出合成 id，不回写 Dexie。
