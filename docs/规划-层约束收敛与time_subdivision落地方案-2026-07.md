> 文档角色：历史规划文档。仅用于保留当时的方案、约束与决策背景，不再作为当前实现的事实源。当前现状请优先查看 docs/architecture/ 与 README 中的文档索引。

# 层约束收敛与 time_subdivision 落地方案

> 2026-07 · 基于代码审计后修正的轻量方案  
> 原则：**保留现有 ELAN 数据模型不变，修复操作路径 + 收敛散落判断 + 开放 time_subdivision**
>
> 历史说明（2026-03-27 封账补记）
>
> - 本文档基于 legacy segmentation 阶段建模。
> - 当前运行时已改为 LayerUnit 真源，文中 `layer_segments` / `layer_segment_contents` / `segment_links` 相关描述应视为历史设计背景。

---

## 0 · 背景与决策依据

### 0.1 现状

| 维度 | 状态 |
|---|---|
| 数据层 | Dexie v26，26 张表；`utterances` / `layer_segments` / `layer_segment_contents` / `segment_links` / `anchors` 均已存在 |
| 约束类型 | `LayerConstraint = 'symbolic_association' \| 'independent_boundary' \| 'time_subdivision'`，其中 `time_subdivision` 运行时标记为 `false` |
| 判断函数 | `isIndependentBoundaryLayer()` 散布于 6 个文件 ~16 处调用点 |
| Anchor | `AnchorDocType { id, mediaId, time, createdAt }` 已定义，utterance/segment 的 `startAnchorId/endAnchorId` 已预留但全部未使用 |
| 测试 | 108 文件 / 935 用例全通过 |

### 0.2 架构判断（经专家校正）

1. **当前模型已经是 ELAN 模型**  
   - utterance = 主转写层 `ALIGNABLE_ANNOTATION`  
   - segment (layer_segments) = 独立层 `ALIGNABLE_ANNOTATION`  
   - symbolic_association = `REF_ANNOTATION`  
   — 不需要额外抽象 TimeRange / TimeBinding / COW。

2. **utterance 与 segment 各存自己的 startTime/endTime 是正确的**  
   不是"双时间源"问题，而是 ELAN 的"每条 annotation 自带 TIME_SLOT_REF"架构。

3. **现有 bug 是操作路径问题，不是数据模型问题**  
   例如 split/merge/resize 路由未统一、time_subdivision 守卫未开放等。

### 0.3 本方案不做的事

- ❌ 不新建 TimeRange / TimeBinding / COW 表  
- ❌ 不做 anchor 共享复用（待有实际需求时再激活）  
- ❌ 不改 utterance 与 segment 各自存时间的方式  
- ❌ 不新增 featureFlag（time_subdivision 直接开放即可）

---

## 1 · 阶段 A — 判断收敛 + 操作路径巩固（约 2-3 天）

### 1.1 收敛 `isIndependentBoundaryLayer` → 层级路由函数

**目标**：将 Orchestrator 里的 ~10 个 `if (layer && isIndependentBoundaryLayer(...))` 收敛为统一路由模式。

**做法**：

```typescript
// src/hooks/useLayerSegments.ts 新增 | New addition
export type LayerEditMode = 'utterance' | 'independent-segment' | 'time-subdivision';

export function getLayerEditMode(
  layer: LayerDocType | undefined,
  defaultTranscriptionLayerId?: string,
): LayerEditMode {
  if (!layer || !featureFlags.segmentBoundaryV2Enabled) return 'utterance';
  if (layer.constraint === 'time_subdivision') return 'time-subdivision';
  if (layer.constraint === 'independent_boundary' && layer.id !== defaultTranscriptionLayerId) return 'independent-segment';
  return 'utterance';
}
```

然后 Orchestrator 中统一替换：

```typescript
// Before (散落各处):
if (layer && isIndependentBoundaryLayer(layer, defaultTranscriptionLayerId)) { ... }

// After (统一路由):
const editMode = getLayerEditMode(layer, defaultTranscriptionLayerId);
switch (editMode) {
  case 'independent-segment': /* segment 操作 */ break;
  case 'time-subdivision':    /* 细分操作（Phase B 填充）*/ break;
  case 'utterance':           /* utterance 操作 */ break;
}
```

**影响范围**：
| 文件 | 调用点数 | 改法 |
|---|---|---|
| `TranscriptionPage.Orchestrator.tsx` | ~10 | 统一为 `getLayerEditMode` switch |
| `TranscriptionTimelineHorizontalMediaLanes.tsx` | 2 | 换用 `getLayerEditMode` |
| `TranscriptionTimelineTextOnly.tsx` | 2 | 换用 `getLayerEditMode` |
| `useLayerSegmentContents.ts` (如有) | 1 | 换用 |
| `EafConstraintParsing.test.ts` | 测试 | 保留 `isIndependentBoundaryLayer` 单测 + 新增 `getLayerEditMode` 单测 |

**兼容性**：`isIndependentBoundaryLayer` 保留导出（不删），`getLayerEditMode` 为新增纯函数。

### 1.2 巩固 Undo/Redo 路径

当前 Undo 已支持 `layerSegments` + `layerSegmentContents` 快照恢复。需确认：
- [ ] `undoToHistoryIndex` 在 `time-subdivision` 模式下也能正确恢复（父层约束段）
- [ ] split/merge/create/delete 每条路径都有 `pushUndo` + `refreshSegmentUndoSnapshot`

### 1.3 EAF 导出路径核查

当前 `EafService.exportToEaf()` 已处理 `time_subdivision` 导出为 `ALIGNABLE_ANNOTATION + translation-subdivision-lt`。需确认：
- [ ] TIME_SLOT 生成对 `time_subdivision` 层 segment 正确（每个 segment 独立时间槽）
- [ ] LINGUISTIC_TYPE `Time_Subdivision` 声明在 footer 中的条件正确

---

## 2 · 阶段 B — 开放 time_subdivision（约 3-4 天）

### 2.1 开放运行时能力

```typescript
// src/services/LayerConstraintService.ts
const DEFAULT_CONSTRAINT_RUNTIME_CAPABILITIES: ConstraintRuntimeCapabilities = {
  symbolic_association: true,
  independent_boundary: true,
  time_subdivision: true,  // ← false → true
};
```

### 2.2 time_subdivision 语义定义

| 属性 | 值 |
|---|---|
| 含义 | 子层的 segment 时间范围必须 **整体落在**父层对应 utterance 的 `[startTime, endTime]` 范围内 |
| 存储 | 复用 `layer_segments` 表，`layerId` 指向子层，`mediaId` 不变 |
| 关联 | `segment_links` 中 `sourceSegmentId` → 子层 segment，`targetSegmentId` → 父层 utterance 或 segment |
| 创建时 | 在父层 utterance 范围内自动裁剪 start/end；超出则报错 |
| 父层 resize 时 | 子层 segments 需要跟随收缩/扩展（或阻断超出时警告） |

### 2.3 操作填充

在 Phase A 的 `switch (editMode)` 骨架中填充 `time-subdivision` 分支：

| 操作 | 行为 |
|---|---|
| **创建** | 在父层 utterance 范围内取空白区创建 segment；保证 `seg.startTime >= utt.startTime && seg.endTime <= utt.endTime` |
| **拆分** | 与 `independent-segment` 相同，调用 `LayerSegmentationV2Service.splitSegment` |
| **合并** | 与 `independent-segment` 相同，但需验证合并后仍在父 utterance 范围内 |
| **删除** | 与 `independent-segment` 相同 |
| **resize** | 允许拖动 segment 边界，但不得超出父 utterance 边界（邻居边界计算需叠加父 utterance 约束） |
| **父层 resize** | 当父层 utterance 缩小时：超出的子 segment 自动裁剪尾部 |

### 2.4 核心实现：邻居边界叠加

`getNeighborBoundsRouted` 需增加一个分支：

```typescript
case 'time-subdivision': {
  // 1. 找到子 segment 的父 utterance（通过 segment_links 或时间区间匹配）
  // 2. 邻居边界 = max(prev_sibling.endTime + gap, parentUtt.startTime)
  //            ~ min(next_sibling.startTime - gap, parentUtt.endTime)
  break;
}
```

### 2.5 segment_links 写入

创建 time_subdivision 层 segment 时，同时写入 `segment_links`：
```typescript
await LayerSegmentationV2Service.createSegmentLink({
  id: newId('sl'),
  sourceSegmentId: newSegment.id,
  targetSegmentId: parentUtteranceId,  // 或 parentSegmentId
  linkType: 'time_subdivision',
  createdAt: now,
});
```

### 2.6 UI 创建入口

在**层管理面板**（创建新层时）添加约束选项：
- `symbolic_association`（依赖边界，沿用父层区间）— 已有
- `independent_boundary`（独立边界）— 已有
- `time_subdivision`（时间细分，在父层区间内自由切分）— 新增

需要指定 `parentLayerId`（与 `symbolic_association` 相同的 UI 交互）。

---

## 3 · 阶段 C — Anchor 共享（预留，当前不实施）

### 3.1 何时激活

当出现以下场景时再来做：
- 多个层的 segment 共享锚点（例如两个层的边界对齐到同一时间点，移动一个另一个跟着动）
- 导入的 EAF 文件显式包含 TIME_SLOT 共享引用

### 3.2 激活路径（备忘）

1. `AnchorDocType` 表已存在，utterance/segment 的 `startAnchorId/endAnchorId` 字段已预留
2. 导出时 `EafService.exportToEaf()` 已支持 anchor 模式（`anchors?.length > 0` 分支）
3. 需要做：
   - 写入路径：创建 utterance/segment 时同步创建 anchor + 回填 anchorId
   - 读取路径：UI 层面在 resize 时读取 anchor.time 而非 utterance.startTime
   - 联动更新：修改 anchor.time 后同步更新所有引用该 anchor 的 utterance/segment 的 startTime/endTime

---

## 4 · 测试策略

### 4.1 Phase A 测试

| 测试文件 | 内容 |
|---|---|
| `EafConstraintParsing.test.ts` | 保留现有 `isIndependentBoundaryLayer` 测试 + 新增 `getLayerEditMode` 6 种场景 |
| `LayerConstraintService.constraintModes.test.ts` | 现有测试不变 |
| `Orchestrator routing test` (新增或扩展 `TranscriptionPage.structure.test.ts`) | 断言所有操作走 editMode switch |

### 4.2 Phase B 测试

| 测试文件 | 内容 |
|---|---|
| `LayerConstraintService.constraintModes.test.ts` | 新增：创建 `time_subdivision` 层不再被阻断 |
| `LayerSegmentationV2Service.test.ts` (新增) | `time_subdivision` 的 create/split/merge/delete + 父约束验证 |
| `EafExportBehavior.test.ts` | 现有 `time_subdivision` 导出测试 + 补充 TIME_SLOT 共享验证 |
| `useTimelineResize` 扩展 | `time_subdivision` resize 不超父范围 |

### 4.3 回归防线

- 每个 Phase 完成后全量跑 `npx vitest run`
- 现有 935 个测试在 Phase A 全部不变（纯重构不改行为）
- Phase B 新增约 15-25 个测试

---

## 5 · 风险与缓解

| 风险 | 级别 | 缓解 |
|---|---|---|
| Phase A 收敛引入路由遗漏 | 中 | 每个 switch 分支都有对应测试；旧 `isIndependentBoundaryLayer` 保留可回退 |
| time_subdivision 父层 resize 联动复杂度 | 中 | 首版只做"阻断超出 + toast 提示"，不做自动裁剪 |
| segment_links 反查性能 | 低 | 已有 `sourceSegmentId` / `targetSegmentId` 索引 |
| Undo 快照膨胀 | 低 | 现有机制按 entry 快照，time_subdivision 不增加新表 |

---

## 6 · 文件改动清单

### Phase A
| 文件 | 改动 |
|---|---|
| `src/hooks/useLayerSegments.ts` | 新增 `LayerEditMode` 类型 + `getLayerEditMode()` 函数 |
| `src/pages/TranscriptionPage.Orchestrator.tsx` | 10 处 `isIndependentBoundaryLayer` → `getLayerEditMode` switch |
| `src/components/TranscriptionTimelineHorizontalMediaLanes.tsx` | 2 处换用 |
| `src/components/TranscriptionTimelineTextOnly.tsx` | 2 处换用 |
| `src/services/EafConstraintParsing.test.ts` | 新增 `getLayerEditMode` 单测 |

### Phase B
| 文件 | 改动 |
|---|---|
| `src/services/LayerConstraintService.ts` | `time_subdivision: false` → `true` |
| `src/pages/TranscriptionPage.Orchestrator.tsx` | 填充 `time-subdivision` 分支（create/split/merge/delete/resize） |
| `src/hooks/useTimelineResize.ts` | `getNeighborBoundsRouted` 增加 `time-subdivision` 分支 |
| `src/services/LayerSegmentationV2Service.ts` | 新增 `createSegmentWithParentConstraint()` 方法 |
| `src/services/LayerConstraintService.constraintModes.test.ts` | 更新/新增 `time_subdivision` 测试 |
| `services/LayerSegmentationV2Service.test.ts` (新增) | time_subdivision CRUD + 父约束验证测试 |

---

## 7 · 实施顺序

```
Phase A (收敛 + 巩固)
  ├── A1. 新增 getLayerEditMode 纯函数 + 单测
  ├── A2. Orchestrator 10 处 → switch 统一路由
  ├── A3. Timeline 组件 4 处 → switch
  ├── A4. 全量测试 → 935 pass
  └── A5. EAF 导出路径复查

Phase B (time_subdivision 开放)
  ├── B1. LayerConstraintService 开放 runtime capability
  ├── B2. Orchestrator time-subdivision 分支填充
  ├── B3. getNeighborBoundsRouted 叠加父 utterance 约束
  ├── B4. segment_links 写入
  ├── B5. 新增 LayerSegmentationV2Service 父约束方法 + 单测
  ├── B6. UI 层管理添加 time_subdivision 选项
  └── B7. 全量测试 → 950+ pass

Phase C (Anchor 共享 — 预留)
  └── 按需激活
```
