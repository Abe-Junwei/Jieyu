---
title: ADR 0003 - execution 文档按角色分层
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-04-06
source_of_truth: decision-record
---

# ADR 0003：execution 文档按角色分层

## 背景

`docs/execution/` 曾把治理台账、发布门禁、执行方案、审计报告和历史验收资产平铺在同一层级，目录噪音高，阅读入口不稳定。

## 决策

1. `docs/execution/governance/` 保存长期治理规则和台账。
2. `docs/execution/release-gates/` 保存发布门禁、风险、封账和 go / no-go 结论。
3. `docs/execution/plans/` 保存专题执行方案与开放条件文档。
4. `docs/execution/audits/` 保存代码盘点、扫描基线和专项审计。
5. 手工验收脚本、记录、证据继续归档到 `docs/execution/archive/manual-validation/`。

## 影响

1. execution 根目录从“文件堆积区”变为导航入口。
2. 旧路径引用需要统一改写，否则会出现 markdown 断链。
3. 同主题的新文档可以按角色直接落位，减少后续整理成本。

## 被放弃的备选方案

1. 继续只靠一个 execution README 做逻辑分组，不做物理拆分。
2. 把执行与治理文档混入 `docs/architecture/`。

## 后续回顾点

1. 若单一主题的门禁/脚本/记录持续增多，再在 `release-gates/` 或 `archive/` 下按主题继续细分。
2. 每轮迁移后都要跑一次旧路径检索，防止遗留相对链接失效。