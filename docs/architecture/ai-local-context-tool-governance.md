---
title: AI 本地上下文工具（localContext）治理说明
doc_type: architecture
status: active
owner: repo
last_reviewed: 2026-05-08
source_of_truth: current-state
---

# AI 本地上下文工具（localContext）治理说明

本页为 **归档计划与审查材料** 中引用的锚点文档；**实现真源**在代码与下列文书。

## 代码入口（当前）

- 工具名 / 调用 / 结果类型：`src/ai/chat/localContextToolTypes.ts`
- Scope 与指标名归一：`src/ai/chat/localContextToolScopeNormalize.ts`
- 执行：`src/ai/chat/localContextToolExecutors.ts`
- 用户可见格式化与截断：`src/ai/chat/localContextToolFormatters.ts`
- 解析与对外门面：`src/ai/chat/localContextTools.ts`

## 相关架构与审查

- Send-turn 管道总览：[ai-chat-send-turn-pipeline.md](./ai-chat-send-turn-pipeline.md)
- 产品向规划（语料 / Source Set 等）：`docs/execution/plans/AI智能体-垂直产品化架构与落地方案-2026-05-05.md`
- 循环依赖门禁：`npx madge --circular --extensions ts,tsx src`（目标 **0**；拆边方式见 `docs/execution/audits/CODE_REVIEW_REPORT_2026-05-07.md` §1.3）

## 维护注意

- 新增工具名时同步 **`localContextToolTypes`** 与 `LOCAL_CONTEXT_TOOL_NAMES`（门面内集合）。
- 避免在 `localContextTools` ↔ `executors` / `formatters` 之间再引入 **仅类型无法拆边** 的运行时回边；优先把共享常量放在 `useAiChat.config` 或独立无环模块。
