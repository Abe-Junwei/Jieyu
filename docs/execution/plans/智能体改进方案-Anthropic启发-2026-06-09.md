---
title: 智能体改进方案 — Anthropic Engineering 启发
doc_type: execution-plan
status: active
owner: ai-governance
last_reviewed: 2026-09-02
reconciled_with: master-roadmap-anthropic-review-2026-06-09
source_of_truth: execution-plan
depends_on:
  - ./解语-主路线图-master-roadmap-2026-06-01.md
  - ./Agent运行时架构补强-本地优先落地方案-2026-06-01.md
  - ./AI智能体-战略规划与下一步-2026-05-07.md
  - ../specs/ai-agent-loop-reliability-improvements/requirements.md
  - ../specs/ai-agent-loop-reliability-improvements/design.md
  - ../audits/ai-agent-architecture-risk-assessment-2026-05-17.md
external_refs:
  - https://www.anthropic.com/engineering
  - https://www.anthropic.com/engineering/building-effective-agents
  - https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
  - https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents
  - https://www.anthropic.com/engineering/writing-tools-for-agents
  - https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
  - https://www.anthropic.com/engineering/multi-agent-research-system
  - https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills
---

# 智能体改进方案 — Anthropic Engineering 启发（2026-06-09）

> **背景**：对照 [Anthropic Engineering](https://www.anthropic.com/engineering) 系列文章，将业内可复用实践映射到解语现有 **受约束 agent loop + 领域本地工具** 架构，形成可执行 backlog。  
> **全局排期**：本文 **P0–P5** 与 [解语主路线图](./解语-主路线图-master-roadmap-2026-06-01.md) 切片 **A4、A14** 及 [Agent 运行时架构补强](./Agent运行时架构补强-本地优先落地方案-2026-06-01.md) **A6–A10** 对齐；不替代上述文档，与之互补。  
> **代码真源**：`src/ai/chat/agentLoop*`、`localContextTools*`、`scripts/agent-evals/`、`src/hooks/ai/useAiChat.agentLoopRunner.ts`。  
> **不引入**：通用 multi-agent swarm、Google ADK 框架、Model Armor SaaS（与主路线图拍板一致）。

## 0. 如何使用本文

| 你想知道 | 看这里 |
| --- | --- |
| 为什么要改、成功长什么样 | §1 定位与成功标准 |
| 现在做到哪了 | §2 现状基线 |
| 分几步做、每步验收 | §3 分阶段计划（P0–P6） |
| PR 怎么排 | [主路线图 §2.2](./解语-主路线图-master-roadmap-2026-06-01.md#22-agent-架构轨--合并进度与执行波次2026-06-10)（canonical）；本文 §4 为历史周计划参考 |
| 明确不做啥 | §5 范围外 |
| 与主路线图切片对应 | §6 切片映射表 |
| 主路线图审查对账结论 | §10 审查对账 |

---

## 1. 定位与成功标准

### 1.1 产品定位（不变）

解语 AI 是 **转写域受限的 workflow + agent 混合体**：

- **Workflow 层**：`resolveLocalToolRoutingPlan`、policy gate、vertical workflow envelope
- **Agent 层**：`runAgentLoop`（工具反馈循环，`maxSteps` 默认 6）
- **非目标**：Claude Code 级全自主编码 agent；跨域 general-purpose 多智能体编排

Anthropic 将 agent 定义为「LLM 在循环中自主使用工具」；解语在此基础上增加 **领域路由、策略门、步数/token 硬上限**，属于 *Building effective agents* 中的 **受约束 agent**，而非开放式 coding agent。

### 1.2 全局成功标准

| 维度 | 度量 | 目标 |
| --- | --- | --- |
| 可靠性 | search 0 / detail 不存在 / maxSteps | 用户可见 clarify 或 replan，非静默 abort |
| 上下文 | 6 步 loop 内 token 与质量 | `historyCharBudget` 动态收缩；旧 tool result 可压缩 |
| 工具 ACI | 选错工具、冗余调用 | eval 含 outcome + 调用效率基线 |
| 可观测 | 决策可回放 | `agentRunId` / `traceId` 链 + trajectory 自动断言（A14） |
| 安全 | blast radius | effort scaling + write gate（A6–A7） |
| 发布 | Stage B 接 AI 前置 | A4 三 flag 验证后默认 `true` |

### 1.3 Anthropic 原则 → 解语落位

| Anthropic 实践 | 解语落位 | 本文阶段 |
| --- | --- | --- |
| 简单可组合（非重型框架） | 保持 `agentLoop` + `localContextTools` | 全阶段 |
| Evaluator-optimizer（反馈改策略） | `agentLoopReplanning` + quality gate | P0（已有代码） |
| Context engineering（JIT、compaction） | `contextBudget`、tool result clearing | P1 |
| Tool ACI（少而精、可行动错误） | `localContextToolExecutors`、catalog | P2 |
| Eval harness（outcome + transcript） | `scripts/agent-evals`、A14 | P3 |
| Long-running harness（progress、smoke） | session memory、checkpoint、handoff e2e | P4 |
| Agent Skills（渐进披露） | `promptContext` tiered + skill 目录 | P5 |
| Containment（权限、effort scaling） | A6–A7、effort scaling | P1、P6 |
| Multi-agent（仅高并行研究类） | **不采用**；只读 parallel 留 A12/A13 | — |

---

## 2. 现状基线（2026-06-01 代码核对）

### 2.1 已落地（flag 默认 `false`）

Spec：[ai-agent-loop-reliability-improvements](../specs/ai-agent-loop-reliability-improvements/tasks.md) 四阶段均已 ✅ landed。

| 能力 | 代码 | Feature flag |
| --- | --- | --- |
| 闭环重规划 P0 | `src/ai/chat/agentLoopReplanning.ts`、`agentLoopClarify.ts` | `aiAgentLoopClosedLoopReplanningEnabled` |
| 工具结果质量门 P1 | `src/ai/chat/agentLoopResultQuality.ts`、`formatters/agentLoopPayload.ts` | `aiAgentLoopToolResultQualityGateEnabled` |
| 上下文预算再分配 P1 | `src/ai/chat/contextBudget.ts`、`agentLoopRunner.ts` | `aiAgentLoopContextBudgetRecalculationEnabled` |
| Explainability P2 | `agentLoopExplainability.ts`、`aiChatCardMessages` | 随 replanning flag |

### 2.2 主路线图硬阻塞

[主路线图 §2](./解语-主路线图-master-roadmap-2026-06-01.md)：**A4 完成前 Stage B 不接 AI 工具路径**。三 flag 须逐项验证（spec vitest + `check:agent-evals:smoke` + 定向 e2e）后方可切默认 `true`，**非简单改布尔值**。

### 2.3 已知缺口（对照 Anthropic + 架构风险审查）

| 缺口 | 来源 | 本文处理 |
| --- | --- | --- |
| 开环规划（已编码 replan，未放量） | 风险审查 §2.2 | P0 |
| `trajectorySignals` 仅声明式元数据 | A14 待做 | P3 |
| 工具 20+，部分重叠 | *Writing tools for agents* | P2 |
| 领域知识在巨型 prompt | *Agent Skills* | P5 |
| 运行时 tool 参数相似度去重 | 风险审查 P2 | **范围外**（另 spec） |
| Multi-agent 编排 | Anthropic Research | **范围外**（路线图拍板） |

---

## 3. 分阶段改进计划

### 总览

| 阶段 | 名称 | 粒度 | 依赖 | 阻塞 |
| --- | --- | --- | --- | --- |
| **P0** | A4 可靠性 flag 收口 | L（~2d） | 已有 spec | **硬阻塞 Stage B AI** |
| **P1** | Context 工程深化 | M（~1.5d） | P0 至少 replanning on | 可与 P0 并行开发 |
| **P2** | 工具 ACI 优化 | M（~1.5d） | P0 | B4/B7 接工具质量 |
| **P3** | A14 Eval trajectory 升级 | M（~1d） | A8 部分可并行 | C1 前置 |
| **P4** | 长程 session harness | M（~1d） | P0 + session memory | handoff 强化 |
| **P5** | Agent Skills 渐进披露 | M（~1d） | P1 | 降 context rot |
| **P6** | 安全轨 A6–A10 | L（多切片） | 主路线图 | B4/B5 写工具硬阻塞 |

---

### P0 — A4：三 flag 逐项验证与默认开启

**Anthropic 对应**：[Demystifying evals](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) — regression suite 近 100% 再放量；[Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) — 先测再复杂化。

#### P0.1 `aiAgentLoopClosedLoopReplanningEnabled`

**验证矩阵**

| 场景 | 期望 outcome | 验证 |
| --- | --- | --- |
| `search_units` count=0 | `clarify` + `agentLoopSearchNoResults`，非 abort | `useAiChat.agentLoopRunner.test.ts` |
| `get_unit_detail` unit not found | `replan` → `queryFamily: search` | `agentLoopReplanning.test.ts` + runner |
| detail replan 结束 | append `agentLoopDetailUnitNotFound` | runner detail replan test |
| flag off | 现网 `!ok` 即停 | `useAiChat.agentLoopRunner.flagOff.test.ts`（若无则补） |

**E2E（必跑）**

- `tests/e2e/aiAgentLoopHandoffAfterReload.spec.ts`
- 扩展：搜索无结果时 UI 可见 clarify 文案（经 `aiChatCardMessages`）

**放量步骤**

1. `VITE_AI_AGENT_LOOP_CLOSED_LOOP_REPLANNING_ENABLED=1` 本地 dogfood
2. staging 默认 `true`，prod 仍 `false`
3. `check:agent-evals:smoke` + `check:agent-evals:trace` 绿
4. `featureFlags.ts` 默认改 `true`；更新 release evidence

#### P0.2 `aiAgentLoopToolResultQualityGateEnabled`

| 场景 | 期望 continuation |
| --- | --- |
| 空 matches | `quality.annotations` 含 `empty_result` |
| search count=0 | `search_no_results` |
| tool `!ok` | `tool_failed` |
| flag off | payload 与现网逐字节一致 | `agentLoopPayload.qualityGateOff.test.ts` |

**协同**：quality gate 须在 replanning 决策之后写入 continuation。

#### P0.3 `aiAgentLoopContextBudgetRecalculationEnabled`

| 场景 | 期望 |
| --- | --- |
| step 4/6 | `historyCharBudget` < step 1 |
| `recentRounds` | 始终 ≥ 2 |
| 多步累积 | `aiArchitectureIntegration.test.ts` 无回归 |

**观测**：release evidence 追加每步 `perStepInputTokens`、`remainingRatio`。

#### P0 DoD（A4 切片关闭）

- [x] 三 flag 默认 `true`（dogfood/staging/prod；local/DEV 仍 false，可用 `VITE_AI_AGENT_LOOP_*` 覆盖）
- [x] `npm run typecheck` 0 err
- [x] `npx vitest run src/ai/chat/agentLoop*` + `useAiChat.agentLoopRunner.test.ts` 全绿
- [x] `npm run check:agent-evals:smoke` + `check:agent-evals:trace` 绿（2026-09-02：trace 17/17，auditTracePassed=true）
- [x] 定向 e2e：`aiAgentLoopHandoffAfterReload` + ≥1 clarify 路径（chromium 3/3）
- [x] [ai-agent-loop-reliability-improvements tasks](../specs/ai-agent-loop-reliability-improvements/tasks.md) 增 A4 收口记录；主路线图 A4 标 ✅

---

### P1 — Context 工程深化

**Anthropic 对应**：[Effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) — JIT 检索、tool result clearing、最小高信号 token；[Multi-agent research](https://www.anthropic.com/engineering/multi-agent-research-system) — effort scaling。

#### P1.1 Tool result clearing（compaction 轻量版）

**问题**：6 步 loop 内早期完整 tool JSON 占满 attention budget（context rot）。

**方案**（`agentLoopRunner.ts` 构建 continuation 前）：

1. 仅保留 **最近 1 步** 完整 tool result
2. 更早步骤压缩为摘要，例如：`{ step: 1, tool: 'search_units', summary: 'count=3, topIds=[...]' }`
3. 保留 `traceId` / 审计所需字段

**落位**

| 文件 | 改动 |
| --- | --- |
| `src/ai/chat/formatters/agentLoopPayload.ts` | `compactHistoricalToolResults()` |
| `src/ai/chat/agentLoopRunner.ts` | 每步 continuation 前调用 |
| `src/ai/chat/agentLoopResultQuality.ts` | 摘要规则与 quality annotation 对齐 |

**Flag**：`aiAgentLoopToolResultCompactionEnabled`（或并入 context budget flag，Implement 前在 SDD 二选一）

**测试**：`agentLoopPayload.compaction.test.ts` — 6 步 fixture，payload 字符数单调不增。

**原则**：先 maximize recall（count/ids/error），再迭代 precision。

#### P1.2 JIT 引用式上下文

**方案**

1. **Routing / tool guide**（`localToolSlotResolver.ts`、`buildLocalContextToolGuide`）：
   - count → `get_project_stats` / `diagnose_quality`
   - 找句段 → `search_units`（limit/offset）→ `get_unit_detail`
   - 禁止「先 list 全项目再筛选」
2. **默认参数 poka-yoke**：`search_units` 默认 `limit: 20`；`list_units` 需显式 `scope` + `limit`，否则可行动错误
3. **concise / detailed 响应**（`localContextToolExecutors.ts`）：concise 只返 `unitId`、`label`、`speakerName`

**测试**：扩展 `localContextTools.test.ts`；agent-evals `rag-unit-to-segment-01`。

#### P1.3 Effort scaling（按 query 复杂度缩放步数）

| queryFamily | 建议 maxSteps |
| --- | --- |
| `count` / 单 metric | 2 |
| `search` / `detail` | 4 |
| `selection` / workflow envelope | 6 |

**落位**：`agentLoop.ts` — `resolveEffectiveMaxSteps()`；flag `aiAgentLoopEffortScalingEnabled`。

#### P1 DoD

- [ ] 6 步场景 continuation 总字符较现网降 ≥30%（基准 fixture）
- [ ] golden eval 无「list 全项目」路径
- [ ] `check:architecture-guard` 无新增 hotspot

---

### P2 — 工具 ACI 优化（Eval 驱动）

**Anthropic 对应**：[Writing tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents) — 少而精、namespace、可行动错误、transcript 迭代。

#### P2.1 工具集审计与 catalog

**审计候选**（分析优先，删除需 eval 通过）

| 工具 A | 工具 B | 建议 |
| --- | --- | --- |
| `list_units` | `search_units` | 保留 search；list 降权/高级场景 |
| `list_notes` | `list_notes_detail` | 倾向 `search_notes` |
| `get_project_stats` | `diagnose_quality` | 文档明确：stats=计数，diagnose=质量维度 |

**产出**：`docs/architecture/ai-local-tool-catalog-v1.md`（A10 `AiToolCatalog` 前哨 SSOT）。

#### P2.2 可行动错误响应

```ts
// 目标形态（示例）
{
  ok: false,
  error: 'unit_not_found',
  hint: 'Use search_units with scope=current_track first.',
  suggestedTool: 'search_units',
  suggestedArgs: { scope: 'current_track' }
}
```

**落位**：`localContextToolExecutors.ts`；`evaluateReplanningNeed` 可读 `suggestedTool` 减少字符串硬匹配。

#### P2.3 Eval 驱动迭代闭环

1. 从 `scripts/agent-evals/cases/workflow-*`、`rag-*` 抽 15–20 条强任务
2. 跑 `run-cases.mjs`，记录 audit NDJSON transcript
3. 统计：`tool_call_count`、`redundant_calls`、`wrong_tool`、`token_per_task`
4. 迭代 tool description / `buildLocalContextToolGuide`
5. held-out test set 防过拟合

**落位**：`scripts/agent-evals/metrics/`（新）；`suite.v1.json` 增 `tier: capability`。

#### P2 DoD

- [ ] catalog 文档与 `LOCAL_CONTEXT_TOOL_NAMES` 一致
- [ ] `recovery_path` eval ≥90%
- [ ] workflow case 平均 tool calls 基线写入 release evidence

---

### P3 — A14：Eval trajectory 升级

**Anthropic 对应**：[Demystifying evals](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) — transcript + outcome；capability vs regression 分拆。

#### P3.1 Suite 二分

| Suite | 目的 | 通过率目标 | tier |
| --- | --- | --- | --- |
| `regression` | 防退化 | ~100% | smoke + full |
| `capability` | 爬坡 | 60–80% 初期 | full only |

**迁移示例**：`policy-deny`、`no-silent-write`、`i18n-*` → regression；`adversarial-*`、`rag-citation-mismatch` → capability。

#### P3.2 Trajectory 自动断言

**现状**：`trajectorySignals` 仅集合包含检查（见 [agent-evals README](../../../scripts/agent-evals/README.md)）。

**目标**（对齐 [架构补强 §8 A14](./Agent运行时架构补强-本地优先落地方案-2026-06-01.md)）：

1. `run-agent-evals.mjs` 解析 `ai-tool-decision-audit-export-v1.ndjson`
2. 按 case 断言：`tool_selection`、`recovery_path`（replan/clarify）、`gate_correctness`
3. 链式 `agentRunId`（A8 完成后强化； interim 用 `traceId`）

#### P3.3 Outcome grader（终态校验）

| Case | Outcome 检查 |
| --- | --- |
| `workflow-segment-qa-select-yuduan-01` | resolver 输出正确 `unitId` |
| `rag-citation-mismatch-01` | citation `sourceId` 与 unit 一致 |
| `policy-deny-01` | 无 Dexie 写副作用 |

**实现**：case JSON 增 `outcomeVerifier` → vitest helper 或轻量脚本。

#### P3 DoD

- [ ] `:trace` 含真实 trajectory 断言
- [ ] CI smoke 只跑 regression
- [ ] C1 对外检查可抽样 trajectory report

---

### P4 — 长程 Session Harness

**Anthropic 对应**：[Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) — progress 工件、session 开头 smoke、增量推进、干净状态。

#### P4.1 Session 恢复协议

**对标** `claude-progress.txt` → 解语 `sessionMemory` + `pendingAgentLoopCheckpoint`。

**恢复固定步骤**（`useAiChat.agentLoopResumeSession.ts` 文档化 + 测试）：

1. 读 checkpoint / `taskSession`
2. 验证 `currentRoutingPlan` 与 scope 仍有效（项目未切换）
3. `waiting_clarify`：展示上次 clarify，不自动续跑
4. `running`：从 `loopStep` 续跑，带 **当前** `routingPlan`（非入口 plan）

#### P4.2 「干净状态」契约

每 loop 结束须写入：`executionState`、`lastToolSummary`（一步可读摘要）、`explainability`。禁止无终态 half-done reload 续跑。

#### P4.3 端到端自证

- workflow answer 前须有 evidence / citation 校验
- `isAnswerReadyFor*` 与 quality gate 双重守卫
- eval：未验证不得标 passes（对标 long-running harness 的 `feature_list.json`）

#### P4 DoD

- [ ] reload 后 4 态（done / clarify / error / running）单测 + e2e
- [ ] session memory 合同写入 `docs/architecture/` 或 AI 会话管理方案

---

### P5 — Agent Skills 渐进披露

**Anthropic 对应**：[Agent Skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills) — metadata → SKILL.md → 链接文件 → 可执行脚本。

#### P5.1 目录结构（建议）

```
docs/agent-skills/
  transcription-segment-qa/
    SKILL.md
    search-then-detail.md
  annotation-qa/
    SKILL.md
  elan-flex-export/
    SKILL.md
```

#### P5.2 加载策略

| 层级 | 进 system prompt | 时机 |
| --- | --- | --- |
| L0 | 各 skill `name` + `description` | 每 turn |
| L1 | 命中 intent 的 `SKILL.md` 全文 | routing 后 |
| L2 | 子文件 | tool 失败 / workflowId 匹配 |

**落位**：`src/ai/chat/promptContext.ts` — 削减 `buildLocalContextToolGuide` 巨型段落。

#### P5.3 与 B12 MCP prompts 对齐

A12 workflow registry 的 `prompts/list` 引用同一 skill 文件，避免双份真源。

#### P5 DoD

- [ ] ≥3 个垂直 workflow 有 skill 包
- [ ] `promptContext.tiered.test.ts` 断言 token 下降
- [ ] `check:docs-governance` 登记 skills 路径

---

### P6 — 安全轨（主路线图 A6–A10）

**Anthropic 对应**：Containment、Beyond permission prompts。

| 切片 | 智能体相关产出 | 与 P0–P5 关系 |
| --- | --- | --- |
| A6 | 工业三开关 evidence | 含 A4 flag 放量记录 |
| A7 | `toolWriteGate` + per-tool policy | `policy-deny/ask` eval 执行真源 |
| A8 | `agentRunId` 贯穿 loop step | P3 trajectory、P4 resume |
| A9 | `semanticGuard` | `adversarial-*` eval |
| A10 | `AiToolCatalog` + `commitToolEffects` | P2 catalog SSOT |

**不提前做**：A13 并行 subagent；A12 parallel readonly 仅限只读场景。

---

## 4. 执行队列（建议 PR 顺序）

> **排期真源（2026-06-10）**：执行波次与切片状态以 [解语主路线图 §2.2](./解语-主路线图-master-roadmap-2026-06-01.md#22-agent-架构轨--合并进度与执行波次2026-06-10) 为准。本节保留 Anthropic 周计划原文，供对照 P0–P5 需求细节。

```
Week 1
  PR-A4-1  replanning flag 验证 + staging 默认 true
  PR-A4-2  quality gate flag 验证
  PR-A4-3  context budget flag 验证 + A4 关闭

Week 2（可与 Week 1 尾部并行）
  PR-P1-1  tool result compaction
  PR-P1-2  JIT 默认参数 + concise response
  PR-P1-3  effort scaling

Week 3
  PR-P2-1  可行动错误 + catalog 文档
  PR-P3-1  eval suite 二分 + trajectory 自动断言
  PR-P3-2  outcome verifier（3 条 golden case）

Week 4
  PR-P4-1  session resume 协议 + e2e
  PR-P5-1  首批 3 个 Agent Skills + promptContext 接线

并行（架构轨，按主路线图）
  A6 → A7 → A8 → A10（阻塞 B4 写工具）
  A14 与 A8 同步推进
```

### 每 PR 必跑验证

```bash
npm run typecheck
npx vitest run <touched tests>
npm run check:agent-evals:smoke
npm run check:architecture-guard
# 触及 AI UI / handoff 时：
npm run test:e2e:chromium -- tests/e2e/aiAgentLoopHandoffAfterReload.spec.ts
```

---

## 5. 范围外（防膨胀）

| 项 | 原因 |
| --- | --- |
| 通用 multi-agent orchestrator | 主路线图拍板禁止 |
| 运行时 tool 参数相似度去重 | 风险审查 P2，另 spec |
| Model Armor / 外部 MCP 默认开启 | A9 + B11 前不接 |
| 重写 agent 框架 | Anthropic：保持简单 loop |
| 为 eval 造脱离 Dexie 的 sandbox | 案例须基于现有 vitest/fixture 基建 |

---

## 6. 切片映射表

| 本文阶段 | 主路线图 | 架构补强 | 关联 spec |
| --- | --- | --- | --- |
| P0 | **A4** | — | ai-agent-loop-reliability-improvements |
| P1 | A4 延伸 + **A12** `parallel(readonly)` | A12.3 | compaction Implement 前可选 |
| P2 | — | **A10** catalog + readonly batch | — |
| P3 | **A14** | §8 | — |
| P4 | A4 + 会话管理 + **A12 checklist** | A13 checkpoint | ai-conversation-management |
| P5 | — | B12 prompts | — |
| P6 | A6–A10 | 全文 | **agent-runtime-security-write-gate** 等 SDD |

---

## 7. 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| flag 全开回归 | 逐项放量 + regression suite ~100% |
| compaction 丢上下文 | recall 优先；复杂 trace 人工 review |
| 工具合并破坏现网 | shadow catalog；eval 通过再 deprecate |
| ChatWindow hotspot（96%） | B4 走独立 controller，禁止注入 Orchestrator |
| eval 过拟合固定轨迹 | outcome grader + 多 trial 通过率 |

---

## 8. 里程碑总表

| 里程碑 | 条件 |
| --- | --- |
| **M1 A4 关闭** | 三 flag 默认 true；smoke + handoff e2e 绿 |
| **M2 Context 就绪** | compaction + effort scaling 上线；6 步 payload 缩小 |
| **M3 工具可评测** | catalog 文档 + 可行动错误 + metrics 基线 |
| **M4 Eval 升级** | trajectory 自动断言 + suite 二分 |
| **M5 长程可靠** | 4 态 resume 合同 + e2e |
| **M6 Skills** | 3 垂直 skill + tiered prompt |
| **M7 Stage B 解锁** | M1 + A6/A7/A10 证据（写工具） |

---

## 10. 审查对账（2026-06-09）

> 来源：对照 Anthropic Engineering 7 篇核心文章对 [解语主路线图](./解语-主路线图-master-roadmap-2026-06-01.md) 的审查结论；本节为**采纳后的修订真源**，Implement 前以本节为准调和冲突。

### 10.1 覆盖率与总体结论

主路线图对 Anthropic 核心实践的映射约 **78%**（workflow/agent 区分、eval 双轨、context engineering、containment 三层、long-running harness、Skills 渐进披露均已覆盖）。**无需大改切片拓扑**；重点在 A7/A12/B11 的 SDD 细化与 P1–P5 对账锚点。

### 10.2 已对齐项（维持现状）

与审查「§一 已良好对齐」一致：A4/A12/A14、A6–A9、P1–P5 规划方向正确。补充：**A12.3 `parallel(readonly)` + A13 parallel 样本** 已覆盖 Anthropic *Advanced Tool Use* 中「代码/声明式编排」的 Phase 1（浏览器内 **TS/workflow**，非 Python 沙箱）。

### 10.3 采纳的强化项（修订后）

| 原建议 | 裁定 | 落位 |
| --- | --- | --- |
| Programmatic Tool Calling | **部分采纳** | A12 `parallel(readonly)` = 解语版编排；A10 增 `executeReadonlyToolBatch`（子任务，非新切片 A15） |
| Approval fatigue → 零弹窗 | **改表述采纳** | A7 SDD：只读自动 allow；超 scope/destructive 自动 block；写操作用 **A11 结构化 preview-diff**，非 bash 式权限对话框 |
| Feature list 防虚假完成 | **采纳（workflow 化）** | A12 `workflowCompletionChecklist`（4–8 步）；P4 干净状态：未闭合不得 `answer_ready` |
| MCP 连接前 schema 隔离 | **采纳并上调 P0** | B11 SDD 硬约束：trust 前 schema 不进 LLM；未登记 server 零暴露；首次连接经 A9 扫描 |
| P1–P5 无主路线图切片 ID | **采纳（轻量）** | 主路线图 §2 脚注 + A4/A7/A10/A12/A14 验收列交叉链接；**不新增 A15/A16** |
| pass@k / pass^k | **采纳 P2** | A14 / P3 eval 非确定性度量 |

### 10.4 明确不采纳或降调

| 原建议 | 原因 |
| --- | --- |
| 「零新增用户确认弹窗」作 Stage B 硬门槛 | 与 [ai-agent-runtime-security-local-first](../../architecture/ai-agent-runtime-security-local-first.md)「证据型、人在环」及 A11 写预览冲突 |
| 克隆 200 条 `feature_list.json` | 解语 B4/B5 适用 **workflow 级 checklist**，非多 session 建站 harness |
| Cowork 全 VM 隔离类比 | 解语等价物为 **浏览器 local-first scope + 无任意代码执行 + Last Mile gate** |

### 10.5 本方案章节修订（相对初版）

| 章节 | 修订 |
| --- | --- |
| P1 | 与 A12 `parallel(readonly)` 对齐命名；compaction 仍为 A4 延伸 |
| P2 | catalog 与 A10 `executeReadonlyToolBatch` 前哨衔接 |
| P4 | 增 workflow checklist 闭合检查（联动 A12） |
| P6 / A7 | 指向 [agent-runtime-security-write-gate](../specs/agent-runtime-security-write-gate/) SDD |
| §6 映射表 | A12 增 checklist；A10 增 readonly batch |

### 10.6 文档动作清单（本次已执行）

- [x] 本文 §10 审查对账
- [x] 主路线图 §2 脚注 + A7/A12/A10/A14 验收交叉链接
- [x] `agent-runtime-security-write-gate` SDD 三件套（draft，Implement 前）

---

## 9. 变更记录

| 日期 | 变更 |
| --- | --- |
| 2026-06-09 | 初版：Anthropic Engineering 对照 + P0–P6 可执行 backlog |
| 2026-06-09 | §10 审查对账：吸收主路线图审查修订；链 write-gate SDD |

---

*Created: 2026-06-09 · Owner: ai-governance · 下次对账：A4 收口或 A7 SDD Implement 时*
