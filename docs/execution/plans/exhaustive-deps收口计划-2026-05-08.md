---
title: react-hooks/exhaustive-deps 剩余收口计划（2026-05-08）
doc_type: execution-plan
status: completed
owner: repo
last_reviewed: 2026-05-09
source_of_truth: exhaustive-deps-closure-2026-05-08
depends_on:
  - ./技术债滚动-2026-05-08.md
  - ../../../eslint.config.js
---

# react-hooks/exhaustive-deps 剩余收口计划（2026-05-08）

## 1. 基线与范围

### 1.1 基线快照

- **2026-05-08（计划起草）**：`npx eslint src/ -f json --max-warnings=9999`：TOTAL **840**、EXHAUSTIVE **29**、STRICT **804**。
- **2026-05-09（Batch A 验收后）**：同命令：TOTAL **807**、EXHAUSTIVE **0**、STRICT **800**（其余 **7** 条为其它 rule，以本机 `eslint` 输出为准）。`react-hooks/exhaustive-deps` 已全仓清零，后续以 **`npm run lint` / CI 防回潮** 为主；本文件 **Batch B–E** 仍可按文件做回归与 `strict-boolean` 收口。
- **2026-05-09（Batch B 文件级验收）**：Batch B 所列 **9** 文件 `npx eslint … -f json`：**EXHAUSTIVE = 0**、**STRICT = 0**；§3.4 定向 **vitest** 全绿。**说明**：当前分支 **提交态** 上全仓 `npm run lint` 仍有 **`react-hooks/exhaustive-deps` error**（与未提交本地收口不同步），故 **`quality` 暂未加入 `npm run lint`**；待提交态与「EXHAUSTIVE=0」一致后再把 `npm run lint` 并入 CI，以免误红。
- **2026-05-09（Strict 治理 S1 后）**：同命令：TOTAL **776**、EXHAUSTIVE **0**、STRICT **769**。本批次新增证据：`src/utils/orthographyIdentity.ts` 的 `@typescript-eslint/strict-boolean-expressions` **31 -> 0**，不影响本计划的 exhaustive-deps 完成态。
- **2026-05-09（Strict 治理 S2 后）**：同命令：TOTAL **666**、EXHAUSTIVE **0**、STRICT **659**。本批次新增证据：`src/utils/languageInputReducer.ts` **49 -> 0**、`src/db/engine.ts` **36 -> 0**、`src/utils/layerDisplayStyle.ts` **25 -> 0**。
- **2026-05-09（Strict 治理 S3 后）**：同命令：TOTAL **572**、EXHAUSTIVE **0**、STRICT **565**。本批次新增证据：`src/utils/layerDisplayStyle.ts` **24 -> 0**（回流复清）、`src/utils/langMapping.ts` **94 -> 0**。
- **2026-05-09（Strict 治理 S4 后）**：同命令：TOTAL **529**、EXHAUSTIVE **0**、STRICT **522**。本批次新增证据：`src/utils/transcriptionFormatters.ts` **23 -> 0**、`src/db/migrations/timelineUnitMapping.ts` **20 -> 0**。
- **2026-05-09（Strict 治理 S5 后）**：同命令：TOTAL **495**、EXHAUSTIVE **0**、STRICT **488**。本批次新增证据：`src/observability/aiTrace.ts` **17 -> 0**、`src/utils/orthographyInteropMetadata.ts` **17 -> 0**。
- **2026-05-09（Strict 治理 S6 五轮后）**：同命令：TOTAL **441**、EXHAUSTIVE **0**、STRICT **418**。本批次新增证据：`src/collaboration/cloud/projectChangeRowParse.ts` **15 -> 0**、`src/utils/transcriptionUrlDeepLink.ts` **15 -> 0**、`src/utils/camDataUtils.ts` **14 -> 0**、`src/collaboration/cloud/CollaborationClientStateStore.ts` **13 -> 0**、`src/collaboration/cloud/CollaborationPresenceService.ts` **13 -> 0**。
- **2026-05-09（Strict 治理 S7 后）**：同命令：TOTAL **323**、EXHAUSTIVE **0**、STRICT **298**。本批次新增证据：`src/db/migrations/verifyUnifiedUnitBackfill.ts`、`src/utils/transcriptionVerticalReadingGroups.ts`、`src/annotation/analysisGraphConfirmation.ts`、`src/collaboration/cloud/CollaborationAuditLogService.ts`、`src/observability/sentry.ts` 文件级 strict 清零。
- **2026-05-09（Strict 治理 S8 后）**：同命令：TOTAL **295**、EXHAUSTIVE **0**、STRICT **272**。本批次新增证据：`src/utils/iso3166CountryLabels.ts`、`src/annotation/analysisGraphProjection.ts`、`src/annotation/structuralRuleProfile.ts`、`src/db/migrations/m18LinguisticUnitCutover.ts`、`src/utils/homeTranscriptionRecordProgress.ts` 文件级 strict 清零。
- **2026-05-09（Strict 治理 S9 后）**：同命令：TOTAL **258**、EXHAUSTIVE **0**、STRICT **248**。本批次新增证据：`src/utils/panelAdaptiveLayout.ts`、`src/utils/transcriptionUnitLaneReadScope.ts`、`src/utils/waveformRuntimePreferenceSync.ts`、`src/utils/waveformViewportSizing.ts`、`src/collaboration/cloud/cloudSyncConflictHelpers.ts` 文件级 strict 清零。
- **2026-05-09（Strict 治理 S10 后）**：同命令：TOTAL **236**、EXHAUSTIVE **0**、STRICT **228**。本批次新增证据：`src/db/migrations/m41SelfCertaintyHostDepollute.ts`、`src/i18n/aiChatHybridMessages.ts`、`src/observability/metrics.ts`、`src/utils/acousticPanelDetail.ts`、`src/utils/unitSelfCertainty.ts` 文件级 strict 清零。
- **2026-05-09（Strict 治理 S11 后）**：同命令：TOTAL **241**、EXHAUSTIVE **0**、STRICT **212**。本批次新增证据：`src/workers/vadWorker.ts`、`src/collaboration/cloud/ProjectChangeCodec.ts`、`src/collaboration/cloud/collaborationProtocolGuard.ts`、`src/db/repair/migrateV11TextIdRepair.ts`、`src/extensions/extensionRuntime.ts` 文件级 strict 清零（TOTAL 受其它 rule 波动影响，STRICT 持续下降）。
- `npm run lint -- --quiet`：通过（exit code 0）

### 1.2 本计划范围（已完成）

- 仅处理 `react-hooks/exhaustive-deps` 的剩余 29 条（**已完成清零**）
- `@typescript-eslint/strict-boolean-expressions` 作为并行治理项，迁移到代码治理主计划持续推进
- 不做无关重构（保持“最小补丁 + 定向验证”）

### 1.3 完成定义（DoD）

- EXHAUSTIVE：`29 -> 0`（**2026-05-09 已达成**）
- TOTAL：在 `exhaustive-deps` 清零后，与 STRICT 基线差值缩小为 **其它 rule 条数**；长期目标仍为 **warnings 可控并逐步收紧**
- `npm run lint -- --quiet` 持续通过
- 每批次改动后都有定向 eslint 证据

---

## 2. 风险分级与执行策略

### 2.1 风险分级

- P0（高风险，最后处理）：核心编排/全局交互链路
  - `src/hooks/useAiChat.ts`
  - `src/hooks/useKeybindingActions.ts`
- P1（中风险）：时间轴/播放器/侧栏主交互
- P2（低风险）：单点依赖补齐或冗余依赖移除

### 2.2 执行顺序

1. 先做 P2（快速、低回归）
2. 再做 P1（需要组件级回归）
3. 最后做 P0（核心链路，单独一批）

每批控制在 4-8 文件，避免一次性过大变更导致回归定位困难。

---

## 3. 分批计划

## Batch A（P2）依赖冗余与简单补齐（目标 8 条）— **已完成（2026-05-09）**

### 3.1 文件清单

- `src/components/transcription/LeftRailProjectHub.tsx`（unnecessary）
- `src/hooks/useVoiceAgent.ts`（unnecessary）
- `src/hooks/useSpeakerActions.ts`（missing `speakerDraftName`）
- `src/pages/LanguageMetadataWorkspaceCustomFieldDefinitionCard.tsx`（missing `definition`）
- `src/pages/timelineReadModel.ts`（missing `input`）
- `src/pages/TranscriptionPage.Toolbar.tsx`（missing `getReviewPresetLabel`）
- `src/pages/useTranscriptionAssistantSidebarControllerInput.ts`（missing `aiChat`）
- `src/pages/useTranscriptionTimelineContentViewModel.ts`（missing `verticalProjection`）

**执行说明**：上述文件在 **2026-05-09** 上已 **无 `react-hooks/exhaustive-deps` 报告**；同批顺带消除 **`TranscriptionPage.Toolbar.tsx` / `useTranscriptionTimelineContentViewModel.ts`** 中 Batch A 范围内的 **`@typescript-eslint/strict-boolean-expressions`** 告警（ref.contains、ReactNode 条件、`verticalViewEnabled` 布尔显式化）。

### 3.2 验收命令

- `npx eslint <Batch A files> --max-warnings=9999`
- `npx vitest run src/components/transcription/LeftRailProjectHub.test.tsx src/pages/timelineReadModel.test.ts src/pages/TranscriptionPage.Toolbar.test.tsx src/pages/useTranscriptionTimelineContentViewModel.test.tsx`

---

## Batch B（P2/P1）input 与 ref 依赖补齐（目标 9 条）— **已完成（2026-05-09）**

### 3.3 文件清单

- `src/hooks/useLayerSegmentContents.ts`
- `src/hooks/useLayerSegments.ts`
- `src/hooks/useTranscriptionCloudSyncActions.ts`
- `src/hooks/useVideoPlayer.ts`
- `src/hooks/useVoiceAgentTransportControls.ts`
- `src/pages/useDeferredAiRuntimeBridge.ts`
- `src/pages/useTranscriptionDisplayStyleControl.ts`
- `src/pages/useTranscriptionLayerMetadataController.ts`
- `src/pages/useTranscriptionSectionViewModels.ts`

**执行说明（2026-05-09）**：对上述 9 文件 `npx eslint … -f json` 统计 **`react-hooks/exhaustive-deps` = 0**、**`strict-boolean` = 0**；§3.4 所列 **vitest** 已全绿。CI **`quality`** 中 **`npm run lint`** 暂缓至提交态全仓 exhaustive-deps 与本地一致后再启用（见 §1.1 追加说明）。

### 3.4 验收命令

- `npx eslint <Batch B files> --max-warnings=9999`
- `npx vitest run src/hooks/useLayerSegments.test.ts src/hooks/useTranscriptionCloudSyncActions.conflict.test.tsx src/hooks/useTranscriptionCloudSyncActions.presence.test.tsx src/pages/useTranscriptionLayerMetadataController.test.tsx`

---

## Batch C（P1）复杂表达式稳定化与交互依赖（目标 8 条）

### 3.5 文件清单

- `src/components/ai/useAiChatPinnedSummaries.ts`（complex expression）
- `src/components/SidePaneSidebar.tsx`（function dependency instability）
- `src/components/TranscriptionTimelineVerticalView.tsx`（missing `targetLayer` / `transcriptionLayers`）
- `src/hooks/useTranscriptionTimelineVerticalChrome.ts`（complex expression）
- `src/pages/TranscriptionPage.AssistantRuntime.tsx`（missing `voiceAgent`）
- `src/pages/useTranscriptionAcousticPanelState.ts`（complex expression）
- `src/pages/useTranscriptionSelectionSnapshot.ts`（missing `input`）
- `src/pages/useTranscriptionShellController.ts`（missing `input`）

### 3.6 验收命令

- `npx eslint <Batch C files> --max-warnings=9999`
- `npx vitest run src/components/TranscriptionTimelineVerticalView.suite-a.test.tsx src/components/TranscriptionTimelineVerticalView.suite-b.test.tsx src/components/TranscriptionTimelineVerticalView.suite-c.test.tsx src/components/TranscriptionTimelineVerticalView.suite-d.test.tsx src/components/SidePaneSidebar.interaction.test.tsx src/pages/useTranscriptionShellController.test.tsx src/pages/useWaveformSignalOverlays.test.tsx`

---

## Batch D（P1/P0 前置）剩余 input 依赖补齐（目标 2 条）

### 3.7 文件清单

- `src/pages/useTranscriptionSelfCertaintyController.ts`（missing `input`）
- `src/pages/useWaveformSignalOverlays.ts`（missing `input`）

### 3.8 验收命令

- `npx eslint <Batch D files> --max-warnings=9999`
- `npx vitest run src/pages/useTranscriptionSelfCertaintyController.test.tsx src/pages/useWaveformSignalOverlays.test.tsx`

---

## Batch E（P0）核心链路收口（目标 2 条）

### 3.9 文件清单

- `src/hooks/useAiChat.ts`（missing dependencies, high impact）
- `src/hooks/useKeybindingActions.ts`（missing dependencies, high impact）

### 3.10 执行约束

- 单独 PR
- 严格最小改动，不与其他文件混改
- 必须带回归测试与统计截图

### 3.11 验收命令

- `npx eslint src/hooks/useAiChat.ts src/hooks/useKeybindingActions.ts --max-warnings=9999`
- `npx vitest run src/hooks/useAiChat.test.tsx src/hooks/useAiChat.structure.test.ts src/hooks/useAiChat.agentLoopRunner.test.ts src/hooks/useKeybindingActions.test.tsx`

---

## 4. 总体验收与收口

每批完成后执行：

- `npx eslint src/ -f json --max-warnings=9999 > /tmp/jieyu-eslint.json`
- 统计脚本（TOTAL/EXHAUSTIVE/STRICT）
- `npm run lint -- --quiet`

最终收口条件：

- EXHAUSTIVE = 0（已达成）
- 最新快照（2026-05-09）：TOTAL = 241，STRICT = 212，EXHAUSTIVE = 0
- lint 门禁连续通过

---

## 5. 风险与回滚

### 5.1 主要风险

- 核心 Hook（`useAiChat.ts`）依赖补齐后可能触发重跑频率变化
- 时间轴相关 Hook 补依赖后可能暴露旧闭包问题

### 5.2 缓解策略

- 维持“每批独立 PR + 每批独立验证”
- 出现行为回归时，优先回滚当前批次，不跨批回退
- 对 `input`/对象依赖遵守单一策略：避免“对象 + 对象属性”混用引发 unnecessary 告警

---

## 6. 附录：剩余 29 条告警清单（基线快照）

1. `src/components/ai/useAiChatPinnedSummaries.ts:52`
2. `src/components/SidePaneSidebar.tsx:156`
3. `src/components/transcription/LeftRailProjectHub.tsx:567`
4. `src/components/TranscriptionTimelineVerticalView.tsx:883`
5. `src/hooks/useAiChat.ts:384`
6. `src/hooks/useKeybindingActions.ts:263`
7. `src/hooks/useLayerSegmentContents.ts:72`
8. `src/hooks/useLayerSegments.ts:166`
9. `src/hooks/useSpeakerActions.ts:766`
10. `src/hooks/useTranscriptionCloudSyncActions.ts:474`
11. `src/hooks/useTranscriptionTimelineVerticalChrome.ts:204`
12. `src/hooks/useVideoPlayer.ts:232`
13. `src/hooks/useVoiceAgent.ts:384`
14. `src/hooks/useVoiceAgentTransportControls.ts:108`
15. `src/pages/LanguageMetadataWorkspaceCustomFieldDefinitionCard.tsx:146`
16. `src/pages/timelineReadModel.ts:139`
17. `src/pages/TranscriptionPage.AssistantRuntime.tsx:188`
18. `src/pages/TranscriptionPage.Toolbar.tsx:174`
19. `src/pages/useDeferredAiRuntimeBridge.ts:137`
20. `src/pages/useTranscriptionAcousticPanelState.ts:41`
21. `src/pages/useTranscriptionAssistantSidebarControllerInput.ts:131`
22. `src/pages/useTranscriptionDisplayStyleControl.ts:184`
23. `src/pages/useTranscriptionLayerMetadataController.ts:249`
24. `src/pages/useTranscriptionSectionViewModels.ts:158`
25. `src/pages/useTranscriptionSelectionSnapshot.ts:5`
26. `src/pages/useTranscriptionSelfCertaintyController.ts:315`
27. `src/pages/useTranscriptionShellController.ts:220`
28. `src/pages/useTranscriptionTimelineContentViewModel.ts:49`
29. `src/pages/useWaveformSignalOverlays.ts:53`

---

## 7. 实施记录（追加）

| 日期 | 内容 |
|------|------|
| 2026-05-09 | Batch B 标记完成；`i18n-hardcoded-baseline` 修正（`localContextToolExecutors` vs 误列的 `executors/toolPayload`）；`quality` 暂缓加 `npm run lint`（提交态仍有 exhaustive-deps error，与未提交收口不同步）。 |
| 2026-05-09 | Strict 治理 S1：`src/utils/orthographyIdentity.ts` 完成 strict-boolean 显式判断收口，文件级告警 `31 -> 0`；全仓基线更新为 TOTAL 776 / EXHAUSTIVE 0 / STRICT 769。 |
| 2026-05-09 | Strict 治理 S2：`src/utils/languageInputReducer.ts`（49→0）、`src/db/engine.ts`（36→0）、`src/utils/layerDisplayStyle.ts`（25→0）；全仓基线更新为 TOTAL 666 / EXHAUSTIVE 0 / STRICT 659。 |
| 2026-05-09 | Strict 治理 S3：`src/utils/layerDisplayStyle.ts`（24→0，回流复清）、`src/utils/langMapping.ts`（94→0）；全仓基线更新为 TOTAL 572 / EXHAUSTIVE 0 / STRICT 565。 |
| 2026-05-09 | Strict 治理 S4：`src/utils/transcriptionFormatters.ts`（23→0）、`src/db/migrations/timelineUnitMapping.ts`（20→0）；全仓基线更新为 TOTAL 529 / EXHAUSTIVE 0 / STRICT 522。 |
| 2026-05-09 | Strict 治理 S5：`src/observability/aiTrace.ts`（17→0）、`src/utils/orthographyInteropMetadata.ts`（17→0）；全仓基线更新为 TOTAL 495 / EXHAUSTIVE 0 / STRICT 488。 |
| 2026-05-09 | Strict 治理 S6（五轮）：`src/collaboration/cloud/projectChangeRowParse.ts`（15→0）、`src/utils/transcriptionUrlDeepLink.ts`（15→0）、`src/utils/camDataUtils.ts`（14→0）、`src/collaboration/cloud/CollaborationClientStateStore.ts`（13→0）、`src/collaboration/cloud/CollaborationPresenceService.ts`（13→0）；全仓基线更新为 TOTAL 441 / EXHAUSTIVE 0 / STRICT 418。 |
| 2026-05-09 | Strict 治理 S7：`src/db/migrations/verifyUnifiedUnitBackfill.ts`、`src/utils/transcriptionVerticalReadingGroups.ts`、`src/annotation/analysisGraphConfirmation.ts`、`src/collaboration/cloud/CollaborationAuditLogService.ts`、`src/observability/sentry.ts` 文件级 strict 清零；全仓基线更新为 TOTAL 323 / EXHAUSTIVE 0 / STRICT 298。 |
| 2026-05-09 | Strict 治理 S8：`src/utils/iso3166CountryLabels.ts`、`src/annotation/analysisGraphProjection.ts`、`src/annotation/structuralRuleProfile.ts`、`src/db/migrations/m18LinguisticUnitCutover.ts`、`src/utils/homeTranscriptionRecordProgress.ts` 文件级 strict 清零；全仓基线更新为 TOTAL 295 / EXHAUSTIVE 0 / STRICT 272。 |
| 2026-05-09 | Strict 治理 S9：`src/utils/panelAdaptiveLayout.ts`、`src/utils/transcriptionUnitLaneReadScope.ts`、`src/utils/waveformRuntimePreferenceSync.ts`、`src/utils/waveformViewportSizing.ts`、`src/collaboration/cloud/cloudSyncConflictHelpers.ts` 文件级 strict 清零；全仓基线更新为 TOTAL 258 / EXHAUSTIVE 0 / STRICT 248。 |
| 2026-05-09 | Strict 治理 S10：`src/db/migrations/m41SelfCertaintyHostDepollute.ts`、`src/i18n/aiChatHybridMessages.ts`、`src/observability/metrics.ts`、`src/utils/acousticPanelDetail.ts`、`src/utils/unitSelfCertainty.ts` 文件级 strict 清零；全仓基线更新为 TOTAL 236 / EXHAUSTIVE 0 / STRICT 228。 |
| 2026-05-09 | Strict 治理 S11：`src/workers/vadWorker.ts`、`src/collaboration/cloud/ProjectChangeCodec.ts`、`src/collaboration/cloud/collaborationProtocolGuard.ts`、`src/db/repair/migrateV11TextIdRepair.ts`、`src/extensions/extensionRuntime.ts` 文件级 strict 清零；全仓基线更新为 TOTAL 241 / EXHAUSTIVE 0 / STRICT 212。 |
