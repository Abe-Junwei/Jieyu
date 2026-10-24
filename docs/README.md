---
title: 文档索引
doc_type: docs-index
status: active
owner: repo
last_reviewed: 2026-10-24
source_of_truth: navigation-only
---

# 文档索引

本文档说明当前仓库文档的角色边界，避免 README、规划文档和现状文档继续混用。

## 快速导航

1. 想看当前仓库现状与长期有效约束：进入 [architecture/README.md](./architecture/README.md)
2. 想看仍要执行的方案、门禁和台账：进入 [execution/README.md](./execution/README.md)
3. 想看关键决策：进入 [adr/README.md](./adr/README.md)
4. 想看当前试用阶段：进入 [wayfinder/trial-handoff/map.md](./wayfinder/trial-handoff/map.md)（与主路线图冲突时以较新拍板为准）
5. 想看 `frame-ancestors` 与部署响应头落地：进入 [development/csp-frame-ancestors-deployment.md](./development/csp-frame-ancestors-deployment.md)
6. 想看给使用者的使用说明：进入仓库根目录的 [user-guide/README.md](../user-guide/README.md)。`docs/` 继续放工程师文档。

## 文档分层

### 1. 长期有效文档

目录：`docs/architecture/`

用途：一页产品形状，以及按任务打开的术语、协议和合同。

当前入口：

- [architecture/README.md](./architecture/README.md)

### 2. 执行与工程治理

目录：`docs/execution/`

用途：未完成的计划、在用的门禁和台账。

当前入口：

- [execution/README.md](./execution/README.md)

### 3. ADR 目录

目录：`docs/adr/`

用途：当关键技术决策持续增多时，用 ADR 记录“背景、决策、后果、替代方案”。

当前状态：已正式启用，统一从 [adr/README.md](./adr/README.md) 进入。

## 推荐维护方式

- README 只保留启动、测试、构建、主要入口、文档索引。
- 新的长期约束和协议进入 `docs/architecture/`，并在 `AI_QUICKSTART.md` 路由表写明什么任务才读。产品形状只改 `docs/architecture/仓库现状与代码地图.md`。
- 仍要执行的方案写在 `docs/execution/plans/`。做完、被替换或明确不做的长文从工作区删除，需要时看 git 历史。
- 不要新建 `docs/execution/archive/`。
- 使用者站点放在仓库根目录的 `user-guide/`（VitePress，GitHub Pages）。`docs/` 保持工程师文档。
- 每类文档何时更新、何时删除见 [ADR-0051](./adr/0051-every-doc-type-has-an-end.md)；`npm run check:docs-governance` 会拦。
- 当某项设计具有长期复用价值且决策分歧较大时，再新增 ADR。

## 治理命令

- `npm run check:docs-governance`：严格检查当前受治理文档面。
- `npm run report:docs-link-debt`：扫描全仓历史文档链接债务，仅报告不阻塞。