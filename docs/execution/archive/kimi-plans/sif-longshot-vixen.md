# 全链路代码审查计划：对照规划书 + ADR-0030

## 目标

对 P0–P5 全部落地代码进行多轮次系统性审查，验证：
1. 规划书《AI智能体架构改进方案-2026-05-06》中的验收标准是否完全满足
2. ADR-0030 的 7 项决策是否在代码中有准确对应
3. 跨阶段接口一致性、类型安全、边界条件是否存在 bug

## 审查方案

采用 **三轮递进审查 + 一轮回归验证**：

### Round 1：ADR-0030 契约一致性审查（决策级）

逐条对照 ADR-0030 的 7 项决策，检查代码实现与文档契约的匹配度。

| ADR 决策 | 审查文件 | 审查要点 |
|---------|---------|---------|
| 1. Naming source of truth (`sourceScopeSummary`) | `src/ai/vertical/sourceScopeSummary.ts`, `src/ai/chat/chatDomain.types.ts`, `AiChatAssistantMessage.tsx` | 代码中是否全部使用 `sourceScopeSummary`，无 `CorpusSourceSetSummary` 残留；`UiChatMessage` 类型与组件消费一致 |
| 2. Empty read scope (MCP) | `src/ai/mcp/server/tools.ts`, `McpServer.test.ts`, `tools.test.ts` | 三个 read tool 在空 scope 时是否返回 `SEGMENT_READ_SCOPE_REQUIRED` + `isError: true`；是否有单测覆盖空 scope 路径 |
| 3. Vertical workflow template | `src/ai/vertical/*Reflection.ts`, `verticalWorkflowRegistry.ts`, `scripts/agent-evals/cases/` | 四个 workflow 的 reflection 结果类型是否统一（`reflectionFlagged`/`checks[]`/`summary`）；eval case 字段集是否一致 |
| 4. segment_qa eval volume | `scripts/agent-evals/suite.v1.json`, `cases/` | 当前 case 数量是否 ≥6；是否覆盖规划书中的 6 类语言资料场景 |
| 5. Release evidence skip taxonomy | `scripts/generate-release-evidence-bundle.mjs`, `.test.ts` | `skipTaxonomyRollup` 是否存在且 schemaVersion=1；`skipTaxonomy` 是否在 skipped 节点上注入；测试覆盖 |
| 6. Dogfood defect-class skips | `docs/execution/audits/`, release evidence 最新输出 | 当前缺陷 skip 数是否为 0（目标指标）；是否合理 skip 与缺陷 skip 是否已区分 |
| 7. VoiceAgentService size | `src/services/VoiceAgentService.ts`, `architecture-guard.config.mjs` | 物理行数是否 <950；卫星模块是否正确外迁 |

**Round 1 预期发现（基于已有扫描）**：
- ✅ ADR-1: `sourceScopeSummary` 命名统一，未发现 `CorpusSourceSetSummary` 残留
- ✅ ADR-2: `tools.ts` 中三个 tool 均正确返回 `SEGMENT_READ_SCOPE_REQUIRED` + `isError: true`
- ⚠️ ADR-2: `tools.test.ts` 10 个测试，需验证是否覆盖空 scope 路径
- ⚠️ ADR-4: eval cases 仅 5 个 JSON 文件，需精确计数验证是否 ≥6
- ✅ ADR-5: `skipTaxonomyRollup` 已落地，`generate-release-evidence-bundle.test.ts` 有 18 个测试
- ⚠️ ADR-6: 需查看最新 release evidence 审计输出确认缺陷 skip 状态
- ✅ ADR-7: `VoiceAgentService.ts` 938 行，<950；architecture-guard 上限 950

### Round 2：P0–P5 阶段落地审查（验收级）

逐阶段对照规划书验收标准，检查功能完整性与测试覆盖。

#### P0 MCP 真实化

| 验收标准 | 状态 | 审查动作 |
|---------|------|---------|
| `jieyu_list_segments` 返回真实语段 | ✅ | `tools.ts:111` 调用 `listSegmentSummaries` |
| `jieyu_get_segment_detail` 返回真实字段 | ✅ | `tools.ts:133` 调用 `getSegmentDetail` |
| `jieyu_diagnose_quality` 返回真实诊断 | ✅ | `tools.ts:159` 调用 `diagnoseProjectQuality` |
| 新增 `tools.test.ts` | ✅ | 存在，`tools.test.ts` 10 个测试 |
| `featureFlags.aiMcpServerEnabled` 环境可控 | ✅ | `featureFlags.ts` 读取 `VITE_AI_MCP_SERVER_ENABLED` |
| `segmentReadQueries.ts` 存在 | ✅ | 存在，287 行 |
| `localContextTools.ts` 已迁移/复用门面 | ✅ | `localContextTools.ts:9` import 了 `segmentReadQueries` 门面 |
| 未授权返回 401 | ✅ | `auth.ts` + `McpServer.test.ts:88-92` |
| 非 loopback 被拒绝 | ✅ | `McpServer.ts:177-191` |
| limit >100 返回错误 | ✅ | `McpServer.ts:249` |
| offset >1000 返回错误 | ✅ | `McpServer.ts:251` |
| tools/call 超时 30s | ✅ | `McpServer.ts:261` |

**P0 潜在问题**：
- `tools.ts:104` 中 `offset` 没有上限钳制（handler 层只钳制了 `limit`），但 `McpServer.ts:251` 在 server 层已钳制 offset >1000。需确认双层钳制不会冲突。
- `segmentReadQueries.ts` 的 `offset` 参数在门面层没有上限检查，完全依赖调用方（MCP server）的钳制。若 localContextTools 直接调用门面，可能传入超大 offset。

#### P1 segment_qa 产品化

| 验收标准 | 状态 | 审查动作 |
|---------|------|---------|
| `sourceScopeSummary` 在消息中可见 | ✅ | `AiChatAssistantMessage.tsx` 渲染条件存在 |
| EvidencePacket ↔ SourceSet 绑定契约 | ✅ | `evidencePacket.ts` 有 `sourceSetId`/`sourceMemberId`/`scopeSnapshot` |
| Evidence card confidence 分级 | ✅ | `AiChatAssistantMessage.tsx` 低置信 `<0.5` 警告条 |
| 无 evidence fallback UI | ✅ | `AiChatAssistantMessage.tsx` 无证据 fallback 提示 |
| Reflection 面板 | ✅ | `AiChatAssistantMessage.tsx` `.ai-chat-reflection-panel` |
| 低置信警告条 | ✅ | `AiChatAssistantMessage.tsx` `.ai-chat-low-confidence-banner` |
| Citation jump E2E | ✅ | `segmentQaEvidenceJump.spec.ts` 通过 |
| `suite.v1.json` 包含 segment_qa cases | ⚠️ | 仅 5 个 JSON case 文件，需验证是否 ≥6 |
| segment_qa eval ≥10 条（允许分阶段 ≥6） | ⚠️ | 需精确统计当前 case 数 |

**P1 潜在问题**：
- `mapHistoryRowsToUiMessages` 在 `useAiChat.conversationState.ts` 中新增 `reflectionChecks`/`compatibilityReport` 映射后，**未验证** `sourceScopeSummary` 是否也在水合时被正确映射。如果 `sourceScopeSummary` 不在 `AiMessageDoc` schema 中，页面刷新后会丢失。
- `segmentQaReflection.test.ts` 20 个测试，但规划书要求覆盖 6 类语言资料场景（断句边界、跨层引用、gloss/POS 冲突、低资源语言混合脚本、引用原文为空、无证据拒答），需验证测试是否覆盖这些场景。

#### P2 主 Hook 结构减压

| 验收标准 | 状态 | 审查动作 |
|---------|------|---------|
| `useAiChat.ts` <430 行 | ✅ | 462 行（略超 430，但 <1100 guard 上限） |
| P2a 下沉 4-5 个纯函数 | ⚠️ | 已下沉 `applyAssistantMessageResult`、`backgroundMemoryRuntimeFactory`，需精确计数 |
| P2b agentLoopRunner/toolDecisionPipeline helper 下沉 | ✅ | `src/ai/chat/agentLoopRunner.ts` 和 `toolDecisionPipeline.ts` 已存在 |
| `useAiChat.*.ts` 不再新增 | ✅ | 无新增派生文件 |
| architecture-guard ratchet 1100 | ✅ | `config.mjs` 上限 1100 |
| `VoiceAgentService.ts` <950 | ✅ | 938 行 |

**P2 潜在问题**：
- `useAiChat.ts` 462 行，超过规划书第一阶段目标 `<430`。虽然 architecture-guard 1100 的硬上限未突破，但规划书的 `<430` 是明确的第一阶段目标。
- P2a 目标"至少再下沉 4-5 个纯函数"，需精确统计已落地的纯函数数量，判断是否满足。

#### P3 评估体系

| 验收标准 | 状态 | 审查动作 |
|---------|------|---------|
| `JudgeProvider.ts` 接口存在 | ✅ | 存在，34 行 |
| citation/relevance judge 实现接口 | ⚠️ | 需验证 `citationJudge.ts`/`relevanceJudge.ts` 是否 implements `JudgeProvider` |
| Dogfood 连续 2 周生成有效 `AiRuntimeReport` | ⚠️ | 需检查 `aiRuntimeReport.test.ts` 是否覆盖聚合维度 |
| `AiRuntimeReport` 统计 source/fallback/reflection | ✅ | `aiRuntimeReport.ts` 有 `byWorkflow`/`byProvider`/`bySourceScope` 聚合 |
| `skipTaxonomyRollup` 已落地 | ✅ | `generate-release-evidence-bundle.mjs` 已注入 |
| 缺陷 skip 趋近 0 | ⚠️ | 需查看最新 release evidence 输出 |
| Eval candidate 回灌规则已文档化 | ⚠️ | 需检查是否有文档记录回灌规则 |

**P3 潜在问题**：
- `aiRuntimeReport.test.ts` 17 个测试，但规划书要求 "每个异常聚合指标都有 sample request ids"。需验证测试是否覆盖 sample traceability。
- `buildSkipTaxonomyRollup` 的测试覆盖需要验证缺陷类 skip 是否正确分类。

#### P4 垂直复制 + AdoptionQueue

| 验收标准 | 状态 | 审查动作 |
|---------|------|---------|
| `VerticalWorkflowTemplate` 契约 ADR | ✅ | ADR-0030 已发布 |
| `annotation_qa` reflection + fallback | ✅ | `annotationQaReflection.ts` 存在，7 个测试 |
| `lexeme_candidates` reflection + fallback | ✅ | `lexemeCandidatesReflection.ts` 存在，7 个测试 |
| `AdoptionCandidateV0` 契约 | ⚠️ | 实际实现为 `AdoptionItem`（非 `AdoptionCandidateV0`），需检查字段是否匹配规划书 |
| AdoptionQueue 支持 accept/ignore/copy/jump | ✅ | `adoptionQueue.ts` 状态机和动作存在 |
| accept 仅 proposal+confirm+audit | ✅ | `adoptionQueue.ts` 注释明确说明 |
| AdoptionQueue 状态机单测 | ✅ | `adoptionQueue.test.ts` 15 个测试 |
| Composed workflow reflection retry | ✅ | `composedWorkflowTemplates.ts` + `useAiChat.ts` 实现 |
| 三个 `evalSuiteId` 均有 cases | ⚠️ | 仅 5 个 case 文件，需验证覆盖 |

**P4 潜在问题**：
- 规划书要求 `AdoptionCandidateV0` 字段：id, workflowId, outputKind, title, summary, evidencePackets[], recommendedAction, writeMode, status, requestId。实际实现为 `AdoptionItem`（`adoptionQueue.ts`），字段为 id, workflowId, requestId, status, summary, evidencePacketIds, rawContent, outcomeContent, reasonCode, actionLabel。**字段不完全匹配**：缺少 `outputKind`、`title`、`recommendedAction`、`writeMode`；多了 `rawContent`、`outcomeContent`、`reasonCode`、`actionLabel`。需确认是否为有意简化。
- `annotationQaReflection.test.ts` 和 `lexemeCandidatesReflection.test.ts` 各仅 7 个测试，相比 `segmentQaReflection.test.ts` 的 20 个，覆盖密度不均。

#### P5 Source Set + ELAN/FLEx

| 验收标准 | 状态 | 审查动作 |
|---------|------|---------|
| Source set 可保存/复用/切换 | ✅ | `corpusSourceSet.ts` 生命周期完整 |
| Source set 生命周期测试 | ✅ | `corpusSourceSet.test.ts` 27 个测试 |
| `elan_flex_compatibility` workflow | ✅ | `elanFlexCompatibilityWorkflow.ts` 存在 |
| 5 类 finding 覆盖 | ⚠️ | 需验证是否覆盖 tier 映射、词条冲突、时间码缺口、gloss/POS 不一致、受控词表不一致 |
| 每条 finding 有 evidence/jump/recommendedAction | ✅ | `CompatibilityFinding` 接口包含这些字段 |
| 报告可导出 markdown/JSON | ✅ | `compatibilityReportToMarkdown` + `compatibilityReportToJsonBundle` |
| EAF/FLEx fixture | ⚠️ | 需验证是否有真实 EAF/FLEx fixture |

**P5 潜在问题**：
- `corpusSourceSet.ts` 有 `deleteSavedSourceSet` 但无 UI 入口（`AiSourceSetBar.tsx` 只有创建按钮，无删除按钮）。规划书要求生命周期包含 `delete`，但 UI 可能未完全覆盖。
- `elanFlexCompatibilityWorkflow.test.ts` 21 个测试，但规划书要求覆盖 5 类 finding。需验证测试是否覆盖全部 5 类。

### Round 3：跨阶段一致性 + Bug 审查（工程级）

#### 3.1 命名一致性
- [ ] `sourceScopeSummary` 在全部 4 个 workflow 中是否一致使用
- [ ] `EvidencePacketV0` 字段在 citation、audit、runtime report 中是否使用同一口径
- [ ] `reflectionChecks` 的 `name` 字段是否在 i18n 中有对应文案

#### 3.2 类型安全
- [ ] `exactOptionalPropertyTypes: true` 下所有可选字段赋值是否使用 spread 模式
- [ ] `aiMessageDocSchema` 中新增的 `reflectionChecks`/`compatibilityReport` 是否导致现有数据验证失败（Dexie 存量数据可能没有这些字段）
- [ ] `AiChatMessageThread.tsx` 的 `AssistantMessage` 类型与 `AiChatAssistantMessage.tsx` 的 `AssistantMessage` 类型是否同步

#### 3.3 边界条件
- [ ] MCP `offset` 在 `segmentReadQueries.ts` 门面层没有上限检查，localContextTools 直接调用时可能传入超大值
- [ ] AdoptionQueue `expired` 状态的自动清理是否已接入（`pruneExpiredItems` 存在但需确认调用方）
- [ ] Composed workflow retry 计数器在并发 send 时是否线程安全（React 单线程但多个 send 可能嵌套）
- [ ] `useAiChat.ts` 中 `composedState` 在嵌套 send 后读取最新快照，但 `reflectionResult` 在 stream phase 中是否也使用最新快照

#### 3.4 水合与持久化
- [ ] `sourceScopeSummary` 是否持久化到 `ai_messages` 并在水合时恢复（当前 `mapHistoryRowsToUiMessages` 未映射该字段）
- [ ] `reflectionChecks` 和 `compatibilityReport` 的水合映射已修复，但需验证 `workflowExplainability` 是否也正确水合
- [ ] `adoptionItems` 是组件本地 state，页面刷新后丢失。规划书要求 "outcome audit"，但 adoption queue 本身不持久化到 IndexedDB，刷新后 pending items 消失。

#### 3.5 测试覆盖缺口
- [ ] `segmentQaReflection.test.ts` 20 个测试 vs `annotationQaReflection.test.ts`/`lexemeCandidatesReflection.test.ts` 各 7 个——覆盖密度不均
- [ ] `agent-evals` case 文件仅 5 个，规划书要求 segment_qa ≥6
- [ ] E2E 测试中 `compatibilityReportRendering` 和 `reflectionPanelRendering` 通过，但 `adoptionQueue` 的 E2E 未覆盖（因为 adoptionItems 是本地 state，无法通过 IndexedDB fixture 预置）

### Round 4：回归验证

在审查完成后，运行以下验证命令：
1. `npm run typecheck`
2. `npx vitest run src/ai/vertical/`（全部 vertical 测试）
3. `npx vitest run src/ai/eval/`（eval 测试）
4. `npx vitest run src/ai/mcp/server/`（MCP 测试）
5. `npx playwright test tests/e2e/compatibilityReportRendering.spec.ts tests/e2e/reflectionPanelRendering.spec.ts tests/e2e/sourceSetBarSmoke.spec.ts --project=chromium`
6. `npm run check:docs-governance`

## 审查时间线

| 轮次 | 预计时间 | 产出 |
|------|---------|------|
| Round 1 | 1-2h | ADR-0030 契约一致性报告 |
| Round 2 | 2-3h | P0-P5 阶段落地完整度报告 |
| Round 3 | 2-3h | Bug 与风险清单 |
| Round 4 | 1h | 回归验证报告 |

## 审查产出物

1. **审查报告**（markdown）：按 P0-P5 分阶段列出验收标准满足度、发现的 bug、建议修复
2. **Bug 修复 PR**：对 Round 3 中发现的高优先级 bug 直接修复
3. **ADR-0030 更新**：若发现契约与代码不一致，更新 ADR 或代码
