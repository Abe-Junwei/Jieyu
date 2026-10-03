---
title: annotation-gloss-structure design
doc_type: execution-spec-design
status: active
owner: annotation
last_reviewed: 2026-09-29
source_of_truth: annotation-gloss-structure-spec
depends_on:
  - ./requirements.md
---

# Design — Annotation gloss structure

## 1. 成熟方案扫描 / Research

- 仓库既有：`parseGlossStructure` 已按 Leipzig 符号切段；`projectStructuralParseToAnalysisGraph` 把结果挂在单个 `token-1` 上，供结构配置预览。整句投影在 `projectUtteranceAnalysisGraph`。
- 同类产品：FLEx 的词注释按 `-`、`=`、`<>` 对齐词素和附缀，不把 `DEFAULT_LOCALE` 当结构。
- 业内：Leipzig Glossing Rules（2008）规定 `-` 词素、`.` 特征、`=` 附缀、`<>` 中缀、`[]` 补足、`\` 交替。它是展示约定，不是词库。
- 公认不可行：从 `touch<PRS>` 猜 `tango` 的字符偏移；把零形式写成 CoNLL-U 空节点；用整段注释覆盖作者原文。
- 潜在的坑：`1SG` 会被现有解析标成 feature。附缀两侧即使都是特征标签，仍要各成一个分析词。
- 决定：**复用** `parseGlossStructure`，在整句投影里按词合并。结构配置页的单 token 投影保持不动。

## 2. 架构选择

- 落位：纯函数。聚焦行只调用已有的 `buildAnnotationUtteranceGraph`。
- 拒绝：改 `projectStructuralParseToAnalysisGraph` 的 `token-1` 行为；新 controller；把 circumfix 记号 `PTCP>run<PTCP` 收成新语法。

## 3. 落位清单

| 文件 | 职责 | 复杂度 |
| --- | --- | --- |
| `glossStructure.ts` | 一个词的注释变成节点和关系 | < 220 行 |
| `projectUtteranceAnalysisGraph.ts` | 无人工词素时并入 | 调用 |
| `AnnotationIgtRow.tsx` | 聚焦行展示当前投影 | 组装 |

约束自查：无新 hook；编排层不写解析；无新边框。

## 4. ADR 引用

- [ADR 0022](../../../adr/0022-annotation-analysis-graph-typed-relations.md)。不新建 ADR。

## 5. Feature flag

- 不新增。沿用已开放的标注页。

## 6. 失败模式 / 兼容性

- 旧的整词 gloss 节点仍保留作者原文。没有结构边界的注释走原来的特征映射。
- 已保存的多词组仍由 `retainPartOfMwe` 接回。

## 7. 验证矩阵

| 验证 | 命令 | 期望 |
| --- | --- | --- |
| 单元 | `npx vitest run src/annotation/glossStructure.test.ts src/annotation/analysisGraphProjection.test.ts src/annotation/projectUtteranceAnalysisGraph.test.ts` | 通过 |
| 类型 | `npx tsc --noEmit` | 0 |
| 文档 | `npm run check:docs-governance` | 通过 |
