---
title: Services 文档索引
doc_type: services-index
status: active
owner: repo
last_reviewed: 2026-04-06
source_of_truth: governance-index
---

# Services 文档索引

> 文档角色：service 层治理与分层约束文档。这里描述的是服务边界、目录职责与迁移方向；如果与当前代码布局不一致，以仓库代码和 `../architecture/` 中的现状文档为准。

## 当前文件

- [SERVICES_LAYERING.md](SERVICES_LAYERING.md)

## 各文档用途

### [SERVICES_LAYERING.md](SERVICES_LAYERING.md)

说明内容：

1. `/services` 与 `src/services` 的职责划分
2. 目标分层结构与依赖规则
3. 迁移策略、命名约定与验证方式
4. 现有服务的建议归属

适合在以下场景阅读：

1. 准备新增一个 service，想先判断应该放在哪一层。
2. 准备继续收敛 `services` / `src/services` 边界。
3. 需要检查某个 service 是否越层依赖。

## 使用原则

1. 这里的文档偏“治理规则”和“目标结构”，不是当前实现现状目录。
2. 若需要描述“仓库现在已经落成什么样”，请更新 `docs/architecture/`。
3. 若未来 service 专题文档增多，可继续在本目录按 `core`、`ui`、`platform` 或专题拆分。