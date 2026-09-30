---
title: annotation-sentence-export design
doc_type: execution-spec-design
status: active
owner: annotation
last_reviewed: 2026-09-30
source_of_truth: annotation-sentence-export-spec
depends_on:
  - ./requirements.md
---

# Design — Annotation sentence export

## 1. 成熟方案扫描 / Research

- 仓库既有：`buildAnnotationSentenceExport` 已写出句子、时间、说话人和 token 上的 `senseId`。语素保存在 `unit_morphemes`，词类字段和整词分开。
- 同类产品：FLEx 导出把短语层留在词和语素旁边。Ligt 批评的是导出后短语层被清空，对齐只能靠列位置重做。
- 业内：词和注释用稳定 id 相连，不靠导出列的顺序。
- 公认不可行：用两列位置表示“这个语素属于这个词”。
- 潜在的坑：只导出整词词类会让人以为语素词类相同。
- 决定：**适配**现有 JSON 导出。增加语素数组和 `mediaId`，读回按 id 查找。

## 2. 架构选择

- 落位：纯函数构造和读回。页面只把已加载的语素传进去。
- 拒绝：导出时重写 gloss，或按数组下标配对。

## 3. 落位清单

| 文件 | 职责 | 复杂度 |
| --- | --- | --- |
| `annotationSentenceExport.ts` | 写出和按 id 读回 | < 180 行 |
| `AnnotationWorkspace.tsx` | 组装当前句的语素 | 透传 |

约束自查：无新 hook；不写回；无新边框。

## 4. ADR 引用

- 不新建 ADR。

## 5. Feature flag

- 不新增 flag。

## 6. 失败模式 / 兼容性

- 旧文件没有 `morphemes` 时读成空数组。

## 7. 验证矩阵

| 验证类型 | 命令 | 期望结果 |
| --- | --- | --- |
| 单元测试 | `npx vitest run src/pages/annotation/annotationSentenceExport.test.ts` | all pass |
