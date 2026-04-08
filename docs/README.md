---
title: 文档索引
doc_type: docs-index
status: active
owner: repo
last_reviewed: 2026-04-06
source_of_truth: navigation-only
---

# 文档索引

本文档说明当前仓库文档的角色边界，避免 README、规划文档和现状文档继续混用。

## 快速导航

1. 想看当前仓库现状与长期有效约束：进入 [architecture/README.md](architecture/README.md)
2. 想看执行方案、门禁、审计与手工验收：进入 [execution/README.md](execution/README.md)
3. 想看 service 分层治理：进入 [services/README.md](services/README.md)
4. 想看关键决策：进入 [adr/README.md](adr/README.md)
5. 想追历史规划、发布或调研：留在 `docs/` 根目录按 `规划-*`、`发布说明-*`、`调研-*` 查阅

## 文档分层

### 1. 长期有效文档

目录：`docs/architecture/`

用途：保存当前仍有效、可长期引用的现状文档、术语文档和兼容性合同。

当前入口：

- [architecture/README.md](architecture/README.md)

### 2. 历史规划文档

范围：`docs/规划-*`，以及个别保留历史迁移语境的方案文档。

用途：保留当时的目标、约束、取舍与执行背景。

规则：

- 不再作为当前实现的事实源。
- 若与现状冲突，以 `docs/architecture/` 和代码为准。
- 若需要描述“当前已落地结果”，应补到 `docs/architecture/` 或对应发布说明，而不是继续堆在旧规划正文里。

### 3. 发布说明

范围：`docs/发布说明-*`

用途：保留每轮功能收口、回归验证、影响面与边界记录。

当前文件：保留在 `docs/` 根目录，按 `发布说明-*` 命名查阅。

### 4. 调研文档

范围：`docs/调研-*`

用途：保留外部资料调研、数据源评估、方案对比与采纳依据。

当前文件：

- [调研-信号处理与语音处理可借用技术路线-2026-04-08.md](调研-信号处理与语音处理可借用技术路线-2026-04-08.md)
- [调研-低资源语言强制对齐与成熟技术路线-2026-03-29.md](调研-低资源语言强制对齐与成熟技术路线-2026-03-29.md)
- [调研-前500语言与正字法开放数据方案-2026-04-04.md](调研-前500语言与正字法开放数据方案-2026-04-04.md)
- [调研-低资源与濒危语言NLP技术路线-2026-07.md](调研-低资源与濒危语言NLP技术路线-2026-07.md)

### 5. 执行与工程治理

目录：`docs/execution/`

用途：执行台账、CI/分支保护、工程治理约定等。

当前入口：

- [execution/README.md](execution/README.md)

### 6. Services 专题文档

目录：`docs/services/`

用途：保存 service 层治理、分层规则与迁移约束类文档。

当前入口：

- [services/README.md](services/README.md)

### 7. ADR 目录

目录：`docs/adr/`

用途：当关键技术决策持续增多时，用 ADR 记录“背景、决策、后果、替代方案”。

当前状态：已正式启用，统一从 [adr/README.md](adr/README.md) 进入。

## 推荐维护方式

- README 只保留启动、测试、构建、主要入口、文档索引。
- 新的当前事实、长期约束、协议文档，优先进入 `docs/architecture/`。
- 新需求、新路线、新批次拆解，进入 `docs/规划-*`。
- 一轮实现完成后的收口记录，进入 `docs/发布说明-*`。
- 当某项设计具有长期复用价值且决策分歧较大时，再新增 ADR。

## 治理命令

- `npm run check:docs-governance`：严格检查当前受治理文档面。
- `npm run report:docs-link-debt`：扫描全仓历史文档链接债务，仅报告不阻塞。