---
title: ADR 0014 - GrammarDoc 与写作库边界（占位）
doc_type: adr
status: proposed
owner: repo
last_reviewed: 2026-04-21
source_of_truth: decision-record
---

# ADR 0014：GrammarDoc 与写作库边界（占位）

## 背景

路线图 [第四节 · GrammarDoc ↔ 写作库](../execution/plans/写作页开发路线图-2026-04-22.md) 已写默认策略；G2 前须冻结**例外、只读快照格式与导航**，避免 vault 返工。

## 决策（骨架）

1. **正文**：仍以路线图第四节表格为**初值**；本 ADR 正文须在 **G2 前** 补全：例外列表、快照 schema、与 `corpusRef` 交叉引用规则。
2. **禁止**：在未补全前，实现 PR **不得**新增「写作直接写 Grammar 权威表」的隐式路径。

## 影响

- 与 [ADR 0011](./0011-writing-corpus-ref-and-citation-jump.md) 交叉引用须在正文补全时一并列出。

## 后续回顾点

1. 正文冻结后 `accepted` 并链回路线图第六节 ADR 登记。
