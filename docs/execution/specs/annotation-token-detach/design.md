---
title: annotation-token-detach design
doc_type: execution-spec-design
status: active
owner: annotation
last_reviewed: 2026-09-30
source_of_truth: annotation-token-detach-spec
depends_on:
  - ./requirements.md
---

# Design — Annotation token detach

## 1. 成熟方案扫描 / Research

- 仓库既有：`mergeAnnotationUnitTokenWithNext` 在删除右词前把语素和链接改挂到左词，并保留 `senseId` 与 confidence。`transcriptionMapWithSurface` 按语言键合并，不整表替换。`saveAnnotationMorphemes` 复制已有多语言 gloss。
- 同类产品：FLEx 删词前会提示分析将丢失。ELAN 删层内容不顺带改其他层的语言键。
- 业内：附着分析跟 token id 走。删 id 之前要么改挂，要么让人确认条数。
- 公认不可行：再做一套 retokenize 快照来表达普通删除。
- 潜在的坑：`removeToken` 会按旧 tokenId 删语素和链接。必须先改挂，再删除。
- 决定：**复用**合并的改挂顺序和现有的语言键合并。不为普通删除新增快照。

## 2. 架构选择

- 落位：纯函数决定改挂、确认或直接删；写函数沿用 `saveMorpheme` / `saveTokenLexemeLink` / `removeToken`。
- 拒绝：在 `removeToken` 里猜测邻居。调用方没有词序时不应偷偷改挂。

## 3. 落位清单

| 文件 | 职责 | 复杂度 |
| --- | --- | --- |
| `deleteAnnotationToken.ts` | 计划与改挂后删除 | < 120 行 |
| `annotationIgtMenus.ts` | 菜单文案含将失去的条数 | 组装 |

约束自查：不新增 hook；不进转写编排层；无新边框。

## 4. ADR 引用

- 不新建 ADR。

## 5. Feature flag

- 不新增 flag。

## 6. 失败模式 / 兼容性

- 词已经不在时视为已删除。
- 未确认的孤立词零写入。

## 7. 验证矩阵

| 验证类型 | 命令 | 期望结果 |
| --- | --- | --- |
| 单元测试 | `npx vitest run src/pages/annotation/deleteAnnotationToken.test.ts` | all pass |
