---
title: ADR 目录说明
doc_type: adr-index
status: active
owner: repo
last_reviewed: 2026-04-18
source_of_truth: decision-index
---

# ADR 目录说明

当前目录用于保存 Architecture Decision Record（ADR）。

## 使用时机

- 同一主题出现多轮技术取舍，已不适合继续散落在规划文档中。
- 需要长期说明“为什么选这个方案，而不是另一个方案”。
- 决策会持续影响后续实现、测试、迁移或兼容性边界。

## 当前 ADR

- [0001-当前事实统一收口到-architecture.md](0001-%E5%BD%93%E5%89%8D%E4%BA%8B%E5%AE%9E%E7%BB%9F%E4%B8%80%E6%94%B6%E5%8F%A3%E5%88%B0-architecture.md)
- [0002-转写页作为唯一开放工作台.md](0002-%E8%BD%AC%E5%86%99%E9%A1%B5%E4%BD%9C%E4%B8%BA%E5%94%AF%E4%B8%80%E5%BC%80%E6%94%BE%E5%B7%A5%E4%BD%9C%E5%8F%B0.md)
- [0003-execution-文档按角色分层.md](0003-execution-%E6%96%87%E6%A1%A3%E6%8C%89%E8%A7%92%E8%89%B2%E5%88%86%E5%B1%82.md)
- [0004-logical-timeline-acoustic-media-lifecycle.md](0004-logical-timeline-acoustic-media-lifecycle.md)（逻辑时间轴 / 声学媒体 / 阶段 0 行为规格）
- [0005 — 转写层录音模态（SayMore careful speech 向）](转写层录音模态（SayMore careful speech 向）架构方案.md)（文件名含中文；与 README 中「0005」编号对应）
- [0006-dexie-transaction-scope-layer-graph.md](0006-dexie-transaction-scope-layer-graph.md)（Dexie 事务作用域与转写层图访问：声明列全表为第一规范）
- [ADR-007 — `list_units` 大列表句柄分页（内存快照）](adr-ai-list-units-snapshot-handle.md)

## 建议格式

- 背景
- 决策
- 影响
- 被放弃的备选方案
- 后续回顾点

## 编号规则

1. 新 ADR 按三位数递增编号。
2. 文件名使用“编号 + 决策主题”。
3. 已接受决策不覆写原结论；若后续改变，新增 superseding ADR。