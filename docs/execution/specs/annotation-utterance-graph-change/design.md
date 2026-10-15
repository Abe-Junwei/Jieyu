---
title: annotation-utterance-graph-change design
doc_type: execution-spec-design
status: accepted
owner: repo
last_reviewed: 2026-10-15
source_of_truth: annotation-utterance-graph-change-spec
depends_on:
  - ./requirements.md
---

# Design — annotation-utterance-graph-change

## 1. 成熟方案扫描 / Research

- 仓库既有最相似的模式：`saveAnnotationUnitAnalysisGraph` 已做校验、按语段排队、`expectedBase` 指纹比对和读回。`buildAnnotationUtteranceGraph` 已做投影与既有关系保留。
- 同类产品 / 标杆实现：ELAN 与 FLEx 把结构编辑和并发冲突分开。冲突用调用方持有的基线拒绝后写，而不是静默覆盖。
- 业内 best practice / 事实标准 / 规范：比较并交换（compare-and-swap）。调用方提交时期望的版本，存储发现版本已变则拒绝。
- 公认不可行 / 反模式 / 已弃用方案：把四种草稿规则收成「有 dirty draft 就拒绝」。`addPos` 允许目标 token 的词类草稿等于提交值，这条会失效。
- 潜在的坑：导出和行内展示也调用投影。投影若只留在写入函数内部，导出会失去入口。
- 决定：**适配**现有投影与保存。新函数只串起二者，并固定 `expectedBase` 为 `row.analysisGraph`。草稿检查和 `reload()` 留在调用方。

## 2. 架构选择

- 落位类别：`actions`。共享函数无 React 状态。
- 关键 trade-off：调用方传入图变换，而不是在保存模块里枚举关系、多词表达和备选分析。
- 拒绝的方案：一个 `handle` 同时做草稿判断、保存和刷新。

## 3. 落位清单

| 文件 | 职责 | 复杂度估计 |
| --- | --- | --- |
| `src/pages/annotation/saveAnnotationUnitAnalysisGraph.ts` | `saveAnnotationUtteranceGraphChange` | 约 30 行 |
| 三个 annotation controller | 草稿、错误文案、刷新 | 各减少重复投影 |

约束自查：

- [x] 不新增 hook
- [x] 不引入 `src/features/…`
- [x] 不改面板 CSS

## 4. ADR 引用

- 相关 ADR：[ADR-0022](../../../adr/0022-annotation-analysis-graph-typed-relations.md)。分析图仍是结构化事实。
- 是否需要新建 ADR：否。草稿策略留在调用方，逆转成本低。

## 5. Feature flag

不启用。

## 6. 失败模式 / 兼容性

- 旧用户路径：底层 `saveAnnotationUnitAnalysisGraph` 仍可供词类菜单测试直接调用。
- 数据迁移：无。
- 回滚预案：四条写入改回各自投影再保存。

## 7. 验证矩阵

| 验证类型 | 命令 | 期望结果 |
| --- | --- | --- |
| 单元测试 | `npx vitest run src/pages/annotation/saveAnnotationUnitAnalysisGraph.test.ts` | all pass |
| typecheck | `npm run typecheck` | 0 errors |
