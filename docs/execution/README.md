---
title: 执行与工程治理文档索引
doc_type: execution-index
status: active
owner: repo
last_reviewed: 2026-04-21
source_of_truth: governance-index
---

# 执行与工程治理文档索引

> 文档角色：执行过程、验收、门禁与治理台账文档。多数内容是阶段性记录，不作为当前业务实现的事实源。当前产品现状与长期约束请优先查看 `../architecture/`。

## 目录用途

`docs/execution/` 用于保存“怎么执行、怎么验收、怎么守门”的文档，主要包括：

1. 工程治理台账
2. 发布前门禁与风险清单
3. 某一轮改造的执行方案
4. 专项审计、扫描与代码盘点
5. 手工验收脚本、记录与证据归档

## 当前子目录

### 1. 治理规则

- [governance/README.md](./governance/README.md)

### 2. 发布门禁

- [release-gates/README.md](./release-gates/README.md)

### 3. 执行方案

- [plans/README.md](./plans/README.md)

### 4. 审计与盘点

- [audits/README.md](./audits/README.md)

### 5. 归档总览

- [archive/README.md](./archive/README.md)（历史规划 / 发布说明 / 调研、里程碑执行记录、Cursor plan、旧审计快照等）

### 6. 历史验收归档

- [archive/manual-validation/README.md](./archive/manual-validation/README.md)
- [archive/manual-validation/evidence/](./archive/manual-validation/evidence)

## 阅读建议

1. 想看当前工程治理规则：先读 `governance/`。
2. 想看文档治理、CI 守门与 branch protection 口径：先读 `governance/README.md` 与 `governance/GitHub分支保护配置清单.md`。
3. 想追某轮能力是否具备上线条件：先读 `release-gates/`。
4. 想看某个专题如何执行：先读 `plans/`。
5. 想查一次代码盘点、扫描或审计：先读 `audits/`；更早的快照见 `archive/audits-legacy/`。