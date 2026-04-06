---
title: Architecture 文档索引
doc_type: architecture-index
status: active
owner: repo
last_reviewed: 2026-04-06
source_of_truth: current-state-index
---

# Architecture 文档索引

这里存放当前仓库中长期有效、应被视为“现状事实源”的文档。

## 当前文档

- [仓库现状与代码地图.md](%E4%BB%93%E5%BA%93%E7%8E%B0%E7%8A%B6%E4%B8%8E%E4%BB%A3%E7%A0%81%E5%9C%B0%E5%9B%BE.md)
  - 用途：仓库全局现状、代码地图、功能域总表。

- [术语表.md](%E6%9C%AF%E8%AF%AD%E8%A1%A8.md)
  - 用途：统一 layer / tier / track / lane 等核心术语与边界。

- [provider-neutral-orthography-interop-contract.md](provider-neutral-orthography-interop-contract.md)
  - 用途：正字法互操作的长期兼容性合同。

## 收录原则

- 内容必须对当前实现仍然有效。
- 内容必须适合被 README、代码评审、后续规划反复引用。
- 若文档已经主要变成“当时为什么这么做”，应移回历史规划或发布说明，而不是继续留在这里。

## 不放什么

- 不放阶段性实施拆解。
- 不放一次性修复清单。
- 不放某一轮发布的验证记录。
- 不放仅对当时开发过程有效的临时说明。