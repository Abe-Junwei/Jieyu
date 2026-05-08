# AI 智能体 — 函数调用链 + 端到端数据流全面审查计划

## 审查范围

- **调用链审查**：useAiChat 全家桶、vertical workflow、tool decision pipeline、adoption queue、source set、AiRuntimeReport
- **数据流审查**：audit logging 全链路、evidence packets、reflection checks、judge results、session memory、DB 持久化

## 发现汇总（按优先级）

### P0 — Critical Bug

| # | 问题 | 影响 | 位置 |
|---|------|------|------|
| P0-1 | `ai_tool_call_intent_assessment` vs `ai_tool_call_intent` 字段名不匹配 | auditReplay 永远找不到 intent 记录，工具重放降级 | `src/ai/auditReplay.ts:171` |
| P0-2 | `ai_tool_call_intent` 数据存在 `newValue` 中，但 replay 从 `metadataJson` 读取 | intent metadata 解析总是 undefined | `src/hooks/useAiChat.toolAudit.ts:82` + `src/ai/auditReplay.ts:173` |
| P0-3 | `reflectionChecks` / `compatibilityReport` / `sourceScopeSummary` 计算后只存 React state，**不持久化到 DB** | 刷新页面后 reflection 面板、source scope 提示全部消失 | `src/hooks/useAiChat.sendTurnStreamPhase.ts` → `finalizeAssistantMessage` |

### P1 — 调用链断裂 / 悬空函数

| # | 问题 | 位置 |
|---|------|------|
| P1-1 | `collectReflectionFailedChecks()` 和 `collectToolDecisionRecords()` 实现了但**无人调用**（dead code） | `src/ai/eval/aiRuntimeReportDimensionalAudit.ts` |
| P1-2 | `generateAiRuntimeReportFromAudit()` 只聚合 3 个维度，未接线 reflection 和 tool decision | `src/ai/eval/aiRuntimeReportGenerator.ts:121` |
| P1-3 | `pruneInvalidatedSourceSets()` 纯函数存在但**从未被调用** | `src/ai/vertical/corpusSourceSet.ts` |
| P1-4 | `toRuntimeCorpusSourceSet()` / `fromRuntimeCorpusSourceSet()` 导出了但**无人 import** | `src/ai/vertical/corpusSourceSet.ts` |
| P1-5 | 9 处 `void fn()` fire-and-forget（背景内存 flush、adoption prompt、tool intent audit） | 多处 |
| P1-6 | `sendTurnPersistPhase.ts` 不存在，持久化逻辑分散在 3 个文件中 | `src/hooks/` |

### P2 — 数据流缺失（写了但没读 / 读了但没写）

| # | 问题 | 详情 |
|---|------|------|
| P2-1 | 13 个 audit log 字段写了但 report generator 从不读取 | 见下方字段表 |
| P2-2 | judge 失败时只 `log.error()`，不写 audit log | `sendTurnStreamPhase.ts:778-780` |
| P2-3 | reflection retry 调度不写 audit log | `sendTurnStreamPhase.ts:925-940` |
| P2-4 | adoption item 创建不写 audit log | `sendTurnStreamPhase.ts:831-868` |
| P2-5 | adoption auto-expiry 不写 audit log | `adoptionQueue.ts:144-161` |
| P2-6 | active source set 变更不写 audit log | `useAiChat.ts:247` |
| P2-7 | session memory reset/recommendation 不写 audit log | `useAiChat.ts:243, 387` |
| P2-8 | `oldValue` 在 6 处 audit log 中缺失 | 见下方表 |

### P3 — 类型 / 格式不一致

| # | 问题 | 位置 |
|---|------|------|
| P3-1 | `elanFlexCompatibilityWorkflow.ts` 直接构造 raw evidence packet，未用 `buildEvidencePacketV0()` | `src/ai/vertical/elanFlexCompatibilityWorkflow.ts` |
| P3-2 | `runElanFlexCompatibilityReflection` 接收 `evidencePackets` 参数但**不使用** | `src/ai/vertical/elanFlexCompatibilityWorkflow.ts` |
| P3-3 | `annotationQaReflection.ts` / `lexemeCandidatesReflection.ts` check 编号有重复 | 文件中 |

---

## 详细数据

### audit_log 字段读写对照表

| 字段 | 写入位置 | report 读取位置 | 状态 |
|------|----------|----------------|------|
| `ai_adoption_outcome` | `adoptionOutcomeAuditPersist.ts:32` | `collectAdoptionOutcomeMetadataJsons()` | ✅ |
| `ai_agent_loop_step` | `agentLoopRunner.ts:308` | 无 | ❌ 只写不读 |
| `ai_annotation_qa_reflection` | `sendTurnStreamPhase.ts:703` | 无（`collectReflectionFailedChecks` 未接线） | ❌ |
| `ai_background_memory_extraction` | `backgroundMemory.ts:202` | 无 | ❌ |
| `ai_citation_judge` | `sendTurnStreamPhase.ts:746` | `collectCitationJudgeResults()` | ✅ |
| `ai_coordination_lite` | `coordinationAuditLog.ts:23` | 无 | ❌ |
| `ai_composed_workflow_result` | `sendTurnStreamPhase.ts:980` | 无 | ❌ |
| `ai_elan_flex_compatibility_reflection` | `sendTurnStreamPhase.ts:703` | 无（死代码） | ❌ |
| `ai_lexeme_candidates_reflection` | `sendTurnStreamPhase.ts:703` | 无（死代码） | ❌ |
| `ai_relevance_judge` | `sendTurnStreamPhase.ts:765` | `collectRelevanceJudgeResults()` | ✅ |
| `ai_response_policy_resolution` | `sendPersistTurnAndBuildPromptContext.ts:331` | 无 | ❌ |
| `ai_segment_qa_reflection` | `sendTurnStreamPhase.ts:703` | 无（死代码） | ❌ |
| `ai_session_sidecar_sandbox` | `sessionSidecarAudit.ts:21` | 无 | ❌ |
| `ai_tool_call_decision` | `toolAudit.ts:59` | 无（被 `hasPersistedExecutionForRequest` 读，但非 report） | ⚠️ |
| `ai_tool_call_intent` | `toolAudit.ts:82` | `auditReplay.ts:171`（但字段名写错） | ❌ |
| `ai_user_directive_application` | `backgroundMemory.ts:255` | 无 | ❌ |
| `ai_user_directive_extraction` | `backgroundMemory.ts:238` | 无 | ❌ |
| `ai_user_directive_mutation` | `directiveSessionControls.ts:40` | 无 | ❌ |
| `ai_vertical_workflow_result` | `sendTurnStreamPhase.ts:291` | 无 | ❌ |

### 缺失 `oldValue` 的 audit log

| 字段 | 位置 |
|------|------|
| `ai_response_policy_resolution` | `sendPersistTurnAndBuildPromptContext.ts:326-337` |
| `ai_user_directive_mutation` | `directiveSessionControls.ts:35-51` |
| `ai_session_sidecar_sandbox` | `sessionSidecarAudit.ts:16-34` |
| `ai_background_memory_extraction` | `backgroundMemory.ts:196-222`（条件性缺失） |
| `ai_user_directive_extraction` | `backgroundMemory.ts:232-249` |
| `ai_user_directive_application` | `backgroundMemory.ts:250-267` |

---

## 修复方案

### 方案 A：最小修复（Critical Bug + 数据持久化）

**范围**：只修 P0 + P0-3（数据消失问题）

1. 修复 `auditReplay.ts:171` 字段名 `ai_tool_call_intent_assessment` → `ai_tool_call_intent`
2. 修复 `auditReplay.ts:173` 从 `newValue` 读取 intent assessment
3. 修复 `auditReplay.test.ts` 对应测试
4. 扩展 `finalizeAssistantMessage()` 和 DB schema 的 `ai_messages` 字段，持久化 `reflectionChecks`、`compatibilityReport`、`sourceScopeSummary`
5. 在 `sendTurnStreamPhase.ts` stream 完成时把这些字段传给 `finalizeAssistantMessage`

**优点**：改动面最小，解决最影响用户体验的问题（刷新后数据丢失）。
**缺点**：13 个只写不读的 audit 字段、死代码、缺失 audit log 都不动。

### 方案 B：完整修复（全部问题）

**范围**：P0 + P1 + P2 + P3 全部修复

在方案 A 基础上增加：

6. 接线 `collectReflectionFailedChecks()` 和 `collectToolDecisionRecords()` 到 `generateAiRuntimeReportFromAudit()`
7. 或：如果这两个收集器不被需要，删除 dead code
8. 为缺失的操作补 audit log：
   - judge 失败 → `ai_citation_judge_failure` / `ai_relevance_judge_failure`
   - reflection retry → `ai_composed_reflection_retry`
   - adoption item queued → `ai_adoption_item_queued`
   - adoption expiry → `ai_adoption_outcome` (action: expire)
   - source set 变更 → `ai_source_set_mutation`
   - session memory reset → `ai_session_memory_reset`
9. 给所有缺失 `oldValue` 的 audit log 补上 `oldValue: ''`
10. 清理悬空函数：决定 `pruneInvalidatedSourceSets` / `toRuntimeCorpusSourceSet` / `fromRuntimeCorpusSourceSet` 是删除还是接线
11. 修复 `elanFlexCompatibilityWorkflow.ts` 用 `buildEvidencePacketV0`
12. 删除未使用的 `evidencePackets` 参数
13. 修复 reflection check 编号重复

**优点**：audit 系统真正闭环，report 维度完整，代码整洁。
**缺点**：改动面大（~15 个文件），需要测试覆盖。

### 方案 C：分阶段（推荐）

**Phase 1（本周）**：方案 A 全部 + P0-1/P0-2 test 修复
**Phase 2（下周）**：P1-1~P1-4（死代码清理 / 接线）+ P3（类型修复）
**Phase 3（下下周）**：P2-1~P2-8（缺失 audit log + oldValue 补齐 + report 读端扩展）

**优点**：风险可控，每阶段可独立回滚，测试负担分散。
**缺点**：需要 3 周完成全部修复。
