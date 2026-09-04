---
title: 解语主路线图（master plan · 切片执行）
doc_type: execution-plan
status: active
owner: repo
last_reviewed: 2026-09-04
---

> **本文是产品级排期的唯一可执行真源**：North Star + 切片化 backlog（每片功能完整落地）+ 各域子计划索引。
> 现状事实以 [仓库现状与代码地图](../../architecture/仓库现状与代码地图.md) 为准；流程纪律以 [单人 AI 协作拍板决策](./单人AI协作改进计划-拍板决策-2026-05-11.md) 与 [AI_QUICKSTART](../../../AI_QUICKSTART.md) 为准。
> 取代旧的索引式 roadmap 与时间盒型 [16 周路线图（已 superseded）](./16周执行版路线图-2026-04-12.md)。

## 0. 如何使用本文

| 你想知道 | 看这里 |
| --- | --- |
| 产品要做成什么 | §1 North Star |
| 怎么排（阶段与依赖） | §2 切片总览 + 依赖序 |
| 现在做哪一片、怎么验收 | §3 切片清单（含落位锚点 + DoD） |
| Agent 架构轨下一刀排哪 | §2.2 执行波次 + §3 Stage A 状态列 |
| 一个切片"做完"的统一标准 | §2.1 切片落地定义（DoD） |
| 哪些文档不能当路线图用 | §4 适用边界与显式废弃 |
| 怎么保持本文不过期 | §5 对账规则 |

## 1. North Star（产品定位）

解语是 **本地优先（local-first）的桌面浏览器多工作台**，面向濒危语言研究与协作。

- **形态**：纯 Web 应用（React + Vite + Dexie/IndexedDB + Worker/WASM）；桌面浏览器窗口，非移动 / 非 WebView。
- **数据真源**：用户浏览器本地（IndexedDB）；**协作云（Supabase）为可选增强**，非真源，**独立切片**推进。
- **独立性**：与 Rushi（如是我闻）**无运行时依赖、无能力互补承诺**；解语缺口在本仓内解决或显式标为非目标。
- **刻意不做**（拍板决策 §四）：每 PR 全量重型 gate、高频依赖自动化、多角色评审路由、为形式的全量 E2E、通用多智能体 swarm / 云端多租户。

技术与浏览器边界：[桌面端浏览器支持策略](../../architecture/桌面端浏览器支持策略.md)、[PWA / 离线壳预期](../../architecture/offline-pwa-first-visit-expectations.md)。

## 2. 切片总览与依赖序

排序原则（已拍板）：**先稳主线（A）→ 再开占位（B）→ 后对外/协作（C）**。

```
Stage A 稳主线 + Agent 架构轨    Stage B 开占位              Stage C 对外/协作
A1 ReadyWorkspace合同 ─┐
A2 声学readout打磨     │
A3 声学inspector冻结   │   B1 深链(软地基·部分✓) ┄推荐接入┄┐
A4 AI agent-loop收口   │   B3 词典三栏联动(基本✓·待回归) ───┤
A4b Context JIT/步数   │   B2 事件合同(合同✓/未接线)      ┄┘
A5 时间轴稳定收尾     ─┤   ├─► B4a/B4b 标注（须 A6+A7+A10）
Agent 架构轨（§2.2）：  │   ├─► B5a/B5b 语料（须 A6+A7；AI 加 A9+A10）
A6 F4 B/C + 工业开关   ─┤   ├─► B6 引用断裂态
A7 Last Mile + policy  ─┤   ├─► B7 语料 AI（须 A6+A7+A9+A12）
A8 agentRunId 审计     ─┤   ├─► B8 词典附件
A9 semantic guard      ─┤   ├─► B11 外部 MCP trust
A10 Runner 基座        ─┤   └─► B12 MCP resources + Artifacts
A11 UI/Event + Preview ─┤
A12 Workflow 强化      ─┤   (B9 分析页：ADR-0033 受限工作台已落地)
A13 TaskRunner+Parallel─┤
A14 Eval trajectory   ─┘
                                     │
                                     ▼
              C1 对外检查(+Agent架构) · C2 i18n · C3 导出 · C4 协作云
```

> **代码核对校准（2026-06-01，含合理性审计修正）**：代码已领先三页联动计划文档。深链工具 + 事件合同 v1 原语已就位；B3 词典联动**基本落地**。Stage B 真实剩余工作集中在：**开放 B4 标注 / B5 语料占位页**、**B6 断裂态 UI 消费**、可选 B2 事件接线、B7/B8 增强。优先级：「先收口 B3 回归 → 再开 B4/B5（拆子切片）→ 可选 B2 接线」。

依赖硬约束（经 [主路线图合理性审计](../audits/主路线图合理性审计-2026-06-01.md) 修正）：
- **B1（深链工具，部分✓）= 软地基**：B4/B5 推荐接入，但非阻塞（B3 已证明深链可独立工作）。
- **B2（事件合同，合同✓/未接线）= 增量增强，非地基**：B3 落地未消费 B2 即为证；B4/B5 可先开放，事件驱动刷新作后续增强。
- Stage A 与 Stage B1/B3 **可并行**（不同代码域），但触碰转写内核的 A 切片优先稳定。
- **工程治理门槛（Stage B 启动前置，硬阻塞）**：
  1. `npm run check:architecture-guard` 通过且无**新增** hotspot（当前唯一逼近项：`TranscriptionPage.ChatWindow.tsx` 766/800＝96%；若 B4/B5 需向其注入逻辑，须先预拆卫星组件或调整 ratchet 并记录原因）。
  2. B4/B5 须用**独立 controller/hook**，禁止向现有逼近阈值文件注入逻辑。
  3. **A4 完成（证据收口，2026-09-02 关闭）**：可靠性三 flag + compaction 在 dogfood/staging/prod 默认 `true`；`check:agent-evals:smoke` + `:trace` 17/17、`aiAgentLoopHandoffAfterReload` + clarify e2e、vertical audit envelope `status` 已写入。Stage B 接 AI 工具路径仍须 **A7 + A10**（写工具）。
- **Agent 架构门槛（B4/B5/B7 接 AI 前置，硬阻塞）**：切片 **A6–A14**（[Agent 运行时架构补强](./Agent运行时架构补强-本地优先落地方案-2026-06-01.md)）——**B4/B5 写工具最低 = A6 + A7 + A10 完成并归档证据**；**B4 垂直 workflow 完整 = +A11 + A12**；**B7 = A6 + A7 + A9 + A12**；**C1 = A8 + A9 + A11 + A14**。架构真源：[ai-agent-runtime-security-local-first.md](../../architecture/ai-agent-runtime-security-local-first.md)、[ai-agent-runtime-runner-model.md](../../architecture/ai-agent-runtime-runner-model.md)。
- Stage C 默认在对应 B 域可用后启动；**C4 协作云为独立切片**，不阻塞本地闭环。

> **Anthropic 启发深化（P1–P5）**：不新增顶层切片 ID（除 **A4b** 一项）；详见 [智能体改进方案-Anthropic启发-2026-06-09](./智能体改进方案-Anthropic启发-2026-06-09.md) §10。对账锚点：**P0→A4** · **P1.1 compaction→A4** · **P1.2/P1.3→A4b** · **P2→A10 + A14** · **P3→A14** · **P4→A13** · **P5→B12 prompts 对齐**。
>
> **代码审查 PR-0～12**：[统一修复方案](./代码审查问题统一修复方案-2026-06-01.md) §1.1 已全部 ✅；**不纳入**下文 Agent 波次，仅作 Stage B 工程地基。

### 2.2 Agent 架构轨 — 合并进度与执行波次（2026-06-10）

> **范围**：切片 **A4、A4b、A6–A14**（及 B11 安全外连）。子计划细节仍以 [架构补强](./Agent运行时架构补强-本地优先落地方案-2026-06-01.md) 为准；**全局顺序与 Stage B 门槛以本节 + §3 状态列为准**。

#### 2.2.1 已落地（`main`，不再单列 PR）

| 能力 | 切片 | 代码锚点（示例） |
| --- | --- | --- |
| 闭环 replanning / quality gate / context budget + **prod 默认 true** | A4（代码） | `featureFlags.ts`、`agentLoopReplanning.ts`、`contextBudget.ts` |
| Tool result **compaction** | A4 / P1.1 | `agentLoopHistoryCompaction.ts`、`agentLoopRunner.ts` |
| Write gate Phase 1–4 + preview routing + 审计 reason/i18n | A7（Phase 1–4 代码） | `aiToolPolicyMatrix.ts`、`localContextToolEffects.ts`、`toolWriteGate.ts`、`toolDecisionPipeline.ts` |
| F4 sidecar 入口白名单 + 工业三开关环境矩阵 | A6 | `check-ai-session-sidecar-entrypoints.mjs`、`featureFlags.ts` |
| `workflowCompletionChecklist` + reflection reconcile + `workflowAnswerReady` | A12（浅层） | `workflowCompletionChecklist.ts`、`completionPipelineVerticalFinalize.ts` |
| Trajectory NDJSON 断言 + **`agentRunId` 链** | A14 | `auditTrajectoryAssertions.mjs`、`suite.v1.json` |
| ChatWindow / speaker routing 预拆（降 hotspot） | 工程治理 | `useTranscriptionChatWindowController.ts` 等 |

#### 2.2.2 执行波次（下一刀顺序）

```text
Wave 1 — 证据 + 策略真源（2026-09-02 关闭）
  A4   放量证据收口 ✅（e2e handoff + clarify、:trace 17/17、vertical envelope.status、spec 勾选）
  A7   Phase 1：矩阵 effect/scopeBinding + catalog parity（已落地；A11 preview 闭环仍开）
  A6   F4 Batch B/C + 工业三开关 evidence ✅

Wave 2 — Runner 枢纽 + 观测 + Context 余量（已进 main）
  A10  commitToolEffects + CallbackRegistry + AiToolCatalog（A10.6 API 随 A12；send-turn 仍串行）
  A8   agentRunId 贯穿 tool audit + loop step（MCP audit 仍开）
  A4b  effort scaling flag 默认 false（JIT 默认参数仍开）

Wave 3 — Workflow 编排 + 人在环写路径（A11/A12 已进 main）
  A12  StepKind + registry 元数据 + parallel readonly API（已进 main；send-turn 并行仍不开）
  A11  Preview UI → confirm → commitToolEffects（flag `aiAgentUiPreviewEnabled` 默认 false）

Wave 4 — 安全外连 + 评测/长程 harness（B15 已收口）
  A9   semantic guard（flag `aiSemanticGuardEnabled` 默认 false；已进 main）→ B11 已复用 inspectInbound
  A14  按 agentRunId 强化 trajectory 断言（承接 A8；已进 main）
  A13  TaskRunner + checkpoint 合同 + parallel readonly 样本（已进 main；send-turn 仍串行）
  B11  外部 MCP trust allowlist（flag `aiExternalMcpTrustEnabled` 默认 false）
  B12  MCP resources/prompts + AgentArtifactV0（flag `aiMcpResourcesArtifactsEnabled` 默认 false）
  B13  outbound Streamable HTTP MCP client（flag `aiExternalMcpHttpClientEnabled` 默认 false）
  B14  outbound MCP send-turn 接线（flag `aiExternalMcpSendTurnEnabled` 默认 false）
  B15  Zotero/OpenAlex MCP 提供方适配（flag `aiExternalMcpProviderAdaptersEnabled` 默认 false）
```

#### 2.2.3 Stage B / C 解锁对照

| 目标 | 须完成的 Agent 切片 |
| --- | --- |
| **A4 关闭 → 可谈 Stage B 接 AI** | **A4** 证据 ✅ |
| **B4/B5 写工具最低** | A4 + **A7 + A10**（A6 已关闭） |
| **B4 垂直 workflow 完整** | 上列 + **A8 + A11 + A12** |
| **B7 语料 AI** | A6 + A7 + A9 + A12（完整 + **A11 + A13**） |
| **C1 对外抽样** | A8 + A9 + A11 + A14（外连 MCP 另需 **B11 + B13 + B14**；B15 适配可选） |

#### 2.2.4 触及 Agent 切片时的统一验证

```bash
npm run typecheck
npx vitest run <touched>
npm run check:agent-evals:smoke
npm run check:architecture-guard
# A4 / A11 / handoff / 写确认路径：
npm run check:agent-evals:trace
npm run test:e2e:chromium -- tests/e2e/aiAgentLoopHandoffAfterReload.spec.ts
```

### 2.1 切片落地定义（DoD，每片通用）

每个切片"完全落地"必须同时满足（本地闭环口径）：

1. **数据层**：Dexie schema / Service / Worker 写路径就位；**写 → reload/requery → readback 验证**（不止字段存在）。
2. **UI 层**：入口、状态、交互闭环接线完成；用户可见文案走 `dictKeys` / 字典，不留硬编码。
3. **编排纪律**：重逻辑下沉 controller/service/纯函数；不在页面层堆业务（copilot-instructions §一/§三）。
4. **验证证据**：`npm run typecheck` + 触及域定向 `vitest`；触交互/ReadyWorkspace/侧栏/时间轴加 `npm run test:e2e:chromium`；触编排加 `npm run check:architecture-guard`；触 AI 加 `npm run check:agent-evals:smoke`。
5. **可回滚**：高风险或 UI 觉察大改套 feature flag（`src/featureFlags.ts`），`false` 合并、自用后切默认。
6. **SDD**：中等以上复杂度（≥1 新 controller / ≥1 新 service / 跨 ≥3 controller）先写 `docs/execution/specs/<slug>/` 三件套再编码。

> 「前后端完全落地」在本项目 = **持久化(Dexie/Service/Worker) + UI 三层贯通且可 readback**；协作云同步属 C4 独立切片，不作为本地切片的落地门槛。

## 3. 切片清单

> 锚点多数引自 [三页联动最小落地计划书](./三页联动最小落地计划书-2026-04-22.md)（代码事实较新）、[声学现状](../../architecture/转写工作区声学分析现状.md) §3、[AI 战略下一步](./AI智能体-战略规划与下一步-2026-05-07.md)。粒度：S≈0.5d / M≈1d / L≈2d。

### Stage A — 稳主线

> **Agent 轨下一刀**：本 PR 收口 **B5b**（语料工作集 text/plain + Markdown 剪贴板出站，沿用 `corpusLibraryPageEnabled` 默认 false）。之后余量：**B5a-2** 项目级索引。状态图例：✅ 已关闭 · 🟡 部分落地 · ⬜ 未开始。

| ID | 切片 | 状态 | 波次 | 粒度 | 目标 / 落位锚点 | 验收（DoD 之上的关键项） | SDD |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **A1** | ReadyWorkspace 合同化（剩余域） | ⬜ | — | M | 按拍板 5A 渐进把 `any`/`as any` 替为窄 type guard；真实落位：`src/pages/useReadyWorkspaceSurfaceProps.tsx`、`readyWorkspaceSurfacePropsAssemblyPhase.tsx`、`readyWorkspaceSurfacePropsOrchestratorInputSlice.ts`、`readyWorkspaceSurfaceSliceContracts.ts`、`useReadyWorkspaceSurfaceOrchestratorBundle.ts`；边界见 [ReadyWorkspace 数据域](../../architecture/ReadyWorkspace-数据域与壳层装配边界.md)，收敛进度随 [代码治理计划 v2](../../architecture/code-governance-plan-2026-05-06.md) ARCH-7 | `audit:ready-workspace-timeline-host` 绿 + 定向 vitest + e2e:chromium | 否（结构） |
| **A2** | 声学统一 hover readout 信息层级打磨 | ⬜ | — | M | 声学现状 §3.1；`WaveformReadoutCard`、`useTranscriptionWaveformBridgeController`、`TranscriptionTimelineSections` | readout 在 waveform/spectrogram/split 一致；`WaveformToolbar.test` + 定向 vitest | 否 |
| **A3** | 声学 inspector 冻结 + 多点比较（**最小闭环·本地子集**） | ⬜ | — | L | 声学现状 §3.2；`AcousticAnalysisService`/`AcousticAnalysisCacheDB`（持久缓存 readback）+ acoustic tab UI。**范围限定**：仅冻结/比较**已进主线的本地子集**，**非**完整科研级 inspector（声学现状 Phase 4「基本未开始」，留后续切片）| 冻结点持久化 → reload → readback；多点比较渲染；定向 vitest | 是 |
| **A4** | AI agent-loop 可靠性 + compaction 收口 | ✅ | **W1** | **L** | spec `ai-agent-loop-reliability-improvements`；三可靠性 flag + `aiAgentLoopToolResultCompactionEnabled`。**代码**：replanning/quality/budget/compaction 已落地，dogfood/staging/prod 默认可靠性 flag 为 `true`。**证据（2026-09-02）**：① `aiAgentLoopHandoffAfterReload` + clarify 路径 e2e；② `check:agent-evals:trace` 17/17 + [A4 收口记录](../release-gates/A4-agent-loop-reliability-closeout-2026-09-02.md)；③ reflection reconcile 后 envelope `status` 写入 vertical audit；④ spec tasks A4 收口记录 | §2.2.4 命令全绿 | 已有 spec |
| **A4b** | Context 工程余量（JIT + effort scaling） | 🟡 | **W2** | M | **已落地**：`resolveEffectiveMaxSteps()` + flag `aiAgentLoopEffortScalingEnabled`（默认 **false**）。**剩余**：P1.2 JIT 默认 limit/scope / concise 响应（`localToolSlotResolver`） | 6 步 payload 较基线降 ≥30%；eval 无「list 全项目」路径 | 视 Implement |
| **A5** | 时间轴交互/壳层收敛剩余项 | ✅ | — | M | [时间轴交互与壳层收敛](./时间轴交互与壳层收敛落地方案-2026-04-21.md)：**A–F 主链 2026-06-26 已闭合**（矩阵 v35/v36）。**剩余不属于本切片阻塞**：§9 backlog（G3 lane 行 DOM、选集 undo 批处理、timeMapping 非线性渲染） | 定向 vitest + e2e:chromium + `check:architecture-guard`（主链已过） | 视项 |
| **A6** | F4 Batch B/C + 工业三开关 evidence | ✅ | **W1** | M–L | [架构补强](./Agent运行时架构补强-本地优先落地方案-2026-06-01.md) §3.1；Batch A 旁路已受控；Batch B = `check:ai-session-sidecar-entrypoints` 白名单；Batch C = session-sidecar + governance strict 证据门禁；工业三开关 dogfood/staging ON、prod OFF（见 [安全策略 §5](../../architecture/ai-agent-runtime-security-local-first.md)）。**B4/B5 写工具仍须 A7+A10** | `check:ai-session-sidecar-entrypoints` + `gate:release-evidence:governance:strict` 绿 | 否 |
| **A7** | Last Mile 写 gate + per-tool policy 矩阵 v1 | 🟡 | **W1** | L | **已落地**：`toolWriteGate` Phase 2–4、`supportsPreview`、pipeline i18n（dogfood/staging write gate 默认 on）；**Phase 1（2026-09-02）**：矩阵 `effect`/`scopeBinding` + `LOCAL_CONTEXT_TOOL_POLICY` catalog parity（`localContextToolEffects` 收敛为政策表）。**剩余**：超 scope 写 block 的 B4 写工具样本仍待 A11 preview→commit | 超 scope 写 block + audit；只读零弹窗；写经 **A11** preview→commit | 是 |
| **A8** | agentRunId + intent 审计链 | 🟡 | **W2** | M | **已落地**：`newAgentRunId()` 于 send-turn preflight；`ToolAuditContext` / decision+intent metadata / agent-loop step audit 含 `agentRunId`。A14 已按 run 过滤断言。B13 起 `mcp_tool_call_audits.agentRunId` 可选写入（outbound list/call + inbound runtimeContext）。**剩余**：inbound MCP host 尚未从 ChatWindow 传入 `runtimeContext.agentRunId` | Replay 可按 run 过滤；为 **A14** 按 run 断言前置 | 否 |
| **A9** | 轻量本地 semantic guard（入/出站） | 🟡 | **W4** | M | **已落地**：`src/ai/security/semanticGuard.ts`；persist `before_model` 入站 block、finalize `before_client` 出站 redact；`CorpusSourceSet.trustTier`；SDD `agent-runtime-security-semantic-guard/`。Flag `aiSemanticGuardEnabled` 默认 **false**。**剩余**：flag 放量。B11 已复用同一 `inspectInbound`。 | injection/PII 单测；`adversarial-semantic-guard-*` eval | 是 |
| **A10** | Runner 基座：Callback + Catalog + commitToolEffects | 🟡 | **W2** | L | **已落地**：A10.1–A10.5 `agentCallbacks` / `aiToolCatalog` / `commitToolEffects`；auto/confirm/local-context 无 persist 旁路。**A10.6** `executeReadonlyToolBatch`（随 A12：拒写、`Promise.all`、一次 `commitToolEffects`）。SDD：`agent-runtime-runner-foundation/` + A12 spec。**剩余**：send-turn 多工具仍串行（policy/clarify）；并行只读不替换现网 loop | grep 无直写 localToolState/audit 旁路；catalog parity 绿；readonly batch 单测 | 是 |
| **A11** | AgentUiEvent + Preview 统一 + triage→UI | 🟡 | **W3** | L | **已落地**：`agentUiEvents` 总线；pending/blocked/confirm/cancel 同源 `agentRunId`；`AgentWritePreviewSection` 渲染 `AiChangeTransactionPreviewV1` + triage；confirm 仍经 `commitToolEffects`。**剩余**：flag 放量后 e2e 写确认 smoke；B4 标注写工具样本。SDD：`agent-runtime-preview-ui/`。Flag `aiAgentUiPreviewEnabled` 默认 **false** | event 与 audit 同源；flag off 现网 DOM 不变 | 是 |
| **A12** | Workflow 强化：StepKind + Reflection + Structured output | 🟡 | **W3** | L | **已落地**：`workflowCompletionChecklist`、finalize reflection reconcile、agent loop `workflowAnswerReady`；A12.1 `workflowStepKinds`；A12.2 registry `reflectionHandlerId` / `outputSchemaId` / `maxReflectionRetries` / `stepKinds`；A12.3 composed `parallel_readonly` 样本 + `executeReadonlyToolBatch`；A12.4 composed 步 ⊆ registry、checklist keys = registry keys；A12.5 `dispatchVerticalWorkflowReflection` + `after_model`。SDD：`agent-runtime-workflow-registry-v1/`。**剩余**：send-turn 多工具仍串行（刻意）；并行只读样本在 **A13** vitest，不替换 sequential local-tool | B4 新 workflow 只登记 registry；checklist 未闭合不得 done | 是 |
| **A13** | TaskRunner 对齐 + Parallel readonly 样本 | 🟡 | **W4** | M | **已落地**：`TaskRunner.enqueue`/`parkCheckpoint` 写 `agentRunId`；parked `agent_loop` 不走 pump、不被 stale TTL 回收；`pendingAgentLoopCheckpoint` 4 态 classifier（`done`/`clarify`/`error`/`running`，仅 `running` 可 auto-continue）；catalog `trust: background`；`enqueueReadonlyToolBatchTask` + `PARALLEL_READONLY_COMPOSED_STEP_SAMPLE` vitest。**不**把并行 batch 接到 send-turn。**依赖 A8、A12** | 长任务 + 并行读 vitest；handoff 进 architecture/plan | 否 |
| **A14** | Eval trajectory + agentRunId 自动断言 | 🟡 | **W4** | M | **已落地**：suite 二分、trajectory NDJSON 断言、**A8 `agentRunId` 链式断言**、vertical citation 进 `:smoke`、P2 tool-call 计数基线（fixture 回放）。**剩余**：可选 pass@k | smoke + trace 通过；按 run 过滤 trajectory | 否 |

### Stage B — 开占位（标注 / 词典 / 语料 / 分析）

| ID | 切片 | 粒度 | 目标 / 落位锚点（引自三页联动 P0/P1） | 验收 | SDD |
| --- | --- | --- | --- | --- | --- |
| **B1** | 深链与返回上下文合同（P0-1） | S–M | **【部分落地】** `transcriptionUrlDeepLink`（`buildTranscriptionDeepLinkHref`/`...WorkspaceReturnHref`）已存在且词典页已用、sessionStorage 列表态已分离。**剩余**=语料/标注页开放时接入 + 统一 URL/`sessionStorage` 无双写规则核验 | 三页↔转写往返保留排序/筛选/选中/滚动；无双写 | 否 |
| **B2** | 跨页刷新事件合同（unitId 增量，P0-2） | M | **【合同已落地·未接线】** 事件合同 v1 + `dispatch/subscribeWorkspaceEvent` 原语 + 测试已在 `appShellEvents.ts`（unit/lexeme updated、lexeme deleted soft/hard、context-sync），但**零生产消费方**。**剩余**=把事件接入页面/hook 做 unit 增量刷新 | 提交后仅触发对应 unit 增量刷新；草稿不被覆盖；定向 vitest | 是 |
| **B3** | 词典页三栏联动（只读命中语段，P0-5） | S | **【基本落地·待回归】** `LexiconPage` 已实现 列表/检索 + 详情(义项/词形/笔记) + 命中语段(`LinguisticService.lexemes.listTranscriptionJumpTargets`) + 深链跳转回转写 + sessionStorage 态。P0-5 验收**基本满足**。**剩余**=补回归测试 + 可选事件驱动刷新（依赖 B2） | 已满足；补 e2e/vitest 回归即收口 | 否 |
| **B4a-1** | 标注页壳 + IGT 列表渲染 + 键盘状态机骨架（P0-3 上·前置） | M | **【确认占位】**（`AnnotationPage`(25 行) = `FeatureAvailabilityPanel`）→ 新增 `annotationPageEnabled` flag（`false` 合并）；独立 controller 骨架（类型、props 流、测试桩）；IGT 行内布局 + 列表渲染 + 键盘状态机；按轨读用 `annotation/annotationLaneReadScope`(ADR-0020)；**勿向逼近阈值的现有 controller 注入逻辑** | 页面壳可渲染；flag off 行为不变；`check:architecture-guard` 无新增 hotspot | 否 |
| **B4a-2** | 标注页 token POS/gloss 编辑 + 保存链路 + readback（P0-3 上·核心） | L | 承 B4a-1：token 行内编辑框 + POS/gloss 修改 → 统一写链路（独立 controller）→ 转写页可见；复用 `useTranscriptionAnnotationController`、`useTranscriptionUnitActions`、`useAiToolCallHandler.annotationAdapters`、i18n | 写→reload→readback；e2e:chromium；定向 vitest | 是 |
| **B4b** | 标注页 morpheme / 手动分词 / Validator（P0-3 下半） | L | 承 B4a-2：morpheme 分层编辑 + 手动分词 + 词典链接编辑 + Leipzig Validator 模板；细节真源见 [标注页与词典页路线图](./标注页与词典页开发路线图-2026-04-25.md) M1b | 分词/链接写→reload→readback；Validator 校验；定向 vitest | 是 |
| **B5a** | 语料库 P0 工作集 + 多选（P0-4 上半） | **L** | **【🟡 部分落地·B5a-1】** `/corpus` 当前 text/media 只读列表 + Router 会话 `corpusBasket`（与转写 `selectedUnitIds` 隔离，不落 URL/Dexie/`sessionStorage`）；筛选写入 `corpusViewState`。Flag `corpusLibraryPageEnabled` 默认 **false**。SDD：`corpus-library-workset-shell/`。不复用 `SidePaneSidebarSegmentList`。**剩余 B5a-2**：项目级索引。**「写」仅指工作集/筛选态，禁止写 `layer_units`/`unit_tokens`。** 本切片不接 AI | 工作集同会话 remount readback；换 media/text 清空；定向 vitest | 是 |
| **B5b** | 语料库最小出站（text/plain + markdown，P0-4 下半） | M | **【🟡 已落地·flag 关】** 工作集复制 plain / Markdown（unit/media/时间码 + `/transcription?` 深链）；空选不写剪贴板。SDD：`corpus-library-clipboard-export/`。沿用 `corpusLibraryPageEnabled` 默认 **false**。不做 HTML/bundle/EAF；不接 ChatWindow / Resolver Core | golden 对拍 + clipboard mock；flag 关占位 e2e 不回归 | 是 |
| **B6** | 引用断裂态（ADR-0011，P0-6） | M | **【原语就绪·待消费】** `WORKSPACE_LEXEME_DELETED_EVENT`(soft/hard) 与 `LinguisticService.cleanup`/`TranscriptionPage.citationJump` 已存在。**剩余**=删除→引用断裂态 UI 消费 + 错误码；`LayerSegmentationTextService`、ADR-0011 回写。**segmentMeta 一致性前提**：当前 `segment_meta` 为 best-effort 最终一致性（PR-10 已落地 50ms 微批合并 + 失败日志），B6 UI 消费须兼容派生表延迟/不一致场景；若需强一致性，应先实现后台对账任务强制同步 | 删/软删后引用进断裂态、返回错误码；禁止假成功摘要；定向 vitest | 否 |
| **B7** | 语料库 AI 分区与会话隔离（P1-1） | M | `useAiToolCallHandler.adapters`、`useAiChat.config`、`CorpusLibraryPage`；`corpusBridgeAdapter` 命名。**前置：A6 + A7 + A9 + A12** | corpus 侧复制优先、默认不写回主链；会话与转写隔离；`check:agent-evals:smoke` | 是 |
| **B11** | 外部 MCP trust allowlist | M | **【已落地·flag 关】** `externalMcpTrustRegistry` + Dexie v51 `external_mcp_trust`；`exposeExternalMcpToolsToLlm` 对未登记 / 未启用 / flag off 零暴露；首次启用带 schema 走 A9 `inspectInbound`；Settings AI 节 flag 开才渲染。Flag `aiExternalMcpTrustEnabled` 默认 **false**。**剩余**：flag 放量。Outbound HTTP 见 **B13**。SDD：`agent-runtime-external-mcp-trust/`。**依赖 A9** | 未登记 server deny；schema 零暴露；用户显式启用；审计 readback | 是 |
| **B12** | MCP resources/prompts + AgentArtifactV0 | M | **【已落地·flag 关】** inbound `resources/list`+`read`（`jieyu://source-set/{id}`）与 `prompts/list`+`get`（A12 registry）；Dexie v52 `agent_artifacts`；AdoptionQueue `artifactIds`；`buildB5bExportManifest`。Flag `aiMcpResourcesArtifactsEnabled` 默认 **false**。SDD：`agent-runtime-mcp-resources-artifacts/`。**依赖 B11 + A12** | resource URI readback；artifact 引用链；B5b 导出清单函数 | 是 |
| **B13** | outbound Streamable HTTP MCP client | M | **【已落地·flag 关】** `externalMcpHttpClient` POST `tools/list`/`tools/call`（JSON 或 SSE `data:`）；仅 B11 已启用 origin；写向 RPC 零 fetch；audit 写 `agentRunId`。Flag `aiExternalMcpHttpClientEnabled` 默认 **false**。不引入 SDK；不改 CSP `connect-src`；不接 ChatWindow。SDD：`agent-runtime-external-mcp-http-client/`。**依赖 B11** | flag 关零 fetch；未启用 origin 零 fetch；list 经 expose 门；write RPC deny | 是 |
| **B14** | outbound MCP send-turn 接线 | M | **【已落地·flag 关】** `externalMcpTurnBridge`：`lastToolsJson` 缓存；`extmcp__<originKey>__<tool>` 进 prompt；local 空才执行 B13 `tools/call`。Settings 拉取 `tools/list`。Flag `aiExternalMcpSendTurnEnabled` 默认 **false**。不改 ChatWindow；不进 `AI_TOOL_CATALOG`；不改 CSP。SDD：`agent-runtime-external-mcp-send-turn/`。**依赖 B11+B13** | flag 关零 guide/零 HTTP；local 优先；cache-only guide | 是 |
| **B15** | Zotero/OpenAlex MCP 提供方适配 | M | **【已落地·flag 关】** `externalMcpProviderAdapters`：已知工具指纹；`tools/call` 文本 JSON → `EvidencePacketV0`（`document`）；Settings 预置只填 origin/label 草稿。Flag `aiExternalMcpProviderAdaptersEnabled` 默认 **false**。CSP 枚举环回 `8765`，不恢复 `https:` 通配；不 spawn stdio；不直连 OpenAlex REST / Zotero `:23119`。SDD：`agent-runtime-external-mcp-provider-adapters/`。**依赖 B13+B14** | flag 关零 packets / 零预置按钮；垃圾 JSON → `[]`；预置不写 Dexie | 是 |
| **B8** | 词典附件能力（引用式资产，P1-2） | M | `LexiconPage`、`useTranscriptionCollaborationBridge`、`useTranscriptionData` | 附件元数据持久化+回显（写→reload→readback）；删除走引用计数安全回收 | 是 |
| **B9** | 分析页 /analysis | — | **受限工作台已落地（非产品级开放台）**：[ADR-0033](../../adr/0033-analysis-restricted-workspace-no-transcription-dock.md) 把 `/analysis` 做成向量索引 / 语料统计入口（复用 `TranscriptionPageAnalysisRuntime`，`visibleTabs`: embedding / stats），**不嵌波形、不升格为第二转写台**。完整科研分析工作台仍不排期 | — | — |

### Stage C — 对外 / 协作（拍板 1B 预留）

| ID | 切片 | 粒度 | 目标 / 落位锚点 | 验收 | SDD |
| --- | --- | --- | --- | --- | --- |
| **C1** | 对外前最小检查执行 | M | [对外前最小检查](../release-gates/对外前最小检查-2026-05-11.md)：隐私/导出范围说明、发布 smoke、**Agent 架构节（A8 + A9 + A11 + A14 抽样）** | 检查单逐项过；`test:e2e:chromium` 全绿；单次 send turn 可串联 audit + trajectory | 否 |
| **C2** | i18n 基线计划性消减（6B） | M | 拍板 6B；`check:i18n-hardcoded:guard` 不新增债 + 按目录消减；AI 文案走 `src/ai/messages/` 与 UI `dictKeys` 分离 | 基线 hits 按目标下降；guard 绿 | 否 |
| **C3a** | 字幕导出（SRT + WebVTT） | M | 缺口项。时码语段读模型 → 新增 `subtitleExportSerialization` 工具 → 转写导出菜单项 + 下载 + i18n；锚点同 `transcriptionExportCallbacks` / `useImportExport.ts` 导出菜单 | golden fixture 序列化对拍 + 定向 vitest；UI 触发可下载 | 否 |
| **C3b** | 表格转写导出（CSV / TSV） | M | 缺口项。逐语段行（start/end/speaker/text/可选 gloss）→ 序列化工具 → 导出菜单项 + i18n | golden 对拍 + 定向 vitest | 否 |
| **C3c** | 学术 IGT LaTeX 导出（Leipzig） | L | 缺口项。token 层（text/gloss/translation）→ Leipzig `gll`/expex 序列化；复用 [`LeipzigValidator`](../../../src/ai/LeipzigValidator.ts) / `AutoGlossService`；导出菜单项 + i18n | golden 对拍 + Leipzig 校验通过 + 定向 vitest | 是 |
| **C3d** | Word/docx 导出 | — | **待定**：需引入 docx 生成依赖（体积/维护/许可成本需评估）。**默认不排期**，按真实诉求再决定复用方案 | — | 是（先 Research） |
| **C4** | 协作云增强（独立切片） | — | 现状 [collaboration-cloud](../../architecture/collaboration-cloud.md) 已落地；增强项参考 M8–M14；**非本地切片门槛** | `gate:collaboration-cloud` / `gate:greenfield-local`（按需，release 窗口） | 视项 |

> **导出现状（2026-06-01 代码盘点）**：**已强** = 语言学交换格式 EAF/TextGrid/TRS/Flextext/Toolbox + 原生 JYT/JYM（均带 round-trip 导入）；**已有** = 声学选区 CSV/JSON、项目归档 bundle、AI 回答带引用纯文本复制；**缺口** = 字幕(C3a)、表格(C3b)、学术 IGT LaTeX(C3c)、Word(C3d 待定)。语料库 text/plain+markdown 剪贴板出站属 **B5**，勿在 C3 重复。所有导出切片须**先建内部统一读模型再序列化**，禁止反噬编辑数据模型。

### 各域子计划真源（切片内细节以此为准，本文不复制正文）

- 标注/词典：[标注页与词典页路线图（重构版）](./标注页与词典页开发路线图-2026-04-25.md) · 三页联评 [治理补充规范](./标注词典语料-治理补充规范-2026-04-25.md)
- 语料库：[语料库产品定位与执行方案](./语料库-产品定位与执行方案-2026-04-28.md) · [语料库页面路线图](./语料库页面开发路线图-2026-04-22.md)
- AI / 语音：[AI 战略与下一步](./AI智能体-战略规划与下一步-2026-05-07.md)（活跃枢纽）
- Agent 运行时架构：[架构补强落地方案](./Agent运行时架构补强-本地优先落地方案-2026-06-01.md)（**canonical**；含 A6–A14、B11–B12）· [Anthropic 启发改进方案](./智能体改进方案-Anthropic启发-2026-06-09.md)（P0–P5 与 A4/A14 对齐）· [安全策略](../../architecture/ai-agent-runtime-security-local-first.md) · [Runner 模型](../../architecture/ai-agent-runtime-runner-model.md) · 旧 [安全-only 计划](./Agent运行时安全-本地优先落地方案-2026-06-01.md)（superseded）
- 声学：[声学现状](../../architecture/转写工作区声学分析现状.md) · [声学剩余完成计划](./声学语音学分析剩余项目完成计划-2026-04-08.md)
- 协作：[Supabase 落地](./托管实时协同-Supabase完整落地方案-2026-04-17.md) · M8–M14
- 工程治理：[代码治理计划 v2](../../architecture/code-governance-plan-2026-05-06.md) · [可治理性综合整改](./AI与代码库可治理性综合整改方案-2026-05-13.md)
- 进行中 spec：`docs/execution/specs/ai-conversation-management/`、`ai-assistant-presentation-modes/`、`ai-agent-loop-reliability-improvements/`、`agent-runtime-security-write-gate/`（A7 draft）；架构轨 Implement 前：`agent-runtime-security-semantic-guard/`、`agent-runtime-runner-foundation/`、`agent-runtime-workflow-registry-v1/`、`agent-runtime-preview-ui/`

## 4. 适用边界与显式废弃

| 文档 | 角色 | 边界（勿误用） |
| --- | --- | --- |
| [16 周执行版路线图（已 superseded）](./16周执行版路线图-2026-04-12.md) | 历史：工程四层架构 | 已 supersede 至本文；工程滚动排期看代码治理计划 v2 |
| [规划-完整开发计划书 2026-03-16（已归档）](../archive/historical-root-docs/规划-完整开发计划书-2026-03-16.md) | 历史愿景 / 功能清单 | 基线滞后（DB 版本、"无协作后端"等）；仅作上下文 |
| [仓库现状与代码地图](../../architecture/仓库现状与代码地图.md) | 现状盘点 | 现状真源，不是计划书；新排期写本文或子计划 |
| 各域子计划 | 域内落位 / 验收真源 | 与本文冲突时：**域内细节以子计划为准，全局优先级与切片序以本文为准** |

## 5. 对账规则（保持不过期）

1. 完成一个切片后：更新 §3 该行状态（可加 ✅ + 日期），commit message 附验证证据。
2. 季度或重大变化时：重读 [仓库现状与代码地图](../../architecture/仓库现状与代码地图.md) 校准 §2/§3。
3. 本文只维护切片序与 DoD，**不复制子计划正文**；子计划状态由各自 frontmatter `status` 自管。
4. 改 plans 后跑 `npm run check:plans-frontmatter`；大范围链接调整后 `npm run report:docs-link-debt`；索引由 `npm run generate:plans-readme` 自动重排。

## 6. 修订记录

| 日期 | 说明 |
| --- | --- |
| 2026-06-01 | 初稿：建立产品级 master 索引（North Star + 域优先级 + 适用边界 + 对账）。 |
| 2026-06-01 | 收编 16 周路线图（superseded）。 |
| 2026-06-01 | 重写为单一可执行 master plan：新增切片化 backlog（Stage A 稳主线 / B 开占位 / C 对外协作）、切片落地定义（DoD，本地闭环口径）、依赖序；取代旧索引式结构。切片锚点取自三页联动 P0/P1、声学现状 §3、AI 战略下一步。 |
| 2026-06-01 | 据决策定稿：B9 分析页改为「保留占位、暂不排期」；C3 据导出代码盘点拆为 C3a 字幕(SRT/VTT) / C3b 表格(CSV/TSV) / C3c 学术 IGT LaTeX / C3d Word(待定)，并记录导出现状（已强=语言学交换格式 + 原生格式；缺口=字幕/表格/IGT/Word）。 |
| 2026-06-01 | **代码核对校准**：逐切片对齐真实代码。修正 B1 深链=部分落地（`transcriptionUrlDeepLink` 已用于词典）、B2 事件合同 v1 原语已存在但**零消费方**、B3 词典三栏联动**基本落地**（详情+命中语段+深链+态）、B6 删除事件原语就绪待 UI 消费；B4/B5 确认仍占位；A4 确认基础 agent loop=on、3 可靠性 flag 默认 off 待验证。调整 Stage B 优先级为「先 B3 回归+B2 接线→再开 B4/B5」。 |
| 2026-06-01 | **据[综合报告核实](../audits/代码审查综合报告核实-2026-06-01.md)追加发现补强**：①§2 增「AI 安全门槛」——F4 Batch B/C 收口列为 B4/B5 接 AI 工具前置（2.2）；②A4 注明不含 F4；③A3 范围限定为「本地子集冻结」非完整科研级 inspector（声学 Phase 4 未开始，2.4）；④工程门槛注明治理文档百分比为历史数字、以实时 guard 为准（2.3）。B4/B5 的 flag 缺口（2.1）已在上条拆分时解决。 |
| 2026-06-01 | **据[合理性审计](../audits/主路线图合理性审计-2026-06-01.md)修正**：①A1 锚点删除臆造名 `computeReadyWorkspaceSurfaceProps`/`useReadyWorkspaceSurfaceProps.types`，改真实文件名 + 降粒度 M；②B3 补粒度 S；③B4→B4a/B4b、B5→B5a/B5b 拆分（与「功能切片 0.5–2d」一致，每子片 L/M，量级取 P0-3/P0-4 单项而非整 P0 的 2-3 周预算）；④B2 由「地基」降为「增量增强」（B3 落地未消费 B2 为证）；⑤B5 DoD 澄清「写」=工作集/筛选态持久化，禁写转写真源表；⑥新增 `annotationPageEnabled` flag 与 B4a，复用 `corpusLibraryLabEnabled` 于 B5a；⑦增工程治理门槛（B4/B5 启动前查实时 guard，用独立 controller）。 |
| 2026-06-01 | **Agent 运行时安全轨**：新增 A6–A9（F4 B/C、Last Mile 写 gate、agentRunId 审计、本地 semantic guard）与 B11（外部 MCP trust）；更新 §2 依赖图与 B4/B5/B7/C1 前置；子计划 [Agent运行时安全-本地优先落地方案](./Agent运行时安全-本地优先落地方案-2026-06-01.md) + 架构 [ai-agent-runtime-security-local-first.md](../../architecture/ai-agent-runtime-security-local-first.md)。 |
| 2026-06-01 | **Agent 运行时架构补强**：A6–A9 收编进 [架构补强落地方案](./Agent运行时架构补强-本地优先落地方案-2026-06-01.md)；新增 A10–A14（Runner/Catalog/Callback、AgentUiEvent、Workflow 强化、TaskRunner、Eval trajectory）与 B12（MCP resources + Artifacts）；更新 §2 依赖图、B4/B5/B7/C1 门槛；新增 [Runner 模型](../../architecture/ai-agent-runtime-runner-model.md)；旧安全-only 计划 superseded。 |
| 2026-06-01 | **据前 11 PR 修复落地审查与运行时审计修正**：①A4 粒度 M→L，明确 3 flag 切换需逐项验证（spec + agent-evals + e2e）后才可切默认，非简单改布尔值；②B4a 拆分为 B4a-1（壳+IGT 列表+键盘骨架，M）与 B4a-2（POS/gloss 编辑+保存链路+readback，L），解决「25 行占位→可写工作台」2d 装不完问题；③B5a 粒度 M→L，匹配从占位到工作集+多选+态持久化的实际工作量；④Stage B 启动前置条件增加硬阻塞：ChatWindow.tsx 阈值释放（或预拆）、A4 验证完成、实时 guard 无新增 hotspot；⑤Agent 架构门槛（A6+A7+A10）明确为「完成并归档证据后硬阻塞」；⑥B6 增加 segmentMeta 一致性策略说明（best-effort 最终一致性，UI 须兼容延迟）；⑦工程治理门槛更新：sessionMemory.ts 硬失败已消除（前 11 PR 修复），当前仅剩 ChatWindow.tsx 766/800＝96% 一项 hotspot。 |
| 2026-06-09 | **Anthropic Engineering 审查对账**：§2 增 P1–P5 脚注（不新增 A15/A16）；A7 验收改为自动策略优先 + A11 preview-diff；A10 增 readonly batch；A12 增 workflowCompletionChecklist；A14 增 suite 二分；链 [智能体改进方案-Anthropic启发](./智能体改进方案-Anthropic启发-2026-06-09.md) §10 与 [write-gate SDD](../specs/agent-runtime-security-write-gate/)。 |
| 2026-06-10 | **Agent 架构轨合并重排**：新增 §2.2（已落地清单 + Wave 1–4 + Stage B 解锁 + 统一验证）；§3 Stage A 增状态/波次列；新增切片 **A4b**（JIT + effort scaling）；A4/A7/A12/A14 标 🟡 与剩余 DoD；明确 [代码审查 PR-0～12](./代码审查问题统一修复方案-2026-06-01.md) 已收口、不纳入 Agent 波次；A4 硬阻塞改为「代码已放量、证据待收口」。 |
| 2026-09-02 | **进度对账**：A5 标 ✅（时间轴 A–F 已闭，§9 为后续 backlog）；A6 标 ✅（sidecar 入口守卫 + 工业三开关环境矩阵）；A7 Phase 1 `effect`/`scopeBinding` + localContext catalog parity 落地（切片仍 🟡，待 A11）；**A4 证据收口关闭**（handoff+clarify e2e、`:trace` 17/17、vertical envelope.status、spec 勾选）；B9 改为 ADR-0033 受限分析工作台（依赖图与代码地图 `/analysis` 路由条目同步，不再写「占位」）。 |
| 2026-09-02 | **Wave 2 代码落地**：A10.1–A10.5 Runner 基座（Catalog / Callback / `commitToolEffects`）；A8 `agentRunId` 贯穿 tool audit + loop step；A4b `resolveEffectiveMaxSteps` + flag 默认 false（JIT 默认参数仍待）。 |
| 2026-09-02 | **Wave 3 A12 主体**：`WorkflowStepKind`、registry `reflectionHandlerId` / `outputSchemaId` / `maxReflectionRetries` / `stepKinds`、composed 步 ⊆ registry、`executeReadonlyToolBatch`（A10.6）、finalize 走 `dispatchVerticalWorkflowReflection` + `after_model`。send-turn 多工具仍串行；A12 仍 🟡 至 A13 接并行样本。 |
| 2026-09-02 | **Wave 3 A11 代码落地**：`AgentUiEvent` 总线 + AlertsPanel 结构化 preview/triage；flag `aiAgentUiPreviewEnabled` 默认 false。 |
| 2026-09-03 | **Wave 4 A9 代码落地**：本地 `semanticGuard` 入站 block / 出站 redact；挂 `before_model` / `before_client`；`trustTier`；flag `aiSemanticGuardEnabled` 默认 false。 |
| 2026-09-03 | **Wave 4 A14**：`--assert-audit-trace` 按 `agentRunId` 链式断言；semantic-cases 进 `:smoke`；P2 ACI 基线写入 `agent-tool-aci-baseline.v1.json`。剩余可选 pass@k。下一刀 **A13**。 |
| 2026-09-04 | **Wave 4 A13**：`TaskRunner.parkCheckpoint` + enqueue `agentRunId`；parked resumable `agent_loop` 跳过 stale recover；4 态 resume classifier；catalog `trust: background`；parallel readonly vitest 样本（`search_units`+`list_layers`）。send-turn 仍串行。下一刀 **B11**。 |
| 2026-09-04 | **Wave 4 B11**：Dexie v51 `external_mcp_trust` + `exposeExternalMcpToolsToLlm`；A9 schema 扫描；Settings AI 节 flag 开才渲染。Flag 默认 false。下一刀 **B12**。 |
| 2026-09-04 | **Wave 4 B12**：inbound `resources/list|read` + `prompts/list|get`；Dexie v52 `agent_artifacts`；AdoptionQueue `artifactIds`；B5b 导出清单纯函数。Flag 默认 false。Outbound HTTP client 不在本切片。 |
| 2026-09-04 | **Wave 4 B13**：outbound Streamable HTTP `tools/list`/`tools/call`；B11 allowlist + A9 expose；`mcp_tool_call_audits.agentRunId`；flag 默认 false。不引入 SDK，不改 CSP。 |
| 2026-09-04 | **Wave 4 B14**：send-turn `extmcp__` 桥 + `lastToolsJson` 缓存；Settings 拉取 tools/list；flag 默认 false。不改 ChatWindow，不进 catalog，不改 CSP。 |
| 2026-09-04 | **B5b**：工作集 clipboard plain/Markdown 出站；空选不写剪贴板；沿用页面 flag 默认 false。下一刀 **B5a-2**。 |
