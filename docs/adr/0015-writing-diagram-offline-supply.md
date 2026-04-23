---
title: ADR 0015 - 写作图码与离线供应链（占位）
doc_type: adr
status: proposed
owner: repo
last_reviewed: 2026-04-21
source_of_truth: decision-record
---

# ADR 0015：写作图码与离线供应链（占位）

## 背景

路线图 [附录 D](../execution/plans/写作页开发路线图-2026-04-22.md) 已给降级矩阵；G3 前须将 **Mermaid / PlantUML / pandoc-ext/diagram** 等与 **Pandoc 统一预览核**、导出 filter **锁版本** 并写入可执行清单。

## 决策（骨架）

1. **初值**：附录 D 矩阵 + 第七节 golden 要求为**约束**；本 ADR 须在 **G3 前** 补全：版本 pin、Worker 边界、与 **Pandoc HTML 预览** 的图资源路径约定。**Mermaid / PlantUML 等 pin** 与全局工具链版本 **优先链** [ADR 0010 · 版本表](./0010-writing-workspace-export-runtime.md#版本表-单一工程真源)（若该表尚未列图码行，则在本 ADR 首版正文中 **暂为 SSOT** 直至合并回 0010）。
2. **禁止**：在未补全前，默认不引入新的远程图渲染依赖。

## 后续回顾点

1. 与导出 golden 合并验收策略在正文补全时闭合。
