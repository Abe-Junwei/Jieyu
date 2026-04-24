---
title: Architecture 文档索引
doc_type: architecture-index
status: active
owner: repo
last_reviewed: 2026-04-24
source_of_truth: current-state-index
---

# Architecture 文档索引

这里存放当前仓库中长期有效、应被视为“现状事实源”的文档。

## 当前文档

- [仓库现状与代码地图.md](./仓库现状与代码地图.md)
  - 用途：仓库全局现状、代码地图、功能域总表。

- [collaboration-cloud.md](./collaboration-cloud.md)
  - 用途：Supabase 协作云桥接的数据流、工程约束与观测基线。

- [collaboration-runtime-map.md](./collaboration-runtime-map.md)
  - 用途：`collaboration*Runtime` 与 `cloud/*` 的职责分工（生产 vs 门禁）。

- [转写工作区声学分析现状.md](./转写工作区声学分析现状.md)
  - 用途：转写工作区声学分析能力的当前实现边界、代码挂点与未完成项。

- [transcription-deep-link-query-contract.md](./transcription-deep-link-query-contract.md)
  - 用途：`/transcription` 深链 query、`sessionStorage` 返回提示与实现挂点（对齐三页联动 P0-1）。

- [术语表.md](./术语表.md)
  - 用途：统一 layer / tier / track / lane 等核心术语与边界。

- [provider-neutral-orthography-interop-contract.md](./provider-neutral-orthography-interop-contract.md)
  - 用途：正字法互操作的长期兼容性合同。

- [CSS架构与模板复用规范.md](./CSS架构与模板复用规范.md)
  - 用途：CSS 分层边界、命名规范、治理脚本与面板/对话框自动模板约定。

- [CSS浏览器兼容矩阵.md](./CSS浏览器兼容矩阵.md)
  - 用途：CSS 现代特性兼容策略、降级规则与 CI 校验入口。

- [桌面端浏览器支持策略.md](./桌面端浏览器支持策略.md)
  - 用途：产品对外兼容边界（桌面端 Chrome / Edge / Firefox / Safari 及国内双核浏览器的极速模式）；与 CSS 矩阵分工明确。

- [CSS治理执行记录.md](./CSS治理执行记录.md)
  - 用途：记录季度治理执行证据（预算复盘、兼容复核、视觉基线与废弃窗口推进）。

## 收录原则

- 内容必须对当前实现仍然有效。
- 内容必须适合被 README、代码评审、后续规划反复引用。
- 若文档已经主要变成“当时为什么这么做”，应移回历史规划或发布说明，而不是继续留在这里。

## 不放什么

- 不放阶段性实施拆解。
- 不放一次性修复清单。
- 不放某一轮发布的验证记录。
- 不放仅对当时开发过程有效的临时说明。
