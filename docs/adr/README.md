---
title: ADR 目录说明
doc_type: adr-index
status: active
owner: repo
last_reviewed: 2026-04-24
source_of_truth: decision-index
---

# ADR 目录说明

当前目录用于保存 Architecture Decision Record（ADR）。

## 使用时机

- 同一主题出现多轮技术取舍，已不适合继续散落在规划文档中。
- 需要长期说明“为什么选这个方案，而不是另一个方案”。
- 决策会持续影响后续实现、测试、迁移或兼容性边界。

## 当前 ADR

- [0001-当前事实统一收口到-architecture.md](./0001-当前事实统一收口到-architecture.md)
- [0002-转写页作为唯一开放工作台.md](./0002-转写页作为唯一开放工作台.md)
- [0003-execution-文档按角色分层.md](./0003-execution-文档按角色分层.md)
- [0004-logical-timeline-acoustic-media-lifecycle.md](./0004-logical-timeline-acoustic-media-lifecycle.md)（逻辑时间轴 / 声学媒体 / 阶段 0 行为规格）
- [0005 — 转写层录音模态（SayMore careful speech 向）](./转写层录音模态（SayMore careful speech 向）架构方案.md)（文件名含中文；与 README 中「0005」编号对应）
- [0006-dexie-transaction-scope-layer-graph.md](./0006-dexie-transaction-scope-layer-graph.md)（Dexie 事务作用域与转写层图访问：声明列全表为第一规范）
- [0008-greenfield-indexeddb-export-collab-surface.md](./0008-greenfield-indexeddb-export-collab-surface.md)（绿场库名、导出表面、轨道仅存 Dexie、协同 RLS 身份绑定）
- [0009-greenfield-timeline-single-source-freeze.md](./0009-greenfield-timeline-single-source-freeze.md)（绿场时间轴单一真相冻结；superseding ADR-0004 的运行态 mode 分叉）
- [ADR-007 — `list_units` 大列表句柄分页（内存快照）](./adr-ai-list-units-snapshot-handle.md)
- [0010-writing-workspace-export-runtime.md](./0010-writing-workspace-export-runtime.md)（写作导出运行时：docx/html/tex + **Typst PDF**、预览核、分档；`proposed` 骨架）
- [0011-writing-corpus-ref-and-citation-jump.md](./0011-writing-corpus-ref-and-citation-jump.md)（`corpusRef` 与 `citationJump` 边界；`proposed` 骨架）
- [0012-writing-workspace-dexie-schema.md](./0012-writing-workspace-dexie-schema.md)（写作 Dexie 表与迁移；`proposed` 骨架）
- [0013-writing-lab-graduation-criteria.md](./0013-writing-lab-graduation-criteria.md)（写作 lab 毕业为开放工作台；`proposed` 骨架）
- [0014-writing-grammardoc-vault-boundary.md](./0014-writing-grammardoc-vault-boundary.md)（GrammarDoc ↔ 写作库边界；`proposed` 占位）
- [0015-writing-diagram-offline-supply.md](./0015-writing-diagram-offline-supply.md)（图码与离线供应链；`proposed` 占位）
- [0016-writing-collab-object-mapping.md](./0016-writing-collab-object-mapping.md)（写作 · `project_changes` 等协同对象映射；`proposed` 骨架）
- [0017-jieyu-core-workbench-architecture-adaptation.md](./0017-jieyu-core-workbench-architecture-adaptation.md)（核心工作台架构蓝图采纳与适配：Adopt/Adapt/Reject + 迁移风险清单）
- [0018-transcription-segment-scope-media-ssot.md](./0018-transcription-segment-scope-media-ssot.md)（转写页 segment 作用域媒体 SSOT：图加载后精化 + AI/导出对齐）
- [0019-first-acoustic-import-time-remap.md](./0019-first-acoustic-import-time-remap.md)（占位晋升首绑声学：`L > duration` 时线性压缩 + 平移；删音仍保留坐标）
- [0020-unscoped-canonical-unit-transcription-lane-read-scope.md](./0020-unscoped-canonical-unit-transcription-lane-read-scope.md)（unscoped canonical unit 的转写轨读作用域：单一 resolve 入口与读写边界）
- [0021-zod-jitless-strict-csp.md](./0021-zod-jitless-strict-csp.md)（Zod `jitless` 与严格 `script-src`：禁止 `unsafe-eval` 前提下消除 JIT 探测 CSP 噪声）

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