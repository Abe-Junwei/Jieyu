---
title: annotation-precedent design
doc_type: execution-spec-design
status: active
owner: annotation
last_reviewed: 2026-09-30
source_of_truth: annotation-precedent-spec
depends_on:
  - ./requirements.md
---

# Design — Annotation same-form gloss

## 1. 成熟方案扫描 / Research

- 仓库既有：`glossSuggestionForToken` 已按词形多数票给空白词占位，回车走 `acceptAnnotationGlossSuggestion`。同形词性有 `collectPosByFormWrites`。字符变体在 `foldCharacterVariants`。
- 同类产品：FLEx 在链接时改掉所有同形。Plaid 的使用者拒绝这个默认，建议留在格子里，铺开是单独动作，并且只碰空白词。
- 业内：词形比较先做 NFC。已确认的分析和尚未确认的建议分开计数。
- 公认不可行：把建议先写入 `reviewStatus: suggested` 再让下一次自动计数把它当成决定。
- 潜在的坑：词和语素若放进同一次计数，语素注释会盖住整词。复制链接会把词缀词条挂到整词上。
- 决定：**适配**现有多数票和回车写入。排序改为已确认义项、人工注释、未确认义项。铺开只写注释。

## 2. 架构选择

- 落位：纯函数排序和筛选；现有 gloss 写入补上 `confirmed`。页面只组装。
- 拒绝：新 controller；把铺开放进转写编排层；铺开时调用 `saveTokenLexemeLink`。

## 3. 落位清单

| 文件 | 职责 | 复杂度 |
| --- | --- | --- |
| `annotationGlossSuggestion.ts` | 建议排序、空白同形筛选 | < 160 行 |
| `saveAnnotationGlossByForm.ts` | 按筛选结果写确认注释 | < 30 行 |
| `AnnotationIgtLineGrid.tsx` | 占位和铺开按钮 | 组装 |

约束自查：不新增 hook；编排层不写排序；无新边框。

## 4. ADR 引用

- 不新建 ADR。注释仍在 `unit_tokens.gloss`，确认状态用已有 `provenance.reviewStatus`。

## 5. Feature flag

- 不新增 flag。

## 6. 失败模式 / 兼容性

- 没有建议时格子仍是空的。铺开零条时不写库。
- 旧的无 `reviewStatus` 注释仍计入人工多数。

## 7. 验证矩阵

| 验证类型 | 命令 | 期望结果 |
| --- | --- | --- |
| 单元测试 | `npx vitest run src/pages/annotation/annotationGlossSuggestion.test.ts src/pages/annotation/acceptAnnotationGlossSuggestion.test.ts` | all pass |
