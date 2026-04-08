---
title: Architecture 文档索引
doc_type: architecture-index
status: active
owner: repo
last_reviewed: 2026-04-08
source_of_truth: current-state-index
---

# Architecture 文档索引

这里存放当前仓库中长期有效、应被视为“现状事实源”的文档。

## 当前文档

- [仓库现状与代码地图.md](%E4%BB%93%E5%BA%93%E7%8E%B0%E7%8A%B6%E4%B8%8E%E4%BB%A3%E7%A0%81%E5%9C%B0%E5%9B%BE.md)
  - 用途：仓库全局现状、代码地图、功能域总表。

- [转写工作区声学分析现状.md](%E8%BD%AC%E5%86%99%E5%B7%A5%E4%BD%9C%E5%8C%BA%E5%A3%B0%E5%AD%A6%E5%88%86%E6%9E%90%E7%8E%B0%E7%8A%B6.md)
  - 用途：转写工作区声学分析能力的当前实现边界、代码挂点与未完成项。

- [术语表.md](%E6%9C%AF%E8%AF%AD%E8%A1%A8.md)
  - 用途：统一 layer / tier / track / lane 等核心术语与边界。

- [provider-neutral-orthography-interop-contract.md](provider-neutral-orthography-interop-contract.md)
  - 用途：正字法互操作的长期兼容性合同。

- [CSS架构与模板复用规范.md](CSS%E6%9E%B6%E6%9E%84%E4%B8%8E%E6%A8%A1%E6%9D%BF%E5%A4%8D%E7%94%A8%E8%A7%84%E8%8C%83.md)
  - 用途：CSS 分层边界、命名规范、治理脚本与面板/对话框自动模板约定。

- [CSS浏览器兼容矩阵.md](CSS%E6%B5%8F%E8%A7%88%E5%99%A8%E5%85%BC%E5%AE%B9%E7%9F%A9%E9%98%B5.md)
  - 用途：CSS 现代特性兼容策略、降级规则与 CI 校验入口。

## 收录原则

- 内容必须对当前实现仍然有效。
- 内容必须适合被 README、代码评审、后续规划反复引用。
- 若文档已经主要变成“当时为什么这么做”，应移回历史规划或发布说明，而不是继续留在这里。

## 不放什么

- 不放阶段性实施拆解。
- 不放一次性修复清单。
- 不放某一轮发布的验证记录。
- 不放仅对当时开发过程有效的临时说明。
