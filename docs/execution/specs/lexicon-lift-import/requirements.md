---
title: lexicon-lift-import requirements
doc_type: execution-spec-requirements
status: active
owner: lexicon
last_reviewed: 2026-09-20
source_of_truth: lexicon-lift-import-spec
depends_on:
  - ../lexicon-lift-export/requirements.md
---

# Requirements — Lexicon LIFT Import

## 1. What & Why

- **要做什么**：`/lexicon` 选择 `.lift` 文件，解析 SIL **LIFT 0.13** 子集并 `saveLexeme` upsert（按 entry `id`），再 `list()` readback。
- **为什么现在做**：B3e 只出站；M3 余量是导入。R5：词典包只从 `/lexicon` 进，不从 `/corpus`。
- **不做什么**：义项树；DMLex；附件/`lift-ranges`；跨条 variant-entry；FLEx 三档冲突 UI；C3d Word；ChatWindow；新 flag；不改 R8 键。

## 2. 用户场景（≤ 3 条）

1. 空库导入本产品导出的 `.lift`，列表出现 lemma / gloss / 义项 / 词形。
2. 再导入同一文件（相同 entry id）覆盖已映射字段，不丢 `usageCount` 等 LIFT 没有的字段。
3. 坏 XML / 非 0.13 / 无 entry：零写入。

## 3. 验收标准（可测）

- [ ] `parseLiftXml`：`version=0.13`；entry id；`lexical-unit`→lemma；gloss/definition→sense；entry `<variant>`→forms；sense `id` 保留
- [ ] 本产品 exporter 往返：serialize → parse 保留 id / lemma 文本 / sense gloss
- [ ] 非法 XML 或空 lift 不调用 `save`
- [ ] `/lexicon` 导入按钮；`/corpus` 无该入口
- [ ] 无新 flag；ChatWindow 零 diff

## 4. 受影响代码地图

| 类别 | 文件 / 目录 | 改动性质 |
| --- | --- | --- |
| Helper | `src/utils/lexiconLiftImport.ts` | 新增 parse + apply |
| 页面 | `LexiconPage.tsx` | 装配 hidden file input |
| i18n | dictKeys / zh-CN / en-US | 新键 |
| 测试 | `lexiconLiftImport.test.ts` + `LexiconPage.test.tsx` | 新增 / 修改 |
| e2e | `tests/e2e/criticalPaths.spec.ts` | 按钮可见 |

## 5. 已知风险与依赖

- FLEx 按 guid 合并；无 id 的外来 LIFT 会新建条目（可能重复 lemma）。
- 词形无 LIFT id，导入后 `ensureLexemeNestedIds` 会新分配 form id。
- 同一 parent 重复 `lang` 只保留先出现的 form。
