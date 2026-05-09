---
title: P0–P3 落地审查（完成度矩阵 + 链路 + 测试 + 风险）
doc_type: execution-audit
status: completed
owner: ai-governance
last_reviewed: 2026-05-07
source_of_truth: code_snapshot_review
depends_on:
  - ../plans/AI智能体架构改进方案-2026-05-06.md
---

# P0–P3 落地审查报告

本文档执行《P0–P3 落地情况多轮审查方案》中的五轮工作：验收矩阵、链路一致性、自动化测试矩阵、定向 bug 热点、规划书漂移清单。

## 1. 完成度矩阵（P0）

| 原子验收项 | 状态 | 证据锚点 | 备注 |
|------------|------|----------|------|
| `segmentReadQueries` 门面存在 | **已实现** | [segmentReadQueries.ts](../../../src/ai/queries/segmentReadQueries.ts)、[segmentReadQueries.test.ts](../../../src/ai/queries/segmentReadQueries.test.ts) | — |
| MCP `tools` 使用真实查询 | **已实现** | [tools.ts](../../../src/ai/mcp/server/tools.ts) 注释与 `listSegmentSummaries` / `getSegmentDetail` / `diagnoseProjectQuality` | 非 mock fixture |
| `localContextTools` 复用门面 | **已实现** | [localContextTools.ts](../../../src/ai/chat/localContextTools.ts) import `segmentReadQueries` | — |
| `McpServerRuntimeContext` + scope 传入 handler | **已实现** | [tools.ts](../../../src/ai/mcp/server/tools.ts) `runtimeContext`；[types.ts](../../../src/ai/mcp/server/types.ts)（如存在 `McpServerRuntimeContext`） | handler 第二参 |
| Bearer 未授权 → 401 | **已实现** | [auth.ts](../../../src/ai/mcp/server/auth.ts)、[McpServer.ts](../../../src/ai/mcp/server/McpServer.ts) `isAuthorized` / `sendUnauthorized` | — |
| 仅 loopback | **已实现** | [McpServer.ts](../../../src/ai/mcp/server/McpServer.ts) `isLoopback`、`403 Forbidden` | `127.0.0.1` / `::1` |
| limit≤100、offset≤1000 | **已实现** | [McpServer.ts](../../../src/ai/mcp/server/McpServer.ts) `routeMethod` 校验 | — |
| tools/call 30s 超时 | **已实现** | [McpServer.ts](../../../src/ai/mcp/server/McpServer.ts) `Promise.race` + `Tool call timeout` | — |
| `VITE_AI_MCP_SERVER_ENABLED` | **已实现** | [featureFlags.ts](../../../src/ai/config/featureFlags.ts) `aiMcpServerEnabledFromEnv` | 默认 false |
| `tools.test.ts` | **已实现** | [tools.test.ts](../../../src/ai/mcp/server/tools.test.ts) | — |
| tools/call **持久化审计**（宿主 scope 可复核） | **已实现** | [mcpToolCallAudit.ts](../../../src/ai/mcp/server/mcpToolCallAudit.ts)、[McpServer.ts](../../../src/ai/mcp/server/McpServer.ts) `routeMethod`；Dexie **`mcp_tool_call_audits`**（[engine.ts](../../../src/db/engine.ts) **v48**） | **独立表**（非 `audit_logs`）；**全量** `argumentsJson` + **`runtimeContextJson`**；**失败路径亦写**；best-effort；成功时 `toolResult` 超长截断（见完结报告 B1 增补） |

**P0 小结**：核心真实化、信任边界与 **`tools/call` 独立表审计**已落地；若方案仍写「全 mock / 硬编码 flag」，属**文档过时**（见 §6）。

## 2. 完成度矩阵（P1）

| 原子验收项 | 状态 | 证据锚点 | 备注 |
|------------|------|----------|------|
| 来源范围最小可解释面 | **部分实现** | [sourceScopeSummary.ts](../../../src/ai/vertical/sourceScopeSummary.ts)、[useAiChat.sendTurnStreamPhase.ts](../../../src/hooks/useAiChat.sendTurnStreamPhase.ts)、[AiChatAssistantMessage.tsx](../../../src/components/ai/AiChatAssistantMessage.tsx) `sourceScopeSummary` | 方案命名 `CorpusSourceSetSummary` 与代码 `sourceScopeSummary` 不等价字段集；未覆盖 note/document/lexeme 计数等规划表列 |
| EvidencePacket ↔ SourceSet 绑定（sourceSetSnapshot 等） | **未实现** | [evidencePacket.ts](../../../src/ai/vertical/evidencePacket.ts) 当前无 `sourceSetSnapshot` / `sourceSetId` | 仅有 `EVIDENCE_PACKET_METRIC_DEPENDENT_FIELDS` 注释提示迁移约束 |
| Evidence 低置信视觉、与 reflection 对齐 | **待核** | 需在 `AiChatAssistantMessage` / alerts 中 grep `confidence`、`< 0.5` | 本轮 grep `reflection|segmentQa` 于 AssistantMessage **无命中**；reflection 可能仍主要在 stream 层或 prompt |
| 无 evidence 明确 fallback（非静默 degraded） | **待核** | [useAiChat.sendTurnStreamPhase.ts](../../../src/hooks/useAiChat.sendTurnStreamPhase.ts) `degradationScenarios` | 需结合 UI 路径人工读代码确认 |
| Reflection 结果 UI 面板 | **未实现/弱** | `AiChatAssistantMessage` 无 `reflection`/`quality` 关键词 | 与方案「质量检查折叠面板」有差距 |
| E2E：`segmentQaEvidenceJump.spec.ts` | **已实现** | [segmentQaEvidenceJump.spec.ts](../../../tests/e2e/segmentQaEvidenceJump.spec.ts) | IndexedDB 预置助手消息 + `data-testid` 证据跳转控件 |
| segment_qa eval（完整 ≥10；允许分阶段 ≥6）+ 模板 | **未达标 / 口径已放宽** | 例：[workflow-segment-qa-select-zheduan-01.json](../../../scripts/agent-evals/cases/workflow-segment-qa-select-zheduan-01.json) 等 `workflow-segment-qa-*.json`（目录内若干条，仍远少于 10 条「专属 segment_qa golden」口径） | 路线拍板：先行波次可略少，季度内收敛；模板见 **ADR-0030** |

**P1 小结**：**sourceScopeSummary** 路径已打通；**证据契约扩展、reflection UI、专用 E2E、10+ eval** 仍为缺口。

## 3. 完成度矩阵（P2）

| 原子验收项 | 状态 | 证据锚点 | 备注 |
|------------|------|----------|------|
| `useAiChat.ts` &lt;430 行（第一阶段） | **已实现** | `wc -l` → **424** 行（审查日快照） | 优于方案 484→430 |
| architecture-guard `useAiChat` 1100 | **已实现** | [architecture-guard.config.mjs](../../../scripts/architecture-guard.config.mjs) `hookRule('useAiChat', { maxLines: 1100` | ratchet 已落地 |
| P2a 再下沉模块数（方案 4–5 个） | **部分** | [applyAssistantMessageResult.ts](../../../src/ai/chat/applyAssistantMessageResult.ts)、[backgroundMemoryRuntimeFactory.ts](../../../src/ai/chat/backgroundMemoryRuntimeFactory.ts) | 是否达到「4–5 个」需单独计数 import 下沉文件；未在本轮逐函数枚举 |
| P2b 整文件迁移 agentLoopRunner / toolDecisionPipeline | **未做** | 仍在 [useAiChat.agentLoopRunner.ts](../../../src/hooks/useAiChat.agentLoopRunner.ts)、[useAiChat.toolDecisionPipeline.ts](../../../src/hooks/useAiChat.toolDecisionPipeline.ts) | 与方案「非硬门槛」一致 |
| Voice `VoiceAgentService` &lt;950 | **已实现** | `wc -l` 主文件 **938**（审查后）；architecture-guard `maxLines: 950`；单例外移 `VoiceAgentService.singleton.ts` | 卫星模块：`sttEnhancementSync`、`adaptiveEngineSwitch`、`langAndBattery`、`wakeWordBindings` |
| 不新增 `useAiChat.*` 派生 | **待核** | hooks 目录 `useAiChat*.ts` 数量随时间变化 | 审查日 `ls useAiChat*.ts` 计数约 69（含 test）；与历史「44 生产」口径需统一计数脚本 |

**P2 小结**：**主 hook 行数与 guard 阈值**已明显进步；**Voice 减压与 P2a 数量验收**仍弱。

## 4. 完成度矩阵（P3）

| 原子验收项 | 状态 | 证据锚点 | 备注 |
|------------|------|----------|------|
| Citation / relevance 评测入口 | **已实现** | [citationJudge.ts](../../../src/ai/eval/citationJudge.ts)、[relevanceJudge.ts](../../../src/ai/eval/relevanceJudge.ts)（生产路径如 [useAiChat.sendTurnStreamPhase.ts](../../../src/hooks/useAiChat.sendTurnStreamPhase.ts) 批量/单条调用） | 无独立 `JudgeProvider.ts` 文件；契约见 ADR-0022 |
| ADR judge 契约 | **已实现** | [0022-ai-evaluation-judge-provider-contract.md](../../adr/0022-ai-evaluation-judge-provider-contract.md) | 非占位 `00xx` |
| `auditExportAdapter` | **已实现** | [auditExportAdapter.ts](../../../src/ai/audit/auditExportAdapter.ts) + test | — |
| `AiRuntimeReport` 维度聚合 + sampleRequestIds | **已实现** | [aiRuntimeReport.ts](../../../src/ai/eval/aiRuntimeReport.ts) `dimensions.byWorkflow` 等 | — |
| release evidence skip taxonomy（bundle rollup） | **部分实现** | [generate-release-evidence-bundle.mjs](../../../scripts/generate-release-evidence-bundle.mjs) 输出 **`skipTaxonomyRollup`**（`classifyReleaseEvidenceSkipTaxonomy`） | per-card `skipTaxonomy`、看板消费仍属本季度扩展项 |
| 缺陷 skip 卡片 dogfood 清零 | **目标指标（不挡合并）** | 依赖真实 dogfood 导出 JSON | 路线拍板：不作为 merge gate；仍建议跑 `gate:release-evidence:*` 追踪 |
| `workflowExplainability.ts` | **已实现** | [workflowExplainability.ts](../../../src/ai/chat/workflowExplainability.ts)、[sendTurnStreamPhase](../../../src/hooks/useAiChat.sendTurnStreamPhase.ts)、[AiChatAssistantMessage](../../../src/components/ai/AiChatAssistantMessage.tsx) | 已接流式完成路径 + 无障碍 sr-only；`AiRuntimeReport` 可选 rollup |
| Eval 回灌规则文档化 + AdoptionQueue ignore | **部分** | 方案要求；**AdoptionQueue 未进主线（P4）** | ignore 来源可能尚不存在 |

**P3 小结**：**评测契约与 runtime report 基础设施**已强；**`skipTaxonomyRollup` 已入 bundle**，**per-card `skipTaxonomy` 已注入**；**`workflowExplainability` 已落代码并接 UI/AiRuntimeReport 可选 rollup**；**端到端 dogfood 证据**仍为本季度扩展。

---

## 5. 第二轮：链路一致性摘要

### 5.1 Scope 三条路径

1. **MCP**：`McpServer` → `TOOL_HANDLERS[name]`（第一参为工具参数对象，第二参为 `runtimeContext`）→ `listSegmentSummaries(scope, ...)`，`scope` 来自 `runtimeContext.textId/mediaId/layerId`（[tools.ts](../../../src/ai/mcp/server/tools.ts)）。**三者全空时硬失败** `SEGMENT_READ_SCOPE_REQUIRED`（ADR-0030）。
2. **localContextTools**：同 `SegmentReadQueryScope`（[localContextTools.ts](../../../src/ai/chat/localContextTools.ts)）。
3. **Send-turn / RAG**：`resolveCorpusSourceSet` → `ragCitationsToEvidencePackets`（[useAiChat.sendPersistTurnAndBuildPromptContext.ts](../../../src/hooks/useAiChat.sendPersistTurnAndBuildPromptContext.ts)）。

**风险（MCP 已收口）**：MCP 路径空 scope **不再**落宽查询；**localContextTools / 门面直连**仍可能在 `{}` 下走宽过滤（见 `segmentReadQueries`），与「来源先行」语义需 UI/工具层分别提示（B1 对 MCP 子路径已缓解）。

### 5.2 Evidence 双轨

- UI 侧存在 `citations` 与 `evidencePackets` 并存历史；P1 方案要求收敛。
- 当前 `EvidencePacketV0` **无** source-set 快照字段 → audit/UI/report 对账仍可能不完整（见 bug 候选 B4）。

### 5.3 Reflection 与 degradation 链路（sendTurnStreamPhase）

- 流式完成后对 `segment_qa` / `annotation_qa` / `lexeme_candidates` 调用对应 `run*Reflection`，结果写入 `audit_logs`（`ai_segment_qa_reflection` 等 field），见 [useAiChat.sendTurnStreamPhase.ts](../../../src/hooks/useAiChat.sendTurnStreamPhase.ts) 约 L650–693。
- `reflectionFlagged` 时向 `degradationScenarios` 推入 `reflection_flagged`，并与 `sourceScopeSummary` 一并 `flushSync` 到消息（L695–712）。
- **与方案差距**：方案要求的「消息下方质量检查折叠面板」依赖 UI 消费 `degradationScenarios` / 独立 reflection DTO；若组件未展示 checks 列表，则用户侧仍弱于规划文案。

---

## 6. 第五轮：规划书漂移清单（建议修订）

| 段落/断言 | 问题 | 建议修订 |
|-----------|------|----------|
| §1.2.1「`aiMcpServerEnabled` 硬编码 false」 | 与 [featureFlags.ts](../../../src/ai/config/featureFlags.ts) 矛盾 | 改为「已支持 `VITE_AI_MCP_SERVER_ENABLED`，默认 false」 |
| §1.2「`useAiChat.ts` 508 行」 | 与快照 424 矛盾 | 统一为审查日 `wc -l` 或注明日期快照 |
| P1「`CorpusSourceSetSummary`」 | 代码为 `sourceScopeSummary.ts` + `UiChatMessage.sourceScopeSummary` | **已落实**：《架构改进方案》拍板节与 §P1 以代码名为验收真源；[ADR-0030](../../adr/0030-vertical-workflow-template-contract.md) 同步口径 |
| P1 E2E `segmentQaEvidenceJump.spec.ts` | 文件不存在 | **已落实**：`tests/e2e/segmentQaEvidenceJump.spec.ts` |
| P3「`00xx-ai-evaluation-judge-provider-contract.md`」 | 已有 [0022](../../adr/0022-ai-evaluation-judge-provider-contract.md) | **已落实**：规划书 checklist 指向 0022 |
| P3「`00xx-vertical-workflow-template-contract.md`」 | 已有 [0030](../../adr/0030-vertical-workflow-template-contract.md) | **已落实**：规划书涉及文件与阶段五引用统一为 0030 |
| P3「skip taxonomy」 | bundle 已有 `skipTaxonomyRollup` | per-card 字段与治理消费仍「进行中」 |
| P3「`workflowExplainability.ts`」 | 未落地 | **已落实**：`src/ai/chat/workflowExplainability.ts` + 流式路径 + `rollupWorkflowExplainability` |

---

## 7. 第四轮：Bug / 风险候选（按严重度）

| ID | 描述 | 触发条件 | 建议验证 |
|----|------|----------|----------|
| B1 | 空 `SegmentReadQueryScope` 时列表/诊断范围过宽（非 MCP 路径） | `textId/mediaId/layerId` 全缺 | MCP 已硬失败；localContextTools / 直连门面仍须产品提示或后续 strict 模式 |
| B2 | SSE + POST 双通道下客户端错误处理 | session 过期、乱序 message | [McpServer.test.ts](../../../src/ai/mcp/server/McpServer.test.ts) 扩展场景 |
| B3 | `total` 分页与 UI 一致性 | offset 接近上限 | `segmentReadQueries` 单测对 `total` 语义断言 |
| B4 | Evidence 无 `sourceSetSnapshot` 导致 report 无法归因 source set | 多 source RAG | 补字段或 formatter + `evidencePacket.test.ts` |
| B5 | release evidence skip 字符串无法机器区分缺陷/合理 | 聚合报表 | **`skipTaxonomyRollup` 已引入**；缺陷清零仍为**目标指标**非 merge gate |

| B0 | **已修复（审查中）** | `adoptionQueue.ts` 在 `exactOptionalPropertyTypes` 下 `accept` 分支与 `buildAdoptionOutcomeAuditMetadata` 的展开对象会推断出 `undefined` 赋给可选字段，导致 `tsc` 失败 | 改为显式构造 `AdoptionItem` / `meta` 并仅在值存在时赋值；`npm run typecheck` 与 `check:agent-evals` 已恢复通过 |

---

## 8. 第三轮：测试矩阵执行结果

> 以下命令在审查执行日于仓库根目录运行；若失败，记录于本节末尾。

（见下方「测试执行记录」小节，由脚本输出填充。）

---

## 9. 测试执行记录

**审查执行日命令与结果（仓库根目录）**

| 命令 | 结果 |
|------|------|
| `npm run check:architecture-guard` | **PASS**（含 core / doc-code-symbol-parity / timeline-single-host-entry / fire-and-forget-governance / transcription-text-telemetry-contract） |
| `npm run check:plan-and-execute:pseudo-composed` | **PASS**（Vitest 4 files, 71 tests） |
| `npm run check:plan-and-execute:checkpoint-recovery` | **PASS** |
| `npm run check:agent-evals` | **PASS**（7/7；首轮曾因 `npm run typecheck` 失败而 6/7，已修复 `adoptionQueue.ts` 的 `exactOptionalPropertyTypes` 构造后重跑为 7/7） |
| `npx vitest run`（8 个定向文件：segmentReadQueries、tools、McpServer、sourceScopeSummary、citation/relevance judge、aiRuntimeReport、auditExportAdapter） | **PASS**（8 files, 65 tests） |
| `npm run test:e2e:chromium -- tests/e2e/aiChatSendTurnSmoke.spec.ts` | **PASS**（1 test） |

**说明**：方案中的 `segmentQaEvidenceJump.spec.ts` 仍未存在于仓库；当前 E2E 以 `aiChatSendTurnSmoke.spec.ts` 为 AI 壳层 smoke。
