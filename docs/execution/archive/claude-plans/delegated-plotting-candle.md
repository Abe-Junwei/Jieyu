# 代码库全面审计报告

## 上下文 (Context)

对 Jieyu（解语）应用代码库进行全面的逻辑、结构和完整性审计。该项目是一个基于 React + TypeScript 的濒危语言研究协作平台，采用本地优先架构（IndexedDB/Dexie），支持语音转写、标注、分析等功能。

---

## 发现的问题汇总

### 一、高严重性问题 (High Severity)

#### 1. 事务安全问题

**问题 1.1: `removeNotesForUtteranceIds` 缺少事务保护**
- **位置**: [LinguisticService.ts:155-204](src/services/LinguisticService.ts#L155-L204)
- **问题**: 该方法执行多个数据库操作（tokens、morphemes、notes 删除），但没有任何事务保护。如果中途失败，会导致部分数据被删除，数据库处于不一致状态。
- **对比**: `deleteProject`、`deleteAudio`、`removeUtterance` 等方法都正确使用了事务，但此方法没有。

**问题 1.2: 批量保存无事务保护**
- **位置**: [LinguisticService.ts:1191-1224](src/services/LinguisticService.ts#L1191-L1224) (`saveTierAnnotationsBatch`)
- **问题**: 每个 annotation 单独持久化，没有事务。如果过程中崩溃，部分 annotation 会保存，部分丢失。

#### 2. 静默错误吞噬 (Silent Error Swallowing)
- **位置**: [LinguisticService.ts:162-199](src/services/LinguisticService.ts#L162-L199)
- **问题**: catch 块静默吞噬错误，然后执行全表扫描作为 fallback。实际错误从不被记录，全表扫描在大数据量时极低效。

#### 3. JymService 缺少压缩包损坏处理
- **位置**: [JymService.ts:78-101](src/services/JymService.ts#L78-L101)
- **问题**: `unzipSync` 和 `JSON.parse` 没有 try/catch，损坏的归档会抛出未处理异常。

---

### 二、中等严重性问题 (Medium Severity)

#### 4. i18n 国际化不完整

**问题 4.1: 大量组件硬编码中文字符串**

| 组件 | 硬编码字符串数量 | 位置 |
|------|-----------------|------|
| ToastContext | ~15 | [ToastContext.tsx](src/contexts/ToastContext.tsx) |
| TranscriptionToolbarActions | ~13 | [TranscriptionToolbarActions.tsx](src/components/TranscriptionToolbarActions.tsx) |
| WaveformLeftStatusStrip | ~20 | [WaveformLeftStatusStrip.tsx](src/components/transcription/WaveformLeftStatusStrip.tsx) |
| SpeakerActionDialog | 全部(无i18n) | [SpeakerActionDialog.tsx](src/components/transcription/SpeakerActionDialog.tsx) |
| AiChatCard | 多处 | [AiChatCard.tsx](src/components/ai/AiChatCard.tsx) |
| App.tsx side pane | 多处 | [App.tsx](src/App.tsx) |

**问题 4.2: `detectLocale` 映射问题**
- **位置**: [src/i18n/index.ts:754-757](src/i18n/index.ts#L754-L757)
- 所有 `zh-*` (zh-TW, zh-HK, zh-SG) 都映射到 `zh-CN`
- 所有非中文语言映射到 `en-US` (包括 en-GB)
- 没有用户偏好持久化存储

#### 5. AI/Voice 服务问题

**问题 5.1: FNV fallback 产生无意义的相似度**
- **位置**: [embedding.worker.ts:79-100](src/ai/embeddings/embedding.worker.ts#L79-L100)
- 当模型加载失败时使用 FNV-hash 生成伪向量，但搜索时没有向用户警告 fallback 处于激活状态。

**问题 5.2: 空的 Embedding 向量静默返回空结果**
- **位置**: [EmbeddingSearchService.ts:192-195](src/ai/embeddings/EmbeddingSearchService.ts#L192-L195)
- `provider.embed()` 返回空向量时，搜索静默返回空结果，没有错误日志。

**问题 5.3: Whisper-local 引擎状态显示不准确**
- **位置**: [VoiceInputService.ts:580-603](src/services/VoiceInputService.ts#L580-L603)
- `whisper-local` 和 `commercial` 引擎标记为 `listening = true`，但这些引擎需要 `startRecording()` 才真正捕获音频。UI 显示"聆听中"但实际未开始录音。

**问题 5.4: Wake word 检测器静默失败**
- **位置**: [VoiceAgentService.ts:951-955](src/services/VoiceAgentService.ts#L951-L955)
- Wake word 检测失败被静默捕获，只禁用功能而不通知用户。

#### 6. FLEx 导入/导出问题

**问题 6.1: FLEx 导入丢失额外的 interlinear-text**
- **位置**: [FlexService.ts:194-304](src/services/FlexService.ts#L194-L304)
- 导出时创建额外的 `interlinear-text` 元素，但导入只处理第一个，round-trip 会丢失数据。

**问题 6.2: FLEx 导入缺少段落级结构和复杂 morpheme 支持**
- 不支持 `paragraph` 元素、多 morpheme 结构等。

---

### 三、低严重性问题 (Low Severity)

#### 7. 性能相关

**问题 7.1: 每次渲染创建新的 Map 实例**
- **位置**: [useTranscriptionSpeakerController.ts:231](src/pages/useTranscriptionSpeakerController.ts#L231)
- `speakerByIdMap: new Map(speakerByIdMap)` 每次渲染创建新 Map，破坏引用相等性，可能导致不必要重渲染。

**问题 7.2: Timeline buffer 计算可能过于昂贵**
- **位置**: [useTranscriptionTimelineController.ts:73-74](src/pages/useTranscriptionTimelineController.ts#L73-L74)
- 45% buffer 意味着任何可见窗口都渲染 ~90% 的总录音时长。2小时录音即使只显示1分钟，仍渲染108分钟。

**问题 7.3: 批量操作的大内存问题**
- **位置**: [LinguisticService.ts:1822](src/services/LinguisticService.ts#L1822)
- `bulkGet(ids)` 一次加载所有 utterances 到内存，大数据量时可能 OOM。

#### 8. 导出函数空输入处理

**问题 8.1: 导出函数对空输入返回空字符串**
- **位置**: [TextGridService.ts:76](src/services/TextGridService.ts#L76), FlexService 等
- 调用方可能未预料空字符串，导致无效输出文件。

#### 9. localStorage 错误处理

**问题 9.1: localStorage 错误被静默捕获**
- **位置**: [useTranscriptionWorkspaceLayoutController.ts](src/pages/useTranscriptionWorkspaceLayoutController.ts)
- localStorage 读写失败时只记录警告，没有用户通知或 fallback UI（配额超限等情况）。

---

### 四、代码结构问题

#### 10. 引用相等性陷阱

**问题 10.1: `createLayerWithActiveContext` 依赖数组问题**
- **位置**: [useTranscriptionShellController.ts:218](src/pages/useTranscriptionShellController.ts#L218)
- 如果 `createLayer` 引用变化，会导致依赖它的所有消费者不必要地重新渲染/处理。

#### 11. Race Condition 风险

**问题 11.1: Segment undo snapshot 的异步模式脆弱**
- **位置**: [useTranscriptionSegmentBridgeController.ts:77-90](src/hooks/useTranscriptionSegmentBridgeController.ts#L77-L90)
- 使用 requestId 的 race guard，但如果调用方不正确 await 或 effect 被取消，可能导致状态不一致。

#### 12. EmbeddingContext Fallback 模式

**问题 12.1: Context 提供者缺失时返回默认值**
- **位置**: [EmbeddingContext.tsx:101-108](src/contexts/EmbeddingContext.tsx#L101-L108)
- `useEmbeddingContext` 返回默认值而非抛出错误，可能在生产环境掩盖缺失 provider 的问题。

---

## 复查确认 (Second Review)

经过复查，确认以下问题为真实问题而非误报：

1. **事务问题** ✅ 确认 - 代码路径明确，多个 delete 方法使用事务但此方法没有
2. **i18n 问题** ✅ 确认 - 多个组件确实使用硬编码字符串而非 i18n key
3. **静默错误吞噬** ✅ 确认 - catch 块确实只记录警告而非实际错误
4. **FLEx round-trip** ✅ 确认 - 导出创建多个 interlinear-text 但导入只读第一个
5. **FNV fallback** ✅ 确认 - 确认当模型不可用时使用，且无用户警告

---

## 验证方案

1. **事务问题验证**: 审查 `removeNotesForUtteranceIds` 调用链，确认它在哪些事务中被调用
2. **i18n 验证**: 搜索代码中未使用 `t()` 或 `tf()` 的中文硬编码字符串
3. **AI 服务验证**: 检查 embedding worker 加载失败时的用户通知机制
4. **构建和类型检查**: `npm run typecheck` 确认无新增类型错误
5. **测试运行**: `npm test` 确认测试套件通过

---

---

## 前端代码深度审计发现

### 一、Hooks 问题

#### High Severity

**1.1: `useVoiceInteraction.ts` - Fire-and-forget async 错误吞噬 (lines 156-173)**
- **位置**: [useVoiceInteraction.ts:156-173](src/hooks/useVoiceInteraction.ts#L156-L173)
- **问题**: IIFE 使用 `void` 立即分离，如果 `aiChatSend` reject，错误被静默吞噬
```typescript
sendToAiChat: (text: string) => {
  void (async () => {
    await aiChatSend(text);  // 如果这里抛错，错误未被处理！
  })();
},
```

**1.2: `useLayerDeleteConfirm.ts` - TOCTOU Race Condition (lines 74-79)**
- **位置**: [useLayerDeleteConfirm.ts:74-79](src/hooks/useLayerDeleteConfirm.ts#L74-L79)
- **问题**: 在 `await` 前检查 `deleteLayerConfirm` 但在 await 后使用，如果期间状态变化可能删错层
```typescript
const confirmDeleteLayer = useCallback(async () => {
    if (!deleteLayerConfirm) return;  // 检查
    await deleteLayer(deleteLayerConfirm.layerId, {...});  // await期间可能变化
    setDeleteLayerConfirm(null);
}, [...]);
```

#### Medium Severity

**1.3: `usePanelResize.ts` - Stale Closure (lines 55-59, 109-113)**
- **位置**: [usePanelResize.ts:55-59](src/hooks/usePanelResize.ts#L55-L59)
- **问题**: `onUp` 通过闭包捕获 `config`，但 config 来自 ref，如果组件重渲染，onUp 仍捕获旧的 ref 值

**1.4: `usePanelResize.ts` - 缺少 unmount 清理**
- 如果用户开始拖动后导航离开，`pointermove` 和 `pointerup` 监听器永远不会被移除

**1.5: `useVoiceInteraction.ts` - 多处 async IIFE 无错误处理 (lines 326-348, 350-359)**
- `handleVoiceAssistantIconClick`、`handleVoiceSwitchEngine`、`handleMicPointerDown` 都使用 fire-and-forget async IIFE

**1.6: `useLayerActionPanel.ts` - 依赖数组问题 (line 110, line 85)**
- `quickDeleteLayerId` 在设置它的 effect 依赖数组中（line 110）
- `quickTranslationConstraint` 在 `handleCreateTranslationFromPanel` 的依赖数组中缺失（line 85）

---

### 二、React 组件问题

#### High Severity

**2.1: LayerActionPopover.tsx - 潜在无限循环 (lines 154-169)**
- **位置**: [LayerActionPopover.tsx:154-169](src/components/LayerActionPopover.tsx#L154-L169)
- **问题**: effect 更新 `selectedParentLayerId` 但也在依赖数组中，如果 `independentParentLayers` 每次渲染是新数组引用，会创建反馈循环

**2.2: TranscriptionTimelineMediaLanes.tsx - Map 中内联回调 (lines 657-724)**
- **位置**: [TranscriptionTimelineMediaLanes.tsx:657-724](src/components/transcription/TranscriptionTimelineMediaLanes.tsx#L657-L724)
- **问题**: 每个渲染为每个 utterance 创建新的 `onChange`、`onBlur` 等回调函数，应该用 `useCallback` 或提取为子组件

**2.3: AiChatCard.tsx - 未 memoized 的 map 回调 (lines 650-831)**
- **位置**: [AiChatCard.tsx:650-831](src/components/ai/AiChatCard.tsx#L650-L831)
- **问题**: 整个消息 turn 渲染是一个大的 JSX block 在 map 内部，每次渲染创建新的事件处理器、Set 对象、内联样式

#### Medium Severity

**2.4: TranscriptionTimelineMediaLanes.tsx - 深层嵌套三元表达式 (lines 575-584)**
- **位置**: [TranscriptionTimelineMediaLanes.tsx:575-584](src/components/transcription/TranscriptionTimelineMediaLanes.tsx#L575-L584)
- **问题**: 深层嵌套三元无法被 React memoization 优化，每次渲染重新计算所有分支

**2.5: AiChatCard.tsx - 不安全的非空断言 (lines 721-727, 1078)**
- **位置**: [AiChatCard.tsx:721-727](src/components/ai/AiChatCard.tsx#L721-L727)
```typescript
const c = rawCitations[seg.index! - 1];  // seg.index为0时，0-1=-1越界
```

**2.6: AiChatCard.tsx - 手动追踪前值反模式 (lines 249-256)**
- 使用 ref 追踪前值来检测"刚从X变为Y"是反模式，应该用 useEffect 或自定义 hook

**2.7: TranscriptionTimelineMediaLanes.tsx - Timer/State 不同步 (lines 461-476)**
- Timer 状态存储在 ref (`tempExpandTimersRef`)，但展开状态在 React state (`tempExpandedGroupByLayer`)

**2.8: AiChatCard.tsx / TranscriptionTimelineMediaLanes.tsx - 缺少 Error Boundary**
- 大型组件没有 Error Boundary 保护，AiAssistantHubCard (line 148) 直接渲染 AiChatCard

#### Low Severity

**2.9: WaveformHoverTooltip.tsx - 二分查找边界情况 (lines 33-42)**
- 如果 utterances 为空或单一元素，逻辑可能有问题

**2.10: FeatureAvailabilityPanel.tsx - useRegisterAppSidePane 调用问题 (lines 55-59)**
- 每次渲染都调用，可能导致不必要的注册操作

---

## 最终建议修复优先级

### P0 (立即修复)

1. **`removeNotesForUtteranceIds` 添加事务保护** - 数据库一致性
2. **`saveTierAnnotationsBatch` 添加事务保护** - 批量操作原子性
3. **JymService 添加压缩包损坏处理** - 防止崩溃
4. **`useVoiceInteraction.ts` fire-and-forget async 添加错误处理** - 防止静默失败
5. **`useLayerDeleteConfirm.ts` race condition 修复** - 防止删错 layer

### P1 (短期内修复)

6. **SpeakerActionDialog 等核心组件添加 i18n 支持**
7. **LayerActionPopover.tsx 潜在无限循环修复**
8. **TranscriptionTimelineMediaLanes.tsx 内联回调提取为子组件**
9. **AiChatCard.tsx 大型 map 渲染优化**
10. **EmbeddingSearchService 添加空向量错误处理**
11. **VoiceAgentService wake word 失败用户通知**

### P2 (规划中修复)

12. 优化 `speakerByIdMap` 的引用相等性
13. 添加 Timeline buffer 的动态计算
14. 添加 localStorage 错误的用户通知
15. FLEx interlinear-text 完整 round-trip 支持
16. 添加 Error Boundary 保护关键组件
17. `usePanelResize.ts` 添加 unmount 拖动清理
