# Bug Fix Plan — Prioritized by Severity

## Context

全面审计发现了 40+ 个问题，分布在以下系统：
- **Speaker 管理**：双轨路由、面板标题误导、ID 静默丢失、状态更新遗漏
- **Segment/Utterance 路由**：独立层 segment 创建时 speakerId 丢失、time_subdivision 不继承父 utterance speakerId
- **EAF Import/Export**：PARTICIPANT 往返丢失、speaker resolution case 不一致、独立转写层 segments 在空 utterances 时被跳过
- **Layer Constraint**：split/merge 不校验父边界
- **State Management**：stale closure、undo/redo 非响应式
- **Data Model**：`layer_utterances` 死代码、`Date.now()` 赋给 ISO string 字段

TypeScript 编译 ✓、测试 1024/1024 通过 ✓。

---

## Phase 1 — Speaker 管理核心修复（严重性：HIGH）

### 1.1 确认不是 bug（已更正）
**文件**: `src/components/LayerRailSidebar.tsx:548`, `src/contexts/SpeakerRailContext.tsx:192`

经核实，`SpeakerRailContext` 只暴露 `handleAssignSpeakerToSelected`（utterance-only），不暴露 `handleAssignSpeakerToSelectedRouted`。LayerRailSidebar 只能操作 utterance，不操作 segment，这是**设计上的意图**，不是 bug。

真正的 bug 在 **1.4** — 当 `activeUtteranceUnitId` 是 segment ID 时，`handleAssignSpeakerToSelected` 会被错误调用。

### 1.2 待验证 — `handleAssignSpeakerToSegments` 是否需要 `applySpeakerLocally`
**文件**: `src/pages/TranscriptionPage.Orchestrator.tsx:3270-3294`

`handleAssignSpeakerToSegments` 完成后调用 `reloadSegments()` 重新从 DB 拉数据。需验证：这是否通过 Dexie 的响应式查询触发了 UI 自动刷新，或者是否缺少 `applySpeakerLocally` 那样的局部状态更新。

**修复**: 验证 `reloadSegments()` 是否充分。如不充分，需在 segment 的局部 state（如 `selectedBatchSegmentsForSpeakerActions`）中也同步更新 speakerId。

### 1.3 面板标题改为动态
**文件**: `src/components/transcription/SpeakerAssignPanel.tsx:81`

当前标题永远显示"说话人轨道编辑"，但 utterance 场景下不是编辑轨道。

**修复**: 标题根据当前操作对象（segment / utterance）动态显示：
- 有 segment → "说话人轨道编辑"
- 无 segment → "说话人批量编辑"

### 1.4 修复 `activeUtteranceUnitId` segment ID 被错误路由到 utterance 函数
**文件**: `src/pages/TranscriptionPage.Orchestrator.tsx:3296-3302`

当 `selectedSegmentIdsForSpeakerActions.length === 0` 且 `activeUtteranceUnitId` 是 segment ID 时，`handleAssignSpeakerToSelectedRouted` 会调用 utterance-only 的 `handleAssignSpeakerToSelected()`，将 segment ID 传入 `assignSpeakerToUtterances`——找不到任何 utterance。

**修复**: 在 `handleAssignSpeakerToSelectedRouted` 的 utterance 回退路径中，增加对 `activeUtteranceUnitId` 的 segment ID 检查（如 `id.startsWith('seg-')`），如果是 segment，改为调用 `handleAssignSpeakerToSegments([activeUtteranceUnitId], ...)`。

### 1.5 修复 `batchSpeakerId` 双同步效应
**文件**: `src/hooks/useSpeakerActions.ts:148-160` vs `Orchestrator.tsx:3252-3268`

两个独立的 `useEffect` 分别同步 utterance 和 segment 的 `batchSpeakerId`，可能互相覆盖。

**修复**: 统一为一个效应，根据当前选择类型决定同步逻辑。

---

## Phase 2 — Segment/Utterance 路由核心修复（严重性：HIGH）

### 2.1 确认 bug — time_subdivision 创建时未继承 parentUtt.speakerId
**文件**: `src/pages/TranscriptionPage.Orchestrator.tsx:1188-1199`

`time-subdivision` 分支中，`newSeg` 在第 1184 行创建时只有 `speakerFocusTargetKey`（可选），但当该值为空且 `parentUtt.speakerId` 存在时，新 segment 不会继承。相比之下，`independent-segment` 分支（第 1206-1210 行）正确实现了继承逻辑：
```typescript
if (!newSeg.speakerId && overlappingUtt.speakerId) {
  newSeg.speakerId = overlappingUtt.speakerId;
}
```

**修复**: 在 `createSegmentWithParentConstraint` 调用前，添加相同的继承逻辑：
```typescript
if (!newSeg.speakerId && parentUtt.speakerId) {
  newSeg.speakerId = parentUtt.speakerId;
}
```

### 2.2 `syncUtteranceTextToSegmentationV2` 丢失 speakerId
**文件**: `src/services/LayerSegmentationTextService.ts:99-117`

V2 segment 投影时不复制 `utterance.speakerId`，导致后续 EAF 导出时 segment 无法找到 speaker。

**修复**: 在构建 `segmentDoc` 时添加 `...(utterance.speakerId ? { speakerId: utterance.speakerId } : {})`。

### 2.3 独立层 segment 无重叠 utterance 时创建孤立段
**文件**: `Orchestrator.tsx:1203-1212`

当用户在无 utterance 区域创建独立层 segment 时，segment 既无 `utteranceId` 也无 `speakerId`。

**修复**: 创建时若无重叠 utterance 且无 `speakerFocusTargetKey`，弹出提示要求用户手动指定说话人，而非静默创建孤立段。

---

## Phase 3 — EAF Import/Export 修复（严重性：CRITICAL）

### 3.1 Speaker resolution case 不一致
**文件**: `src/hooks/useImportExport.ts:462-473`

`speakerByName` 用 normalized name 做 key（`toLocaleLowerCase('zh-Hans-CN')`），但 `speakerIdMap` 用原始字符串做 key，回退时又用原始字符串查找 UUID map。

**修复**:
- `speakerIdMap` 也用 normalized key
- 回退时用 `maybeSpeakerId` 的 normalized 版本查找

### 3.2 EAF 导出时 `speakerById.get()` 对非 UUID key 失败
**文件**: `src/services/EafService.ts:471-473`

如果 `utterance.speakerId` 是原始 PARTICIPANT 字符串（如 "John"）而非 UUID，`speakerById.get("John")` 返回 undefined。

**修复**: 在查找前检查 `speakerId` 格式——如果是 UUID，走 `speakerById` 路径；如果是自由字符串，改为在 `speakers` 数组中按 name 查找。

### 3.3 独立转写层 segments 在 utterances 为空时被跳过
**文件**: `src/hooks/useImportExport.ts:730-731`

`insertedUtterances` 为空时，整个独立转写层 segment 创建块被跳过。

**修复**: 即使无 utterance，也要为独立转写层创建 segments——根据 tier 的 ANNOTATION 数据。

### 3.4 Tier PARTICIPANT 只存到第一个 utterance
**文件**: `src/services/EafService.ts:687`

**修复**: 遍历所有 utterances 时都应尝试从 `speakerIdMap` 解析 speaker，而非只在第一个 utterance 上设置。

### 3.5 待验证 — Translation 层 segments 导出查询
**文件**: `src/hooks/useImportExport.ts:151-155`

**计划描述**称 `loadSegmentExportDataForLayers` 排除了 `layerType === 'translation'` 的层，但实际代码显示翻译层**被包含**（`l.layerType === 'translation' && (l.constraint === 'independent_boundary' || l.constraint === 'time_subdivision')`）。

**待验证**: 实际 bug 是否为以下之一：
1. transcription 层 with `time_subdivision` 被排除（不在 filter 中）？
2. `loadSegmentExportData`（139-143）和 `handleExportEaf`（151-155）使用不同 filter，导致不一致？
3. 独立转写层 segments 在 `insertedUtterances` 为空时被跳过（useImportExport.ts:730-731）？

**需进一步核实**: 实际影响是什么——导出时丢segment，还是只是某些 tier 的 PARTICIPANT 不对？

---

## Phase 4 — State Management 修复（严重性：MEDIUM）

### 4.1 `handleVoiceAnalysisResult` 闭包依赖问题
**文件**: `Orchestrator.tsx:2195`

依赖数组为 `[data.pushUndo, setSaveState, data]`。`data` 是 `useTranscriptionData()` 返回的对象，包含 `pushUndo`、`setUtterances` 等方法。如果 `data` 对象引用频繁变化，可能导致回调重建。

**修复**: 改为 `[data.pushUndo, data.setUtterances, setSaveState]`，显式列出实际使用的函数，而非整个 `data` 对象。

### 4.2 `toggleVoice` 空依赖数组
**文件**: `Orchestrator.tsx:2101`

**修复**: 添加 `[toggleVoiceRef]` 到依赖数组。

### 4.3 非响应式 undo/redo 状态
**文件**: `src/hooks/useTranscriptionUndo.ts:306-309`

**修复**: 用 `useMemo` 包装 `canUndo`/`canRedo`/`undoLabel`，以 `_undoRedoVersion` 为依赖。

---

## Phase 5 — Layer Constraint 修复（严重性：MEDIUM）

### 5.1 split/merge 不校验父边界
**文件**: `src/services/LayerSegmentationV2Service.ts:149-257`

**修复**: 在 `splitSegment` 和 `mergeAdjacentSegments` 执行后，调用 `enforceTimeSubdivisionParentBounds` 校验结果是否超出父边界。

### 5.2 Segment 创建时缺少 constraint 验证
**文件**: `LayerSegmentationV2Service.ts:20-39`

**修复**: `createSegment` 和 `createSegmentWithContentAtomic` 应在执行前验证 layer constraint。

---

## Phase 6 — Data Model 修复（严重性：LOW）

### 6.1 确认 bug — `Date.now()`（number）赋给 ISO string 字段
**文件**: 多处

DB schema 中 `createdAt`/`updatedAt` 定义为 `string` 类型，但以下位置错误地赋值为 `Date.now()`（number）：
- `UserBehaviorStore.ts:189`
- `ReportGenerator.ts:330`
- `ProjectMemoryStore.ts:100, 214, 261, 302, 332`
- `userBehaviorDB.ts:153`
- `ConversationalState.ts:215`
- `useAiToolCallHandler.ts:360`

**修复**: 全部改为 `new Date().toISOString()`。

### 6.2 `layer_utterances` 死代码清理
**文件**: `src/db/index.ts`

**修复**: 评估是否删除整个表（需确认无任何消费者）。如决定启用物化方案（Plan A），则补全写路径；否则删除表定义及 v27 migration 中的填充代码。

---

## 验证方式

1. `npx tsc --noEmit` — 0 errors
2. `npx vitest run` — 1024/1024 通过
3. 手动测试场景：
   - Lasso 选中独立层 segment → 面板正确显示"说话人轨道编辑" → 指派后 DB 和 UI 均更新
   - Lasso 选中 utterance（无 segment）→ 面板显示"说话人批量编辑" → 指派后 utterance 更新
   - EAF 导入 → 导出 → 再次导入，speaker 信息保留
   - 在 time_subdivision 层创建 segment → speakerId 正确继承父 utterance

---

## 关键文件

修改涉及的核心文件：
- `src/pages/TranscriptionPage.Orchestrator.tsx`（路由逻辑、segment 创建）
- `src/hooks/useSpeakerActions.ts`（speaker 指派逻辑）
- `src/services/LayerSegmentationTextService.ts`（V2 投影）
- `src/services/EafService.ts`（EAF 导入/导出）
- `src/hooks/useImportExport.ts`（导入/导出编排）
- `src/services/LayerSegmentationV2Service.ts`（segment CRUD）
- `src/services/LinguisticService.ts`（speaker 指派到 DB）
- `src/hooks/useTranscriptionUndo.ts`（undo/redo 状态）
