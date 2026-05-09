---
title: Wave 2.1 深度拆分规划：localContextToolExecutors.ts
doc_type: architecture-plan
status: active
owner: repo
last_reviewed: 2026-05-08
source_of_truth: wave-2-1-localContextToolExecutors-split-plan
---

# Wave 2.1 深度拆分规划：`localContextToolExecutors.ts`

> 文件：1876 行 | 阈值：2200（临时 ratchet）| 拆分后目标：原文件 < 500 行，子文件各 < 600 行
> 约束：只有一个公共 API `executeLocalContextToolCall`，内部函数可自由重组

---

## 一、依赖分析结论

### 1.1 共享基础设施（调用方 ≥ 3）

| 函数 | 调用方数 | 处理方案 |
|------|---------|---------|
| `buildReadModelMetaWithSource` | 8 | 拆到 `executors/readModelMeta.ts`，各模块 import |
| `normalizeTextValue` | 6 | 拆到 `executors/argNormalizers.ts`，各模块 import |

### 1.2 无循环依赖风险

- `getSpeakerBreakdown` → `filterRowsByScope` → `timelineViewsToNormalizedRows`（单向链）
- `resolveContextTextId` → `loadNormalizedUnitRows` → `normalizedUnitRowsFromContext`（单向链）
- `buildListUnitsPageResult` → `resolveExpectedTotalForScope` + `sortNormalizedUnitRows`（单向）
- **没有任何 timeline/speaker 函数反向调用 list/speaker/note 执行器**

### 1.3 外部 import 清单

原文件依赖的外部模块（拆分时各子文件按需保留）：
- `../../db`（getDb, NoteCategory, SegmentMetaDocType, UserNoteDocType, LayerUnitStatus）
- `../../hooks/timelineUnitView`（TimelineUnitView）
- `../../services/LayerSegmentationTextService`（listUnitTextsByUnit）
- `../../services/SegmentMetaService`（SegmentMetaService）
- `../../services/WorkspaceReadModelService`（WorkspaceReadModelService）
- `../queries/segmentReadQueries`（listSegmentSummaries, getSegmentDetail, diagnoseProjectQuality）
- `./localContextToolScopeNormalize`（normalizeUnitScope, LocalUnitScope）
- `./intentTools`（findIncompleteUnits, diagnoseQuality, batchApply, suggestNextAction）
- `../../observability/*`（createLogger, generateTraceId, startAiTraceSpan, createMetricTags, recordMetric）

---

## 二、拆分模块设计

### Module Z：`executors/argNormalizers.ts`（~70 行）

**职责：** 所有工具参数的通用归一化辅助函数

```typescript
export function normalizeTextValue(value: unknown): string
export function tokenizeLocalSearchQuery(query: string): string[]
export function normalizeLimit(value: unknown, fallback = 5): number
export function normalizeOffset(value: unknown, fallback = 0, maxOffset = 500): number
export function normalizeBoolean(value: unknown, fallback = true): boolean
export function normalizeLayerTypeFilter(value: unknown): 'transcription' | 'translation' | undefined
export const LIST_UNITS_DEFAULT_OFFSET_MAX = 500
export const LIST_UNITS_SNAPSHOT_OFFSET_MAX = 10_000_000
```

**被谁 import：** coreExecutors, noteExecutors, speakerBreakdown, timelineExecutors, searchAndList

---

### Module Y：`executors/readModelMeta.ts`（~20 行）

**职责：** 构建 LocalContextToolResult 的 readModel meta 字段

```typescript
export function buildReadModelMetaWithSource(...)
```

**被谁 import：** coreExecutors, noteExecutors, speakerBreakdown, timelineExecutors, projectStats, searchAndList

---

### Module 1：`executors/coreExecutors.ts`（~90 行）

**职责：** 无状态的简单列表/查询执行器

```typescript
export function listLayers(context, args): LocalContextToolResult
export function listLayerLinks(context): LocalContextToolResult
export function getUnsavedDrafts(context): LocalContextToolResult
export function listSpeakers(context): LocalContextToolResult
export function listNotes(context): LocalContextToolResult
export function getVisibleTimelineState(context): LocalContextToolResult
```

**内部依赖：** 只依赖 `buildReadModelMetaWithSource`、`normalizeLayerTypeFilter`

---

### Module 2：`executors/noteExecutors.ts`（~150 行）

**职责：** Note 查询与辅助函数

```typescript
export function normalizeNotesDetailLimit(value: unknown): number
export function normalizeNoteCategoryFilter(value: unknown): NoteCategory | undefined
export function firstNoteContentPreview(content: unknown, maxChars: number): string
export function noteHostTargetId(note: UserNoteDocType): string | undefined
export function noteMatchesTimelineScope(...)
export async function listNotesDetail(context, args): Promise<LocalContextToolResult>
export async function listNotesByTarget(...): Promise<LocalContextToolResult>
```

**内部依赖：** `buildReadModelMetaWithSource`

---

### Module 3：`executors/timelineExecutors.ts`（~320 行）

**职责：** Timeline 数据模型、段元数据查询、行归一化

```typescript
export interface NormalizedUnitRow { ... }
export type SegmentMetaScopeResolution = ...

export function timelineViewsToNormalizedRows(views): NormalizedUnitRow[]
export function filterRowsByScope(context, rows, scope): NormalizedUnitRow[]
export function resolveExpectedTotalForScope(context, scope): number | undefined
export function normalizedUnitRowsFromContext(context): NormalizedUnitRow[] | null
export function loadNormalizedUnitRows(context): NormalizedUnitRow[]
export function resolveSegmentMetaScopeParams(context, scope): ...
export function mapSegmentMetaRows(rows): NormalizedUnitRow[]
export function resolveSegmentReadQueryScope(context, scope): ...
export function mapSegmentSummariesToRows(rows): SegmentMetaDocType[]
export async function listAllSegmentSummariesForScope(scope): Promise<SegmentSummary[]>
export async function loadScopedSegmentMetaRows(context, scope): Promise<SegmentMetaDocType[] | null>
export function sortNormalizedUnitRows(rows, sort): NormalizedUnitRow[]
```

**内部依赖：** `normalizeTextValue`、`buildReadModelMetaWithSource`
**被谁 import：** speakerBreakdown, searchAndList, projectStats

---

### Module 4：`executors/speakerBreakdown.ts`（~130 行）

**职责：** Speaker 统计分析（原文件最大单个函数）

```typescript
export function getSpeakerBreakdown(context, args): LocalContextToolResult
```

**内部依赖：** `filterRowsByScope`、`loadNormalizedUnitRows`、`buildReadModelMetaWithSource`、`normalizeTextValue`（均来自 timelineExecutors / readModelMeta / argNormalizers）

---

### Module 5：`executors/projectStats.ts`（~70 行）

**职责：** 项目统计与质量指标

```typescript
export function normalizeQualityMetric(value: unknown): ...
export function resolveContextTextId(context): string | undefined
export function resolveSnapshotScopeParams(context, scope): ...
export async function getProjectStats(context, args): Promise<LocalContextToolResult>
```

**内部依赖：** `loadNormalizedUnitRows`（来自 timelineExecutors）、`normalizeTextValue`

---

### Module 6：`executors/batchAndDiagnose.ts`（~100 行）

**职责：** 批量操作与质量诊断（使用 snapshot 回退）

```typescript
export async function findIncompleteUnitsWithSnapshots(context, args): Promise<LocalContextToolResult>
export async function batchApplyWithSnapshots(context, args): Promise<LocalContextToolResult>
export async function diagnoseQualityWithSnapshots(context, args): Promise<LocalContextToolResult>
```

**内部依赖：** 无（调用外部 `findIncompleteUnits`、`diagnoseQuality`、`batchApply`）

---

### Module 7：`executors/searchAndList.ts`（~220 行）

**职责：** 单元搜索、分页列表、详情查询

```typescript
export function buildListUnitsPageResult(...)
export async function listUnits(context, args): Promise<LocalContextToolResult>
export async function searchUnits(context, args): Promise<LocalContextToolResult>
export async function getUnitDetail(args, context): Promise<LocalContextToolResult>
```

**内部依赖：** `buildReadModelMetaWithSource`、`normalizeLimit`、`normalizeOffset`、`normalizeTextValue`、`resolveExpectedTotalForScope`、`sortNormalizedUnitRows`

---

### Module 8：`executors/linguisticMemory.ts`（~60 行）

**职责：** 语言学记忆查询

```typescript
export function mapLayerType(value: unknown): ...
export function mapLinguisticMemoryNoteRows(rows): LinguisticMemoryNoteView[]
export async function getUnitLinguisticMemory(args, context): Promise<LocalContextToolResult>
```

**内部依赖：** 无

---

### Module 9：`executors/toolPayload.ts`（~50 行）

**职责：** 结果后处理与 payload 构建

```typescript
export function attachReadModelToToolPayload(context, result): unknown
export function finalizeLocalContextToolResult(context, out): LocalContextToolResult
export function buildAcousticUnavailablePayload(localeHint?): Record<string, unknown>
```

**内部依赖：** `attachReadModelToToolPayload` → `finalizeLocalContextToolResult`

---

### Module 0：`localContextToolExecutors.ts`（保留为 orchestrator，~180 行）

**保留内容：**
- `createLogger('localContextTools')`（日志实例，各子模块按需新建或传入）
- `executeLocalContextToolCall`（唯一的 export，switch 分发逻辑）
- 所有子模块的 import + re-export（保持向后兼容）

```typescript
import { listLayers, listLayerLinks, ... } from './executors/coreExecutors';
import { getSpeakerBreakdown } from './executors/speakerBreakdown';
import { ... } from './executors/timelineExecutors';
// ... etc

export { executeLocalContextToolCall } from './executors/toolPayload';
// 或保留在原文件
```

---

## 三、实施步骤（按顺序，每步验证）

| 步骤 | 动作 | 验证 |
|------|------|------|
| 1 | 创建 `executors/argNormalizers.ts` + `readModelMeta.ts` | `npm run typecheck` |
| 2 | 创建 `executors/timelineExecutors.ts`（含 NormalizedUnitRow 接口） | `npm run typecheck` |
| 3 | 创建 `executors/coreExecutors.ts` + `noteExecutors.ts` | `npm run typecheck` |
| 4 | 创建 `executors/speakerBreakdown.ts` + `projectStats.ts` | `npm run typecheck` |
| 5 | 创建 `executors/batchAndDiagnose.ts` + `searchAndList.ts` | `npm run typecheck` |
| 6 | 创建 `executors/linguisticMemory.ts` + `toolPayload.ts` | `npm run typecheck` |
| 7 | 重写 `localContextToolExecutors.ts`：删除所有内部代码，保留 `executeLocalContextToolCall` + import/re-export | `npm run typecheck` |
| 8 | 删除 `localContextToolExecutors.ts` 的临时 ratchet（2200 → 批量 1000） | `npm run check:architecture-guard:core` |
| 9 | 运行完整 guard | `npm run check:architecture-guard` |

---

## 四、风险与回退

| 风险 | 概率 | 缓解 |
|------|------|------|
| import 遗漏导致 typecheck 失败 | 中 | 每步执行后立即 `typecheck`，增量修复 |
| `NormalizedUnitRow` 接口位置导致循环 import | 低 | 接口随 `timelineExecutors.ts` 导出，其他模块只 import type |
| `buildReadModelMetaWithSource` 在各模块重复 import 增加打包体积 | 低 | 该函数仅 ~20 行，tree-shaking 可消除未使用副本 |
| 测试文件 `localContextToolExecutors.test.ts` 破损 | 低 | 只有一个 export `executeLocalContextToolCall`，测试不应受影响 |
| 拆出后各子文件仍逼近 1000 行批量上限 | 低 | 最大子文件 `timelineExecutors.ts` 预估 320 行，有 680 行缓冲 |

**回退策略：** 若 typecheck 在步骤 3-4 反复失败，可降级为只拆 `speakerBreakdown` + `timelineExecutors` 两个最大块（约 450 行），其余保留在原文件。

---

## 五、Guard 影响

| 规则变更 | 说明 |
|---------|------|
| 删除 `localContextToolExecutors.ts` 的单独规则 | 拆分后原文件 < 500 行，回归 `^src/ai/chat/.*\.(ts|tsx)$` 批量规则（maxLines: 1000） |
| 新增子文件自动受批量规则约束 | `executors/*.ts` 匹配 `^src/ai/chat/.*\.(ts|tsx)$`，maxLines: 1000 |
| 无新 ratchet 引入 | 拆分目标就是删除 ratchet，不新增 |
