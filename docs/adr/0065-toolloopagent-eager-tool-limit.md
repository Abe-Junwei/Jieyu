---
title: ADR 0065 - ToolLoopAgent 回合开始时最多给模型 20 个工具，其余按需搜索
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-10-19
source_of_truth: decision-record
depends_on:
  - ./0056-single-agent-runtime-toolloopagent.md
---

# ADR 0065：ToolLoopAgent 回合开始时最多给模型 20 个工具，其余按需搜索

## 状态

accepted。用户 2026-10-19 定为「按业内成熟做法做」。本篇取代 [ADR-0056](./0056-single-agent-runtime-toolloopagent.md) 第 4 条里「每批不超过 5 个」这半句；0056 正文不改。第 4 条后半句「一项能力在 v2 拿不到自己的工具时，不算端到端完成」继续有效。

## 背景

「每批不超过 5 个」出自[迁移评估](../execution/plans/AI智能体运行时迁移评估-2026-10-13.md) R3，没有写出处。它限制的是上线节奏，不是模型一次看到多少工具。[#324](https://github.com/Abe-Junwei/Jieyu/pull/324) 之后，flag 打开时一次请求给模型 41 个工具；开语料分析 44 个；再加外部 MCP 最多 49 个。

业内的通行做法管的是后者：

- OpenAI [函数调用指南](https://developers.openai.com/api/docs/guides/function-calling)：一轮开始时可用的函数少于 20 个（软建议），按自己的评测调；更多的用 [tool search](https://developers.openai.com/api/docs/guides/tools-tool-search) 推迟加载。
- Anthropic [tool search](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool)：超过 30–50 个工具后选对率下降；推迟加载，常用的 3–5 个留在上下文里。
- [函数调用基准](https://liu.diva-portal.org/smash/get/diva2:2072520/FULLTEXT01.pdf)：工具从 4 个到 128 个，五个模型的平均选对率约减半，小模型掉得更多。Jieyu 接的多是 DeepSeek、Qwen 这一档。
- AI SDK 7 自带与 provider 无关的 `toolSearch()` 和工具上的 `deferLoading`，被推迟的工具搜到后下一步才能调用。

## 决策

1. 回合开始时模型看到的工具定义不超过 20 个，`tool_search` 算一个。`createPilotAgent` 超限即抛错，`buildRuntimeV2ToolSpecs` 的测试按最坏情况（语料分析 + 5 个外部 MCP）检查。
2. 其余工具设 `deferLoading`，由 AI SDK 的 `toolSearch()` 按名字和描述查找。不自己写检索、不按 provider 分叉。
3. 开头就给的那组列在 `RUNTIME_V2_EAGER_TOOLS`：选区与单元的读取、层列表、项目统计、最常用的语段编辑、`propose_changes`、`batch_apply`。外部 MCP 和语料查询总是推迟。没有调用频率数据之前按这个分；有了 R0 的本地调用统计再调，调整不需要新 ADR。
4. 发布门槛不再按「批」，按每个 provider 用本机录制的 R1 数据量成功率，不低于旧路径。

## 后果

- 模型想调一个没列出来的工具时要多一步搜索。还没搜就直接调用的，SDK 不执行，结果作为工具错误回给模型。
- 搜到的工具只在本次生成有效，下一回合要重搜。已保存的回合历史里出现被推迟的工具名不影响恢复。
- 默认搜索按英文词切分名字和描述，中文查询多半搜不到；系统提示里提示模型用英文关键词。效果要靠 R1 录制数据验证。
- `tests/fixtures/ai-runtime/*` 里录制的直接调用（`delete_transcription_segment`、`list_layers`）都在开头那组里，回放不受影响。
