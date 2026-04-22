---
title: ADR 0011 - 写作语料引用 corpusRef 与 citationJump 边界
doc_type: adr
status: proposed
owner: repo
last_reviewed: 2026-04-23
source_of_truth: decision-record
---

# ADR 0011：`jieyu:corpus:v1` / `corpusRef` 与 `citationJump` 共生边界

## 背景

写作块 `corpus-example` 要求 **`corpusRef` 必填**；解析须与转写侧 **同一语义内核**，避免两套 ID 语义。规划见 [写作页开发路线图 · 第四节](../execution/plans/写作页开发路线图-2026-04-22.md)。

**重要**：`src/pages/TranscriptionPage.citationJump.ts` 当前为 **页面级编排**（依赖 UI 回调、转写侧栏状态等），与 [独立工作台开放门槛 · 第四节](../execution/plans/独立工作台开放门槛与复用边界-2026-03-30.md)「禁止以复制页面级实现为起点」**一致地不可**被写作工作台直接 `import` 当作内核。须先抽出 **Citation Resolver Core**（纯解析 + 数据面、无转写 UI 耦合），写作与转写再共同依赖该核心。

## 决策（骨架）

1. **G0–G1 前置：Citation Resolver Core**：从现有 `citationJumpUtils`、DB 读取与 ref 归一逻辑中抽出 **可单测**模块；`TranscriptionPage.citationJump.ts` 改为薄封装调用核心（或并行迁移策略见实现 PR）。**未完成前**，G1 不得承诺「写作侧已可稳定 resolve `corpusRef`」。
2. **URI 文法**：`jieyu:corpus:v1:` 前缀 + 载荷结构在实现前以 Zod schema 与单测冻结。
3. **写作消费面**：写作、`writingDocAdapter`、导出 filter **仅**依赖 Resolver Core 的公开 API，不依赖转写页面 props。
4. **跨项目**：只读 resolve；未挂载项目须可诊断（断裂态 UX）。
5. **迁移**：无 `corpusRef` 的历史数据一次性迁移规则单独成表或附于本 ADR。

## 影响

- `useAiChat` / `writingDocAdapter` / 导出 filter 仅消费冻结后的 `corpusRef` 模型与 Resolver Core API。

## 后续回顾点

1. Resolver Core 合入且转写 `citationJump` 已改调用后，将本 ADR 向 `accepted` 推进；`insert_corpus_example` 全链路可作为同一里程碑或紧随其后。
2. 若转写侧 ID 模型变更，评估 superseding ADR。
