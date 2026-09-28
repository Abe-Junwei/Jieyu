---
title: lexicon DMLex baseline requirements
doc_type: execution-spec-requirements
status: active
owner: lexicon
last_reviewed: 2026-09-27
source_of_truth: lexicon-dmlex-baseline-spec
---

# Requirements — lexicon-dmlex-baseline

## 1. What & Why

- **要做什么**：词条编辑与 `lexemes` 行改为 DMLex 1.0 JSON（含跨语言模块）；LIFT 只做导入导出投影。
- **为什么现在做**：没有历史词库行，现有义项词类、嵌套子义项和 FLEx 注释类型与 DMLex 冲突，继续存两套字段会变成第二套真值。
- **不做什么**：语义域浏览、图片、关系图、RDF/XML/SQL 序列化、新 Dexie 版本、feature flag。

## 2. 用户场景

1. 编辑者保存词头、词类、对译、释义、例句后，列表按词头和对译读回。
2. 同一词条下的子义项保存为 `subsense` 关系，界面仍按层级画出。
3. 导入 LIFT 时，对得上的字段写入 DMLex，对不上的进入诊断，不写回编辑字段。

## 3. 验收标准

- [ ] 保存后的 `entry` 通过 vendored `dmlex.schema.json`；`jieyu` 不在 `entry` 内。
- [ ] 资源级 `relations` 单独占 `lexemes` 一行，列表不把它当词条。
- [ ] 标注链接可带 `senseId`。LIFT 往返保留词头、对译、子义项，并报告诊断。

## 4. 受影响代码地图

| 类别 | 文件 | 改动性质 |
| --- | --- | --- |
| 类型 / schema | `src/db/types.ts`, `src/db/schemas.ts` | 修改 |
| 纯函数 | `src/utils/dmlexEntry.ts`, `src/utils/lexiconLiftImport.ts`, `src/utils/lexiconLiftExport.ts` | 修改 |
| Controller | `src/pages/useLexiconEntryEditController.ts` | 修改 |
| 页面 | `src/pages/LexiconPage.tsx` 与 `src/pages/lexicon/*` | 修改 |
| Service | `src/services/linguisticServiceLexemeOps.ts` | 修改 |
