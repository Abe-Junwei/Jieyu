---
title: 解语主路线图（master plan · 切片执行）
doc_type: execution-plan
status: active
owner: repo
last_reviewed: 2026-09-25
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
A3 声学inspector冻结   │   B1 深链+滚动(✅) ┄已接入┄┐
A4 AI agent-loop收口   │   B3 词典三栏(基本✓·回归已补)─┤
A4b Context JIT/步数   │   B2 事件合同(已接线)          ┄┘
A5 时间轴稳定收尾     ─┤   ├─► B4a/B4b 标注（代码已落地·flag 关）
Agent 架构轨（§2.2）：  │   ├─► B5a/B5b 语料（代码已落地·flag 关；B5c 未合入）
A6 F4 B/C + 工业开关   ─┤   ├─► B6 引用断裂态 ✅
A7 Last Mile + policy  ─┤   ├─► B7 语料 AI（adapter 未建；须 ChatWindow 会话隔离）
A8 agentRunId 审计     ─┤   ├─► B8 词典附件（flag 关）
A9 semantic guard      ─┤   ├─► B10 R1–R8 门禁 ✅
A10 Runner 基座        ─┤   ├─► B11–B15 MCP（代码已落地·flag 关）
A11 UI/Event + Preview ─┤
A12 Workflow 强化      ─┤   (B9 分析页：ADR-0033 受限工作台已落地)
A13 TaskRunner+Parallel─┤
A14 Eval trajectory   ─┘
                                     │
                                     ▼
              C1 对外检查(+Agent架构) · C2 i18n · C3 导出 · C4 协作云
```

> **代码核对校准（2026-09-11）**：详见 [主路线图代码核对](../audits/主路线图代码核对-2026-09-11.md)。`main` 已含 B1 滚动、B2 接线、B3 回归、B4a/B4b 与 B5a/B5b（flag 默认 false）、B6、B8、B10。**不要**再把「开放 B4/B5 占位页」或「可选 B2」当成下一刀。2026-06-01 校准块仅作历史。

依赖硬约束（经 [主路线图合理性审计](../audits/主路线图合理性审计-2026-06-01.md) 修正，2026-09-11 按代码刷新）：
- **B1（深链+滚动，✅）= 软地基**：标注 `?unitId=`、词典 `lexiconReturn`、列表 `listScrollTop` 已进 `main`。
- **B2（事件合同，已接线）= 增量增强，非地基**：LinguisticService 单写路径 persist 后 emit；annotation / corpus / lexicon 按 `unitId`/`lexemeId` 增量刷新，草稿不覆盖。`context-sync` 生产派发与 lexeme 删除 API 另切片。
- Stage A 与 Stage B 产品页 **可并行**（不同代码域），但触碰转写内核的 A 切片优先稳定。
- **工程治理门槛（后续切片，硬阻塞）**：
  1. `npm run check:architecture-guard` 通过且无**新增** hotspot。`TranscriptionPage.ChatWindow.tsx` 已拆到 **127/220**，不再是 766/800 项。当前 WARN 集中在 speaker routing / voice / `useTranscriptionChatWindowLayout`（跑 `report:architecture-hotspots` 取实时值）。B4/B5 **禁止**再向 ChatWindow / Orchestrator 注入逻辑。
  2. 新工作台页须用**独立 controller/hook**（B4/B5 已遵守）。
  3. **A4 完成（证据收口，2026-09-02 关闭）**：可靠性三 flag + compaction 在 dogfood/staging/prod 默认 `true`。Stage B **接 AI 写工具**仍须 **A7 + A10**；只读出站（B5c）不阻塞于写 gate。
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

> **Wave 4 已收口（2026-09-11）**：A9–A14 与 B11–B15 代码均在 `main`，外连 MCP 各 flag 默认 false。Agent 轨不再单列「下一刀 PR」；产品下一刀见 §3 开篇。

#### 2.2.3 Stage B / C 解锁对照

| 目标 | 须完成的 Agent 切片 |
| --- | --- |
| **A4 关闭 → 可谈 Stage B 接 AI** | **A4** 证据 ✅ |
| **B4/B5 写工具最低** | A4 + **A7 + A10**（A6 已关闭） |
| **B4 垂直 workflow 完整** | 上列 + **A8 + A11 + A12** |
| **B7 语料 AI** | A6 ✅ + A7/A9/A12 代码已在 main；**缺** corpus adapter + ChatWindow 会话隔离（A9/A11 flag 关） |
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
5. **可回滚**：高风险或 UI 觉察大改套 feature flag（`src/ai/config/featureFlags.ts`），`false` 合并、自用后切默认。
6. **SDD**：中等以上复杂度（≥1 新 controller / ≥1 新 service / 跨 ≥3 controller）先写 `docs/execution/specs/<slug>/` 三件套再编码。

> 「前后端完全落地」在本项目 = **持久化(Dexie/Service/Worker) + UI 三层贯通且可 readback**；协作云同步属 C4 独立切片，不作为本地切片的落地门槛。

## 3. 切片清单

> 锚点多数引自 [三页联动最小落地计划书](./三页联动最小落地计划书-2026-04-22.md)（代码事实较新）、[声学现状](../../architecture/转写工作区声学分析现状.md) §3、[AI 战略下一步](./AI智能体-战略规划与下一步-2026-05-07.md)。粒度：S≈0.5d / M≈1d / L≈2d。

### Stage A — 稳主线

> **当前下一刀（2026-09-25）**：标注 M1、**B4f–B4i**、**B3c–B3k** 已落地。B4i 在 IGT 行只读显示同一句段的翻译层文本。余量：**B7** 仍 blocked on ChatWindow 会话隔离。不排 C3d Word / DMLex / M2 typed relation；语料 flag 仍默认 false。Dogfood ≠ 产品开放。详见 [后续路线图详细评估](../audits/后续路线图详细评估-2026-09-11.md)。状态图例：✅ 已关闭 · 🟡 部分落地 · ⬜ 未开始。

| ID | 切片 | 状态 | 波次 | 粒度 | 目标 / 落位锚点 | 验收（DoD 之上的关键项） | SDD |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **A1** | ReadyWorkspace 合同化（剩余域） | ⬜ | — | M | 按拍板 5A 渐进把 `any`/`as any` 替为窄 type guard；真实落位：`src/pages/useReadyWorkspaceSurfaceProps.tsx`、`readyWorkspaceSurfacePropsAssemblyPhase.tsx`、`readyWorkspaceSurfacePropsOrchestratorInputSlice.ts`、`readyWorkspaceSurfaceSliceContracts.ts`、`useReadyWorkspaceSurfaceOrchestratorBundle.ts`；边界见 [ReadyWorkspace 数据域](../../architecture/ReadyWorkspace-数据域与壳层装配边界.md)，收敛进度随 [代码治理计划 v2](../../architecture/code-governance-plan-2026-05-06.md) ARCH-7 | `audit:ready-workspace-timeline-host` 绿 + 定向 vitest + e2e:chromium | 否（结构） |
| **A2** | 声学统一 hover readout 信息层级打磨 | 🟡 | — | M | **已落地**：`WaveformReadoutCard` 统一 waveform/spectrogram hover 时间/频率/F0/强度（声学现状 §2.3）。**剩余**：信息层级打磨（声学现状 §3.1 的 polish，非从零实现） | readout 在 waveform/spectrogram/split 一致；`WaveformReadoutCard.test` + 定向 vitest | 否 |
| **A3** | 声学 inspector 冻结 + 多点比较（**最小闭环·本地子集**） | 🟡 | — | L | **已落地**：acoustic tab 会话内 pin/unpin + live-vs-pinned Δt/ΔF0/ΔdB（`useTranscriptionAcousticPanelState` + `AiAnalysisPanelAcousticInspectorSection`）。pin 为 React state，换媒体即清。**剩余**：冻结点 Dexie persist → reload → readback；多于 1 个冻结点；科研级 inspector（声学现状 Phase 4）仍不在本切片 | 冻结点持久化 readback；多点比较渲染；定向 vitest | 是 |
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
| **B1** | 深链与返回上下文合同（P0-1） | S–M | **【✅ 已落地】** `transcriptionUrlDeepLink` + 词典 `lexiconListState` + 语料/标注 outbound 深链。标注 URL `unitId` 聚焦行；命中语段带 `lexiconReturn`（转写 strip 后仍保留）；壳层 `WorkspaceReturnBanner` 回 `/lexicon`；`findWorkspaceStateDualWriteViolations` 锁 R8 键分轨。列表滚动：词典 `.app-main` / 语料 `.corpus-library-body` 写入 sessionStorage（`listScrollTop`）。**不**接 ChatWindow / ReadyWorkspace 装配 | 标注 `?unitId=` 聚焦；词典跳转含 `lexiconReturn`；strip 后 banner 可见；往返恢复滚动；双写用例；定向 vitest | 否 |
| **B2** | 跨页刷新事件合同（unitId 增量，P0-2） | M | **【✅ 已接线】** `workspaceEvents.ts`（`appShellEvents.ts` 再导出）+ LinguisticService persist 后 emit（`saveUnit` / `saveUnitText` / POS·gloss / `removeUnit` / `saveLexeme` / **B3d `deleteLexeme`→`lexeme-deleted`** / **`saveUnitsBatch` unique unitId** / **token↔lexeme 链接** / **unit·token·morpheme note**）；annotation / corpus / lexicon 订阅并按 `unitId`/`lexemeId` 增量 refetch。未提交草稿 → `mark-dirty` 不覆盖。`context-sync` 仅 API。SDD：`workspace-cross-page-events/` | 提交后仅对应 unit 增量刷新；草稿不被覆盖；定向 vitest | 是 |
| **B3** | 词典页三栏联动（只读命中语段，P0-5） | S | **【基本落地·回归已补】** `LexiconPage` 已实现 列表/检索 + 详情(义项/词形/笔记) + 命中语段(`LinguisticService.lexemes.listTranscriptionJumpTargets`) + 深链跳转回转写 + sessionStorage 态。P0-5 验收满足。B2 已接线：命中语段按 `unitId` invalidate | 列表/检索/详情/命中语段/深链/sessionStorage 回归；`LexiconPage.test` + `useLexiconSearch.test` + e2e criticalPaths `/lexicon` | 否 |
| **B3b** | 词典词条编辑表单 | L | **【✅ 已落地】** `saveLexeme` 经 `saveLexiconEntry` 从 `/lexicon` 调用；lemma / 主 gloss / citation / language / notes；新建；空 lemma 不写。不接 ChatWindow；附件仍走 B8 flag。SDD：`lexicon-entry-edit/` | 写→reload→readback；不改 R8 键分轨 | 是 |
| **B3c** | 词典额外义项与词形 | M | **【✅ 已落地】** `/lexicon` 编辑 `senses[1…]`（gloss + 可选 definition）与 `forms` transcription；空行丢弃；全部词形为空则去掉 `forms`。**sense/form 稳定 `id`**（Dexie v54 回填；save 保留已有 id；**草稿携带 id，删中间行按 id 对齐**）。无新 flag、无新表。SDD：`lexicon-senses-forms/` + `lexicon-sense-form-ids/`。不做义项树 / variant-entry | extra sense + forms write→list readback；nested id 二次保存不变；删中间行剩余 id 不变 | 是 |
| **B3d** | 词典词条硬删除 | M | **【✅ 已落地】** `/lexicon` 确认后 `deleteLexeme` 删除 `lexemes` 行、`token_lexeme_links` 与未共享附件；`list()` readback 无该 id；emit `lexeme-deleted`（`hard`）。无新 flag、无软删列。SDD：`lexicon-entry-delete/`。不做合并 / LIFT dateDeleted / 义项树 | 删除 readback；取消零写入；级联链接 | 是 |
| **B3e** | 词典 LIFT 出站 | M | **【✅ 已落地】** `/lexicon` 将当前 `lexemes` 序列化为 SIL LIFT 0.13 并下载 `.lift`。lemma→`lexical-unit`，gloss/definition→`sense`，词形→entry `<variant>`（allomorph）。只出站、不写库。无新 flag。SDD：`lexicon-lift-export/`。不做义项树 / DMLex / 附件包；不从 `/corpus` 出词典包（R5） | 空库零下载；XML 含 version=0.13 与 nested sense id；定向 vitest | 是 |
| **B3f** | 词典 LIFT 入站 | M | **【✅ 已落地】** `/lexicon` 选择 `.lift`，解析 0.13 子集后按 entry `id` upsert（覆盖已映射字段，保留 `usageCount` 等未映射字段），`list()` readback。坏 XML / 非 0.13 / 无 entry 零写入。无新 flag。SDD：`lexicon-lift-import/`。不做附件 / 三档冲突 UI | 往返 B3e XML；非法文件零 save；定向 vitest | 是 |
| **B3g** | 词典义项树 | M | **【✅ 已落地】** 既有 `senses[]` 加可选 `parentId`；编辑表单可添加子义项；删父带子；详情按 depth 缩进。LIFT 出站/入站用 `<subsense>`。无新 flag、无新表。SDD：`lexicon-sense-tree/`。不做拖拽排序 / DMLex / variant-entry | parentId write→list readback；`<subsense>` 往返；定向 vitest | 是 |
| **B3h** | 词典义项同级排序 | S | **【✅ 已落地】** 额外义项「上移/下移」整块交换同级（子树跟着走）。LIFT 入站按 sense `order` 排序。无拖拽库、无 promote/demote、无新 flag。SDD：`lexicon-sense-reorder/` | 顺序 write→list readback；`order` 与文档顺序不一致时按 `order`；定向 vitest | 是 |
| **B3i** | 词典义项提升/降级 | S | **【✅ 已落地】** 额外义项「提升/降级」只改 `parentId`（降到上一同级之下，或升到父级的上一级）。主 gloss 仍是 `senses[0]`。无拖拽、无 DMLex、无新 flag。SDD：`lexicon-sense-promote/` | parentId write→list depth readback；定向 vitest | 是 |
| **B3j** | 词典义项词类 | S | **【✅ 已落地】** `/lexicon` 编辑主义项与额外义项的 `category`（LIFT `grammatical-info`）。空白省略该键。无新表、无封闭词表、无 DMLex、无新 flag。SDD：`lexicon-sense-category/` | category write→list readback；清空后键消失；定向 vitest | 是 |
| **B3k** | 词典词条类型 | S | **【✅ 已落地】** `/lexicon` 编辑 `lexemeType`（LIFT `morph-type`）。空白省略该键。已有 `morphemeType` 保留。无封闭类型表、无 DMLex、无新 flag。SDD：`lexicon-lexeme-type/` | lexemeType write→概览 readback；清空后键消失；定向 vitest | 是 |
| **B4a-1** | 标注页壳 + IGT 列表渲染 + 键盘状态机骨架（P0-3 上·前置） | M | **【✅ 已落地】** `/annotation` 当前 text/media 只读 IGT + 键盘 reduce 骨架。Flag `annotationPageEnabled` 现默认 **true**（M1 开放）。SDD：`annotation-workspace-shell/`。按轨读 `annotationLaneReadScope`（ADR-0020）。不写 token；不接 ChatWindow / 转写 annotation controller | flag 关占位；IGT 行渲染；Space 行聚焦=playToggle、输入态=insertSpace；定向 vitest | 是 |
| **B4a-2** | 标注页 token POS/gloss 编辑 + 保存链路 + readback（P0-3 上·核心） | L | **【✅ 已落地】** 承 B4a-1：受控 POS/gloss 输入；Enter=`commitStay`；Ctrl+Enter 仅保存成功后跳行。写 `LinguisticService.units.updateTokenPos` / `updateTokenGloss`（`unit_tokens`），再 `listTokensByUnitIds` readback。SDD：`annotation-token-edit/`。不改转写文本/时间码；不接 ChatWindow / `useTranscriptionAnnotationController` / `annotationAdapters`。转写页需 reload 才见镜像 `unit.words` | 写→reload→readback；Dexie vitest | 是 |
| **B4b** | 标注页 morpheme / 手动分词 / Validator（P0-3 下半） | L | **【✅ 已落地】** 承 B4a-2：morpheme 按 `-`/`=` 分格 + gloss 写 `unit_morphemes`；token 空格/`|` 切分与与下一词合并写 `unit_tokens`；词典查询写 `token_lexeme_links`（role=`manual`）。Leipzig 内联校验 + 系统结构模板标记；模板编辑复用 `/assets/structural-profiles`。SDD：`annotation-morpheme-edit/`。不做二次自动分词 | 分词/链接/词素写→reload→readback；Leipzig invalid；定向 vitest | 是 |
| **B4c** | 标注页段播放（键盘合同接线） | M | **【✅ 已落地】** Space 行聚焦切换 `HTMLAudioElement` 段播放 `[startTime,endTime]`；输入态仍 `insertSpace`。不挂 WaveSurfer / Orchestrator。SDD：`annotation-m1-open/` | Space 非输入态切播放；无媒体 skipped；定向 vitest + e2e:chromium | 是 |
| **B4d** | 标注页 note / tag / selfCertainty | L | **【✅ 已落地】** 备注写 `user_notes`（`targetType: unit`）；标签=`category`；selfCertainty 只补丁该 `layer_units` 行。禁止第二套真源与 `resolveSelfCertaintyHostUnitId`。SDD：`annotation-m1-open/` | 写→reload→readback；R1–R8；不改转写文本/时间码 | 是 |
| **B4e** | 标注页 AutoGloss 预览采纳 | M | **【✅ 已落地】** `/annotation` 只读 `previewAutoGlossMatches`，确认后写 gloss + `token_lexeme_links`。不调用 `glossUnit` 做 preview；不接 ChatWindow。SDD：`annotation-m1-open/` | preview 零写入；采纳 readback；脏草稿跳过 | 是 |
| **B4f** | 标注页二次自动分词（保守模式） | M | **【✅ 已落地】** `/annotation` 预览 Unicode 词边界切分，无人工痕迹时确认写 `unit_tokens`；有 POS/gloss/词素/链接/脏草稿时只写 pending `alternativeAnalysis`。空原文或建议不变不写库。无新 flag。SDD：`annotation-retokenize/`。不做强制覆盖/快照回滚；不接 ChatWindow | preview 零写入；未标注 readback；已标注 candidate；定向 vitest | 是 |
| **B4g** | 标注页二次分词强制覆盖与恢复 | M | **【✅ 已落地】** 已标注句段的确认仍只写 candidate。用户再点覆盖时，先把 token/词素/链接写入 pending `retokenize-snapshot`，再替换 `unit_tokens`。恢复按原 id 写回并 reject 快照。脏草稿不覆盖。无新 flag。SDD：`annotation-retokenize-force/`。不接 ChatWindow | force write→readback；restore gloss/词素/链接；定向 vitest | 是 |
| **B4h** | 标注页结构校验面板 | M | **【✅ 已落地】** 聚焦句段把非空 gloss 交给既有结构 preview，显示切段、Leipzig 缩写问题和需复核。不调用 confirm，不写 `unit_relations`。模板编辑仍在 `/assets/structural-profiles`。无新 flag。SDD：`annotation-validator-panel/`。不做 M2 typed relation | 只读 preview；未闭合中缀需复核；定向 vitest | 是 |
| **B4i** | 标注页译文行 | S | **【✅ 已落地】** `/annotation` IGT 译文行显示同一 unit 在翻译层上的文本。无翻译层或无文本时仍是空文案。音频模态不显示。不写译文、不改转写文本。无新 flag。SDD：`annotation-translation-line/`。不做时间重叠对齐，不做 M2 typed relation | 翻译层文本出现在行上；无层时仍是空文案；定向 vitest | 是 |
| **B5a** | 语料库 P0 工作集 + 多选（P0-4 上半） | **L** | **【🟡 已落地·flag 关】** `/corpus` 当前 text 下跨媒体只读索引 + Router 会话 `corpusBasket`（与转写 `selectedUnitIds` 隔离，不落 URL/Dexie/`sessionStorage`）；筛选写入 `corpusViewState`。Flag `corpusLibraryPageEnabled` 默认 **false**。SDD：`corpus-library-workset-shell/` + `corpus-library-project-index/`。查询层 `listCorpusIndexByTextId`，无 Dexie 索引表。换 **text** 清空工作集；换 media 保留。**「写」仅指工作集/筛选态，禁止写 `layer_units`/`unit_tokens`。** 本切片不接 AI | 两 media 同列表；换 media 保留 basket；换 text 清空；定向 vitest | 是 |
| **B5b** | 语料库最小出站（text/plain + markdown，P0-4 下半） | M | **【🟡 已落地·flag 关】** 工作集复制 plain / Markdown（unit/media/时间码 + `/transcription?` 深链）；空选不写剪贴板。SDD：`corpus-library-clipboard-export/`。沿用 `corpusLibraryPageEnabled` 默认 **false**。不做 HTML/bundle/EAF；不接 ChatWindow / Resolver Core | golden 对拍 + clipboard mock；flag 关占位 e2e 不回归 | 是 |
| **B5c** | 语料 P1 HTML 剪贴板 + 诊断 + 小 bundle | M | **【🟡 已落地·flag 关】** ClipboardItem `text/html`+`text/plain` Blob；空选 `CORPUS_EXPORT_EMPTY`、超长 `CORPUS_EXPORT_TOO_LONG`、剪贴板失败 `CORPUS_EXPORT_CLIPBOARD_UNAVAILABLE`；`fflate` zip（`README.txt` + `snippets.*` + `manifest.json`）。沿用 `corpusLibraryPageEnabled` 默认 **false**。SDD：`corpus-library-html-bundle/`。不做 EAF/TextGrid 第二管线；不接 ChatWindow；不复用 B12 artifact manifest | HTML golden + ClipboardItem mock；空选不写/不下载；zip 解包对拍；flag 关占位 e2e | 是 |
| **B6** | 引用断裂态（ADR-0011，P0-6） | M | **【🟡 已落地】** `citationResolver.resolveUnitCitation` + `citationJump` 对缺失 unit 报 `CITATION_UNIT_NOT_FOUND` 且不跳转；RAG footer 在 `readModelIndexHit === false` 时省略 snippet；悬空 lexeme 链接 `CITATION_LEXEME_NOT_FOUND`。无软删列；残留 segment 不得复活已删 unit。SDD：`citation-broken-state/`。`removeUnit` 经 B2 `unit-updated` 通知消费方增量 refetch | 删 unit 后 resolve 断裂码；jump 不盲跳；footer 无旧摘录；定向 vitest | 是 |
| **B7** | 语料库 AI 分区与会话隔离（P1-1） | M | **【⬜ 未开始】** `corpusBridgeAdapter` / corpus 专用 `useAiToolCallHandler.adapters` **仓库中不存在**。A6 ✅；A7/A9/A12 主体已进 `main`（A9/A11 flag 默认 false）——**不再**把「缺 A7/A9/A12 代码」当阻塞。真正阻塞：转写 ChatWindow **会话隔离**（`TranscriptionPage.ChatWindow.tsx` 现 127 行，禁止再堆 corpus 写路径） | corpus 侧复制优先、默认不写回主链；会话与转写隔离；`check:agent-evals:smoke` | 是 |
| **B11** | 外部 MCP trust allowlist | M | **【已落地·flag 关】** `externalMcpTrustRegistry` + Dexie v51 `external_mcp_trust`；`exposeExternalMcpToolsToLlm` 对未登记 / 未启用 / flag off 零暴露；首次启用带 schema 走 A9 `inspectInbound`；Settings AI 节 flag 开才渲染。Flag `aiExternalMcpTrustEnabled` 默认 **false**。**剩余**：flag 放量。Outbound HTTP 见 **B13**。SDD：`agent-runtime-external-mcp-trust/`。**依赖 A9** | 未登记 server deny；schema 零暴露；用户显式启用；审计 readback | 是 |
| **B12** | MCP resources/prompts + AgentArtifactV0 | M | **【已落地·flag 关】** inbound `resources/list`+`read`（`jieyu://source-set/{id}`）与 `prompts/list`+`get`（A12 registry）；Dexie v52 `agent_artifacts`；AdoptionQueue `artifactIds`；`buildB5bExportManifest`。Flag `aiMcpResourcesArtifactsEnabled` 默认 **false**。SDD：`agent-runtime-mcp-resources-artifacts/`。**依赖 B11 + A12** | resource URI readback；artifact 引用链；B5b 导出清单函数 | 是 |
| **B13** | outbound Streamable HTTP MCP client | M | **【已落地·flag 关】** `externalMcpHttpClient` POST `tools/list`/`tools/call`（JSON 或 SSE `data:`）；仅 B11 已启用 origin；写向 RPC 零 fetch；audit 写 `agentRunId`。Flag `aiExternalMcpHttpClientEnabled` 默认 **false**。不引入 SDK；不改 CSP `connect-src`；不接 ChatWindow。SDD：`agent-runtime-external-mcp-http-client/`。**依赖 B11** | flag 关零 fetch；未启用 origin 零 fetch；list 经 expose 门；write RPC deny | 是 |
| **B14** | outbound MCP send-turn 接线 | M | **【已落地·flag 关】** `externalMcpTurnBridge`：`lastToolsJson` 缓存；`extmcp__<originKey>__<tool>` 进 prompt；local 空才执行 B13 `tools/call`。Settings 拉取 `tools/list`。Flag `aiExternalMcpSendTurnEnabled` 默认 **false**。不改 ChatWindow；不进 `AI_TOOL_CATALOG`；不改 CSP。SDD：`agent-runtime-external-mcp-send-turn/`。**依赖 B11+B13** | flag 关零 guide/零 HTTP；local 优先；cache-only guide | 是 |
| **B15** | Zotero/OpenAlex MCP 提供方适配 | M | **【已落地·flag 关】** `externalMcpProviderAdapters`：已知工具指纹；`tools/call` 文本 JSON → `EvidencePacketV0`（`document`）；Settings 预置只填 origin/label 草稿。Flag `aiExternalMcpProviderAdaptersEnabled` 默认 **false**。CSP 枚举环回 `8765`，不恢复 `https:` 通配；不 spawn stdio；不直连 OpenAlex REST / Zotero `:23119`。SDD：`agent-runtime-external-mcp-provider-adapters/`。**依赖 B13+B14** | flag 关零 packets / 零预置按钮；垃圾 JSON → `[]`；预置不写 Dexie | 是 |
| **B8** | 词典附件能力（引用式资产，P1-2） | M | **【已落地·flag 关】** Dexie v53 `lexeme_assets` + `lexeme_asset_links`；`linguisticServiceLexemeAssetOps`；`LexiconAttachmentSection`。Flag `lexiconAttachmentsEnabled` 默认 **false**。**不**接 `useTranscriptionData` / ChatWindow / 协作桥；**不**内嵌二进制到 lexeme；**不**复用 `media_items`。SDD：`lexicon-attachments/`。 | 写→reload→readback 保留 Blob；unlink 先断链再 refCount GC；flag 关无附件区 | 是 |
| **B9** | 分析页 /analysis | — | **受限工作台已落地（非产品级开放台）**：[ADR-0033](../../adr/0033-analysis-restricted-workspace-no-transcription-dock.md) 把 `/analysis` 做成向量索引 / 语料统计入口（复用 `TranscriptionPageAnalysisRuntime`，`visibleTabs`: embedding / stats），**不嵌波形、不升格为第二转写台**。完整科研分析工作台仍不排期 | — | — |
| **B10** | 联评门禁自动化（R1–R8，P1-5） | S | **【已落地】** `scripts/check-r1-r8-cross-page.mjs` + PR 模板勾选段；命中三页产品路径时 CI `pull_request` 要求正文逐项 `[x]` 或 `N/A`。含于 `check:all`。push 到 main 跳过。不引入 Danger.js。锚点：[治理补充规范 #r1-r8-cross-page-checklist](./标注词典语料-治理补充规范-2026-04-25.md#r1-r8-cross-page-checklist) | 触发路径缺清单失败；非触发路径 skip；N/A/`[x]` 通过；定向 vitest | 否 |

### Stage C — 对外 / 协作（拍板 1B 预留）

| ID | 切片 | 粒度 | 目标 / 落位锚点 | 验收 | SDD |
| --- | --- | --- | --- | --- | --- |
| **C1** | 对外前最小检查执行 | M | [对外前最小检查](../release-gates/对外前最小检查-2026-05-11.md)：隐私/导出范围说明、发布 smoke、**Agent 架构节（A8 + A9 + A11 + A14 抽样）** | 检查单逐项过；`test:e2e:chromium` 全绿；单次 send turn 可串联 audit + trajectory | 否 |
| **C2** | i18n 基线计划性消减（6B） | M | 拍板 6B；`check:i18n-hardcoded:guard` 不新增债 + 按目录消减；AI 文案走 `src/ai/messages/` 与 UI `dictKeys` 分离 | 基线 hits 按目标下降；guard 绿 | 否 |
| **C3a** | 字幕导出（SRT + WebVTT） | M | **【已落地】** 同一 `layer_units` 读模型（`buildOrthographyAwareExportUnits`）→ `transcriptionLiteExport` 序列化 SubRip + WebVTT（无 STYLE/NOTE/定位）→ 项目中心导出菜单 + `handleExportLite`；不写回编辑模型。锚点：`src/utils/transcriptionLiteExport.ts`、`useImportExport.handleExportLite`、`transcriptionExportCallbacks` | golden 对拍 + 定向 vitest；空语段不下载 | 否 |
| **C3b** | 表格转写导出（CSV / TSV） | M | **【已落地】** 与 C3a 同一读模型与单一 `onExportLite(format)`；RFC 4180 CSV（UTF-8 BOM）+ TSV（tab 净化）；逐语段 start/end/speaker/text/gloss | golden 对拍 + 定向 vitest | 否 |
| **C3c** | 学术 IGT LaTeX 导出（Leipzig） | L | **【已落地】** 同一 `layer_units` 读模型 + 首个翻译层 → `transcriptionIgtLatexExport` 序列化 gb4e `\gll`/`\glt`（不写回、不调 `AutoGlossService.glossUnit`）；`onExportLite('tex')` + 项目中心菜单。锚点：`src/utils/transcriptionIgtLatexExport.ts`、`LeipzigValidator`（测试断言） | golden 对拍 + Leipzig 校验通过 + 定向 vitest | 是 |
| **C3d** | Word/docx 导出 | — | **待定**：需引入 docx 生成依赖（体积/维护/许可成本需评估）。**默认不排期**，按真实诉求再决定复用方案 | — | 是（先 Research） |
| **C4** | 协作云增强（独立切片） | — | 协议与转写 bridge **已接线**；项目快照按 `textId` 裁剪、restore 禁止整库 replace-all、入站 apply 成功后再推进 cursor（ADR-0034）。词库仍不同步。增强项参考 M8–M14；**非本地切片门槛** | `gate:collaboration-cloud` / `gate:greenfield-local`（按需，release 窗口） | 视项 |

> **导出现状（2026-09-13 代码盘点）**：**已强** = 语言学交换格式 EAF/TextGrid/TRS/Flextext/Toolbox + 原生 JYT/JYM（均带 round-trip 导入）；**已有** = 声学选区 CSV/JSON、项目归档 bundle、AI 回答带引用纯文本复制、语料库工作集 plain/Markdown/HTML 剪贴板与 fflate 小 bundle（**B5b/B5c**，页面 flag 默认关）、转写字幕 SRT/WebVTT、语段表 CSV/TSV（**C3a/C3b**）与 Leipzig IGT LaTeX/`gb4e`（**C3c**，只出站不 round-trip）；**缺口** = Word(C3d 待定)。语料库轻量出站属 **B5**，勿在 C3 重复；EAF 等标准格式从 `/corpus` 接入仍待单独切片。所有导出切片须**先建内部统一读模型再序列化**，禁止反噬编辑数据模型。

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
| 2026-09-04 | **B3 词典回归**：列表选中刷新详情与命中语段、sessionStorage 往返、segment 深链、`useLexiconSearch` 单测；e2e `/lexicon` 检索框+词条列表。可选 B2 事件接线仍开。 |
| 2026-09-04 | **B4a-1**：`/annotation` 只读 IGT 壳 + 键盘骨架；`annotationPageEnabled` 默认 false。不写 token，不接 ChatWindow。下一刀 **B4a-2**。 |
| 2026-09-04 | **B4a-2**：POS/gloss 受控编辑 + `unit_tokens` 写→readback；Enter 留位、Ctrl+Enter 成功才跳行。Flag 仍默认 false。下一刀 **B4b**。 |
| 2026-09-04 | **B4b**：morpheme 写 `unit_morphemes`、手动切分/合并 `unit_tokens`、词典链接 `token_lexeme_links`、Leipzig 内联校验。Validator 模板复用结构标注配置页。Flag 仍默认 false。下一刀 **B5a**。 |
| 2026-09-05 | **B5a-1**：`/corpus` 只读列表 + 隔离会话 `corpusBasket`；flag `corpusLibraryPageEnabled` 默认 false。项目级索引与出站未开始。下一刀 **B5b**。 |
| 2026-09-05 | **B5b**：工作集 clipboard plain/Markdown 出站；空选不写剪贴板；沿用页面 flag 默认 false。下一刀 **B5a-2**。 |
| 2026-09-05 | **B5a-2**：当前 text 跨媒体查询层索引（`listCorpusIndexByTextId`）；basket 按 text 保留、换 text 清空；无 Dexie 索引表。Flag 默认 false。下一刀 **B6** 或语料 P1 HTML/bundle。 |
| 2026-09-05 | **B6**：unit 删除后 `CITATION_UNIT_NOT_FOUND`；jump 不盲跳；RAG footer 省略 index-miss snippet；悬空 lexeme 链接可诊断。无软删列。下一刀语料 P1 HTML/bundle 或 B2 接线。 |
| 2026-09-05 | **B8**：词典引用式附件（Dexie v53 `lexeme_assets` / `lexeme_asset_links`）；flag `lexiconAttachmentsEnabled` 默认 false。不接 ChatWindow / 转写 data hook。下一刀合入 B5c/B2，或 B7（仍 blocked）。 |
| 2026-09-07 | **B1 收口**：标注 URL `unitId` 聚焦；词典 outbound `lexiconReturn` 经转写 strip 保留；壳层返回词典条；R8 双写纯函数。不接 ChatWindow / ReadyWorkspace。下一刀合入 B5c/B2，或 B7（仍 blocked）。 |
| 2026-09-07 | **B10**：R1–R8 联评门禁 `npm run check:r1-r8`（路径过滤 + PR 正文勾选/N/A）；含于 `check:all`；CI PR 浅克隆先 fetch base SHA。不引入 Danger.js。下一刀合入 B5c/B2，或 B7（仍 blocked）。 |
| 2026-09-10 | **B1 滚动**：词典 `.app-main` 与语料 `.corpus-library-body` 的 `listScrollTop` 写入 sessionStorage（R8）；不双写 URL；`corpusBasket` 仍仅 Router 会话。 |
| 2026-09-10 | **B2**：`workspaceEvents.ts` 接线；LinguisticService 单写 persist 后 emit；annotation/corpus/lexicon 按 unit/lexeme 增量刷新，草稿不覆盖。`saveUnitsBatch` 不 emit。 |
| 2026-09-11 | **B5c / 语料 P1**：HTML `ClipboardItem` 双 MIME + 空选/超长/剪贴板失败诊断码 + fflate 工作集 zip。Flag 默认 false。下一刀 C3a/b 或 B4c；B7 仍 blocked on ChatWindow 会话隔离。 |
| 2026-09-11 | **后续评估**：[详细评估](../audits/后续路线图详细评估-2026-09-11.md)。B5c 随本 PR 合入。新增 **B4c/B4d/B3b** 余量行。Dogfood ≠ 产品开放。B7 按 L 估。 |
| 2026-09-11 | **C3a/C3b**：转写导出菜单 SRT/WebVTT/CSV/TSV；同一 `layer_units` 读模型只序列化。开放门槛现状表改为 flag-off 壳层 / Analysis ADR-0033，仍 NO-GO。 |
| 2026-09-13 | **C3c**：Leipzig IGT LaTeX（gb4e `\gll`/`\glt`）；`onExportLite('tex')`；不写回、不调 AutoGloss。不排 C3d Word。 |
| 2026-09-11 | **B4c/d/e 标注 M1 开放**：段播放 + `user_notes`/selfCertainty + AutoGloss 预览采纳。`annotationPageEnabled` 默认 true。SDD：`annotation-m1-open/`。余量 B4f。 |
| 2026-09-14 | **B4f**：`/annotation` 二次自动分词预览确认。未标注写 `unit_tokens` readback；已标注 pending `alternativeAnalysis`。无新 flag。SDD：`annotation-retokenize/`。下一刀 **B7**（仍 blocked on ChatWindow 会话隔离）。 |
| 2026-09-19 | **B3d**：`/lexicon` 确认后硬删除词条；级联 `token_lexeme_links` 与未共享附件；`list()` readback 无该 id；emit `lexeme-deleted`（`hard`）。无新 flag。SDD：`lexicon-entry-delete/`。下一刀仍不排 B7 / C3d / flag 放量。 |
| 2026-09-19 | **B3c**：`/lexicon` 额外义项（gloss + definition）与词形 transcription 写入既有 `senses`/`forms`；空行丢弃。无新 flag。SDD：`lexicon-senses-forms/`。下一刀仍不排 B7 / C3d / flag 放量。 |
| 2026-09-20 | **B3e LIFT 出站**：`/lexicon` 导出 SIL LIFT 0.13（lemma / sense / variant allomorph）；只出站不写库。无新 flag。SDD：`lexicon-lift-export/`。 |
| 2026-09-20 | **B3f LIFT 入站**：`/lexicon` 导入 SIL LIFT 0.13；按 entry id upsert；坏文件零写入。无新 flag。SDD：`lexicon-lift-import/`。 |
| 2026-09-25 | **B4i 译文行**：`/annotation` IGT 译文行只读显示同一 unit 的翻译层文本。无翻译层时仍是空文案。音频模态不显示。不写译文。无新 flag。SDD：`annotation-translation-line/`。下一刀仍不排 B7 / C3d / DMLex / M2 typed relation / flag 放量。 |
| 2026-09-25 | **B4h 结构校验面板**：聚焦句段只读展示 gloss 切段、Leipzig 缩写问题和需复核。不写分析图候选。模板编辑仍在结构标注配置页。无新 flag。SDD：`annotation-validator-panel/`。下一刀仍不排 B7 / C3d / DMLex / M2 typed relation / flag 放量。 |
| 2026-09-25 | **B4g 二次分词强制覆盖**：已标注句段仍先写 candidate。覆盖前把 token/词素/链接写入 pending `retokenize-snapshot`，再替换词列。恢复按原 id 写回。脏草稿不覆盖。无新 flag。SDD：`annotation-retokenize-force/`。下一刀仍不排 B7 / C3d / DMLex / flag 放量。 |
| 2026-09-25 | **B3k 词条类型**：`/lexicon` 编辑 `lexemeType`，对应已有 LIFT `morph-type`。空白省略。已有 `morphemeType` 保留。无封闭类型表、无 DMLex、无新 flag。SDD：`lexicon-lexeme-type/`。下一刀仍不排 B7 / C3d / DMLex / flag 放量。 |
| 2026-09-24 | **B3j 义项词类**：`/lexicon` 编辑 `senses[].category`，对应已有 LIFT `grammatical-info`。空白省略。无新表、无 DMLex、无新 flag。SDD：`lexicon-sense-category/`。下一刀仍不排 B7 / C3d / DMLex / flag 放量。 |
| 2026-09-24 | **B3i 义项提升/降级**：额外义项只改 `parentId`。降到上一同级之下，或升到父级的上一级。主 gloss 仍是 `senses[0]`。无拖拽、无 DMLex、无新 flag。SDD：`lexicon-sense-promote/`。下一刀仍不排 B7 / C3d / flag 放量。 |
| 2026-09-23 | **B3h 义项同级排序**：额外义项上移/下移整块；LIFT 入站按 `order`。无拖拽库、无 promote/demote、无新 flag。SDD：`lexicon-sense-reorder/`。下一刀仍不排 B7 / C3d / flag 放量。 |
| 2026-09-22 | **B3g 义项树**：`senses[].parentId`；子义项 UI + LIFT `<subsense>` 往返。无新 flag。SDD：`lexicon-sense-tree/`。下一刀仍不排 B7 / C3d / flag 放量。 |
| 2026-09-20 | **Sense/Form 稳定 id**：`senses`/`forms` nested `id`；save 保留已有、新行 `newId`；Dexie v54 回填。编辑草稿携带 id，删中间行按 id 对齐、不按下标错位。无义项树 / DMLex / 新 flag。SDD：`lexicon-sense-form-ids/`。 |
| 2026-09-20 | **B2 emit 补齐**：`saveUnitsBatch` persist 后 unique `unitId` emit；token↔lexeme 链接 save/remove emit `unit-updated`+`lexeme-updated`；unit/token/morpheme `saveUserNote` 能解析 unit 时 emit。SDD 仍 `workspace-cross-page-events/`。 |
| 2026-09-20 | **C4 快照热修**：协作项目快照按当前 `textId` 裁剪（不含词库/语言资产）；restore/水合 prune+upsert；入站 apply 成功后再推进 cursor。ADR-0034。不接协作重 gate 到 PR。 |
| 2026-09-11 | **B3b**：词典页 lemma / 主 gloss / citation / language / notes 编辑与新建；`saveLexeme` 写后 `list()` readback；空 lemma 不写。不接 ChatWindow；不改 R8 键。附件仍 flag 关。 |
