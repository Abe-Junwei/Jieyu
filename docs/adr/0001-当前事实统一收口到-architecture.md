---
title: ADR 0001 - 当前事实统一收口到 docs/architecture
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-04-21
source_of_truth: decision-record
---

# ADR 0001：当前事实统一收口到 docs/architecture

## 背景

仓库曾长期把 README、规划文档、发布说明和现状盘点混合使用，导致同一主题出现多份“看起来都像真源”的描述。

## 决策

1. README 只保留启动、测试、构建、主要入口和文档索引。
2. 长期有效的当前事实统一进入 `docs/architecture/`。
3. 历史规划类 Markdown（`规划-*` 等）统一放在 `docs/execution/archive/historical-root-docs/`，只保留方案、约束、取舍和历史阶段判断。
4. 发布说明类 Markdown（`发布说明-*`）放在同一归档目录，承载某轮实现的收口、影响面和回归结论。

## 影响

1. 新增长期事实文档时，优先更新 `docs/architecture/`。
2. 历史规划中出现“当前”“已完成”等表述时，必须按文内日期理解，不能再作为仓库现状引用。
3. 根目录与 docs 索引的可导航性明显提高，但需要额外维护 architecture 索引。

## 被放弃的备选方案

1. 继续把“当前现状”留在最近一版规划文档中。
2. 让 README 兼做现状盘点与操作指南。

## 后续回顾点

1. 若 `docs/architecture/` 继续增长，再按领域拆分子目录。
2. 若某个历史规划仍反复被当作真源引用，继续把稳定部分提炼到 architecture 或 ADR。