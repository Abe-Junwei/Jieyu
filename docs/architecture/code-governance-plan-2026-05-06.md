---
title: 代码治理计划（修订版 v2）
doc_type: architecture-governance-plan
status: active
owner: repo
last_reviewed: 2026-05-09
source_of_truth: code-governance-plan-2026-05-06-v2
---

# 代码治理计划（修订版 v2）

> 状态：可执行 | 基线：2026-05-09 | 规划人：Agent
>
> 本方案替代初版七波次方案，解决了与 `architecture-guard.config.mjs` 的兼容性冲突。

---

## 一、核心约束：先兼容门禁，再动代码

`architecture-guard.config.mjs`（72 条规则）是硬门禁。任何文件移动若导致规则路径失效，会触发「Missing guarded file」硬失败。

**原则：先改规则（Phase 0），再拆文件（Wave 1+）。**

---

## 二、Phase 0：门禁迁移准备（必须先做）

### 0.1 Guard 规则从固定路径 → 模式匹配

| 规则类型 | 旧写法 | 新写法 | 状态 | Guard 影响 |
|---------|--------|--------|------|-----------|
| `hookRule`（单个命名 hook） | `file: 'src/hooks/${name}.ts'` | `matchRegex: /^src/hooks/(?:[^/]+/)?${name}\.(ts\|tsx)$/` | ✅ 已落地 | `src/hooks/audio/useX.ts` 等子目录路径现可被单条规则命中 |
| `pageControllerRule`（单个命名控制器） | `file: 'src/pages/${name}.ts'` | `matchRegex: /^src/pages/(?:[^/]+/)?${name}\.ts$/` | ✅ 已落地 | `src/pages/transcription/useX.ts` 等子目录路径现可被单条规则命中 |
| `patternRule`（hooks 批量） | `^src/hooks/use.*\.(ts\|tsx)$` | `^src/hooks/(?:[^/]+/)*use.*\.(ts\|tsx)$` | ✅ 已落地 | 支持多级子目录（`src/hooks/audio/useX.ts`、`src/hooks/audio/sub/useX.ts` 等） |
| `patternRule`（pages 批量 controller） | `^src/pages/use.*Controller\.ts$` | 暂未改 | ⏳ 待改 | 子目录下的 controller（如 `src/pages/foo/useBarController.ts`）会失去 800 行批量约束，直到扩展 regex |
| `patternRule`（services 批量） | `^src/services/.*Service\.ts$` | `^src/services/(?:[^/]+/)*.*Service\.ts$` | ✅ 已落地 | 支持多级子目录（`src/services/voiceAgent/VoiceAgentService.ts` 等） |

**验证命令：**
- 快速：`npm run check:architecture-guard:core`（仅 guard 子集）
- 完整：`npm run check:architecture-guard`（含 parity、timeline、telemetry 等）
- **合并前必须以完整命令为准**，避免 CI 与本地习惯不一致

### 0.2 allowlist 机制（尚未实现）

> ⚠️ **状态：设计文档已写，引擎未实现。** `scripts/check-architecture-guard.mjs` 中没有 `allowlist` 处理逻辑。

设计意图：在规则引擎中引入 `allowlist: string[]`。当文件命中 `matchRegex` 但不在 `allowlist` 中时，仅报 warning（不硬失败）。这允许平滑迁移：
1. 创建新子目录文件
2. 更新 allowlist 纳入监管
3. 旧文件保留为 re-export shim
4. 清理旧文件并从 allowlist 移除

**约束：allowlist 实现前，Wave 3（Hooks 分组）不得启动。** 替代方案：使用 `excludeFiles` 临时扩容，或一次性完成迁移（无 shim 阶段）。

### 0.3 基线脚本自动化

- 脚本：`scripts/report-code-scale-baseline.mjs`（✅ 已创建）
- 运行：`node scripts/report-code-scale-baseline.mjs`
- 输出：JSON 到 stdout，包含文件数、行数、TOP20、目录 flat 数
- 建议：每次 Wave 完成后运行一次，写入 `reports/code-scale/` 时间戳目录

### 0.4 规则配置拆分

`architecture-guard.config.mjs`（910 行）按域拆分为：

```
scripts/architecture-guard/
  ├── index.mjs              # 聚合导出
  ├── rules.pages.mjs        # 页面/控制器规则
  ├── rules.hooks.mjs        # Hooks 规则
  ├── rules.services.mjs     # 服务层规则
  ├── rules.components.mjs   # 组件规则
  └── rules.css.mjs          # CSS 规则
```

**迁移路径：**
1. 新建 `scripts/architecture-guard/` 目录和拆分后的文件
2. `scripts/architecture-guard/index.mjs` 用 `import * as pages from './rules.pages.mjs'` 聚合，保持 `export const architectureGuardRules = [...]` 不变
3. **消费者仅有一处：** `scripts/check-architecture-guard.mjs` import 本配置。确认无其他文件直接 import
4. **单 PR 体积上限：** 一次最多拆出 2 个域文件，避免 909 行一次性重构的风险

---

## 三、Wave 1：紧急阈值释放（本周）

### 1.1 VoiceAgentService.ts（892/1000 行，89.2%）— ✅ 已完成

**现状：** 主文件是 orchestrator，业务逻辑已分散在 10+ 子文件（`VoiceAgentService.*.ts`）中。主文件 892 行主要是状态字段 + 核心编排（Start/Stop/Toggle ~180 行）。

**已拆出子模块：**

| 新子文件 | 行数 | 职责 | Guard 影响 |
|---------|------|------|-----------|
| `VoiceAgentDictationController.ts` | 77 | Dictation pipeline 控制器，持有 `SpeechAnnotationPipeline` 实例 | 匹配 `^src/services/(?:[^/]+/)*.*Service\.ts$` patternRule（maxLines: 2000） |

**Grounding 未拆分：** `setUiContext`/`setLocale`/`_buildGroundingContext` 仅 ~33 行，拆出收益不抵接口复杂度，评估后跳过。

**不拆的内容（留在主文件）：**
- Constructor（~60 行）：类的初始化入口
- Start/Stop/Toggle（~180 行）：核心生命周期编排
- State getters/setters + event emission（~70 行）：状态管理骨架
- `_handleSttResult`（~40 行）：STT 结果分发（已有 `VoiceAgentService.sttResultDispatch.ts` 处理具体逻辑）

**Guard 相关规则：**
- `VoiceAgentService.ts`：maxLines 1000（当前 892，缓冲 108 行）
  - ✅ **ADR-0030 冲突已解决：** ADR 要求 "strictly below 950"，当前 892 < 950，同时满足 guard 1000。
- `VoiceAgentService.singleton.ts`：maxLines 80（独立规则，不受影响）
- `VoiceAgentService.state.ts` / `.runtime.ts` / `.wakeWordBindings.ts` 等：已独立存在，保持现状

### 1.2 useTranscriptionWaveformBridgeController.ts（612/700 行，87.4%）

**现状：** 阈值已从 620 提升到 700，当前有 88 行缓冲。

**暂不拆文件路径。** 页面专属 controller 的惯例是 `src/pages/useXxxController.ts`，子目录化会与现有 `pageControllerRule('useTranscriptionWaveformBridgeController', …)` 的 matchRegex 兼容（✅ 0.1 已支持），但批量 patternRule（`^src/pages/use.*Controller.ts$`）可能不匹配。

**若需瘦身：** 将波形渲染逻辑（Canvas/WebGL）抽为同目录的 `useWaveformRenderer.ts`（保留在 `src/pages/`），原 controller 通过 import 调用。**不放入子目录**——页面批量 patternRule `^src/pages/use.*Controller\.ts$` 和 `^src/pages/use.*\.(ts|tsx)$` 仍不支持子目录，迁到 `src/pages/transcription/` 会失去批量约束。

### 1.3 useTranscriptionData.ts（529/600，88.2%）

**暂不拆分**，监控至 570 行再行动。当前有 71 行缓冲。

---

## 四、Wave 2：AI Chat 层与超大服务层拆分（2-3 周）

> **优先级调整：** Wave 2.1（AI Chat）先于 Wave 2.2（LinguisticService）。AI Chat 多文件并行逼近阈值，风险更紧迫。

### 2.1 AI Chat 层重组（75 平铺文件）— 🟡 进入收尾

**已完成：**
- `toolCallHelpers.ts`：从 1571 拆到 1256 行（-315 行，使用率 73.9%）
  - 拆出 `segmentTextParsers.ts`（109 行）：`parseChineseInteger`、`parseEnglishOrdinal`、`extractSegmentSelectorFromUserText`
  - 拆出 `toolCallValidation.ts`（226 行）：所有 `validate*` 函数 + 辅助函数
- `localContextToolExecutors.ts`：已完成深拆分，主文件降至 202 行；拆分产物落地在 `src/ai/chat/executors/`（9 个子模块，合计 1780 行）
- 热点收敛（短期重点）：
  - `localContextToolFormatters.ts`：当前 923/1000（92.3%）
  - `localToolSlotResolver.ts`：当前 932/1000（93.2%）

**待完成（需专门开发周期）：**
- `localContextToolFormatters.ts`：按输出格式拆分到 `tools/formatters/`（`buildLocalToolEvidenceText` 等 builders）
- `localToolSlotResolver.ts`：拆出 `slotResolver/intentMatchers.ts`（大量 `is***IntentText` 函数）

**Guard 影响：**
- `toolCallHelpers.ts`：专门规则 maxLines 1700（拆分后可视情况删除，回归批量 1000）
- `localContextToolExecutors.ts`：已回归 AI Chat 批量规则（maxLines 1000），当前 202/1000
- `localContextToolFormatters.ts` 和 `localToolSlotResolver.ts`：均受 AI Chat 批量规则（maxLines 1000）直接约束
- **本轮已移除两条 1100 临时 ratchet，Guard 口径统一为单一 1000 ceiling**

#### 2.1.1 `toolCallHelpers.ts` ratchet 删除执行条目（本轮启动）

**目标：** 在不改变现有行为与审计语义的前提下，将 `toolCallHelpers.ts` 从 1256 行降至 ≤1000，并删除 1700 专门 ratchet。

**建议拆分边界（按收益优先）：**

| 批次 | 目标模块 | 迁移函数簇（示例） | 预估净降行数 |
|------|---------|--------------------|--------------|
| A | `toolCallNaturalFeedback.ts` | `toNaturalToolSuccess` / `toNaturalToolFailure` / `toNaturalToolPending` / `toNaturalToolCancelled` / `toNaturalActionClarify` / `buildClarifyCandidates` / `toNaturalTargetClarify` | 170-230 |
| B | `toolCallResponseNormalize.ts` | `normalizeUnsupportedToolCallJson` / `normalizeLegacyRiskNarration` / `normalizeJsonishAssistantReply` / `isAmbiguousTargetRiskSummary` / `describeAndBuildPending` | 70-120 |
| C（可选） | `toolCallTargetPlanner.ts` | `resolveSelectionTargetPatchForTool` / `planToolCallTargets` 及其私有 helper | 120-260 |

**删除 ratchet 的硬条件（全部满足才可删）：**
1. `src/ai/chat/toolCallHelpers.ts` 行数 ≤ 1000。
2. `scripts/architecture-guard.config.mjs` 中删除 `toolCallHelpers.ts` 的专门 1700 规则。
3. `npm run check:architecture-guard:core` 通过，且不再出现 `toolCallHelpers.ts` 专项口径。
4. `npx vitest run src/ai/chat/toolCallHelpers.test.ts --maxWorkers=1` 通过。
5. `npx vitest run src/ai/chat/localContextTools.test.ts src/ai/chat/localToolSlotResolver.test.ts src/ai/chat/intentTools.test.ts --maxWorkers=1` 通过（覆盖调用链回归）。

**执行约束：**
- 每批次迁移后先跑第 4 条单测，再跑第 5 条链路回归，最后跑 guard core；不建议一次性大迁移。
- 若批次 A+B 后已 ≤1000，可跳过批次 C，避免过度重构。

### 2.2 LinguisticService.ts（1684 行）+ LinguisticService.languageCatalog.ts（1639 行）

该域尚未开始目录重组，继续维持 Wave 2 待办。AI Chat 的拆分收尾（2.1）完成后，再启动该域拆分，避免并发改动放大 review 与回归风险。

---

## 五、Wave 3：Hooks 分组（3-4 周）

> ⚠️ **前置条件：** Phase 0.2 allowlist 机制实现 + Phase 0.1 hooks 批量 patternRule 扩展至子目录。

`src/hooks/` 268 个平铺文件。

**按域分组（不一次性搬完，分批）：**

```
src/hooks/
  ├── useTranscriptionData.ts           # 保留原位
  ├── useAiChat.ts                      # 保留原位
  ├── audio/
  │   ├── index.ts                      # 仅 re-export audio 域，非全量 barrel
  │   ├── useAudioRecorder.ts
  │   └── useAudioPlayback.ts
  ├── transcription/
  │   ├── index.ts                      # 仅 re-export transcription 域
  │   └── useWaveformRenderer.ts        # 从 Wave 1.2 拆出
  └── ai/
      ├── index.ts                      # 仅 re-export ai 域
      └── useAiMemory.ts
```

**迁移策略（无 allowlist 时的替代方案）：**
1. 新 hook 直接写入子目录
2. 旧 hook 保留在原位，通过各自域的 `index.ts` 导出（非 `src/hooks/index.ts` 全量 barrel）
3. 当某域积累到 5+ 个相关 hook 时，批量迁移该域的旧文件
4. 批量迁移时同步更新 guard 规则（将原 `hookRule('useX')` 的 file 路径改为 matchRegex）

**避免全量 barrel 的原因：**
- Knip 会报未使用导出
- 打包侧可能意外拉全树
- 循环依赖风险
- 域级 index.ts 更安全、更易维护

---

## 六、Wave 4：类型定义外迁（4-5 周）

### 4.1 src/db/types.ts（1269 行）

```
src/db/types/
  ├── index.ts
  ├── transcription.ts
  ├── segment.ts
  ├── annotation.ts
  └── user.ts
```

### 4.2 src/db/schemas.ts（1291 行）

```
src/db/schemas/
  ├── index.ts
  ├── transcriptionSchema.ts
  ├── segmentSchema.ts
  └── ...
```

---

## 七、Wave 5：组件瘦身（5-6 周）

### 5.1 TOP 组件拆分

| 组件 | 当前行数 | 阈值 | 使用率 | 拆分方向 | Guard 影响 |
|------|---------|------|--------|----------|-----------|
| `TranscriptionPage.ReadyWorkspace.tsx` | 2204 | 2600 | 84.8% | 按面板拆分（timeline / waveform / sidebar） | 单文件规则，maxLines 2600 |
| `SettingsModal.tsx` | 1723 | — | — | 按设置类别拆分子组件 | 无单条规则，受批量约束 |
| `AiAnalysisPanel.tsx` | 1583 | — | — | 按分析类型拆分 | 无单条规则 |
| `LayerActionPopover.tsx` | 1555 | — | — | 按图层操作类型拆分 | 无单条规则 |

---

## 八、Wave 6：基础设施与 E2E 清理（持续）

### 8.1 E2E pageerror 去重

- ✅ `tests/e2e/_helpers/pageErrorFilter.ts` 已创建
- **专项过滤策略：** 通用无害错误（ResizeObserver / WebGL / AbortError）已纳入 `KNOWN_HARMLESS_ERRORS`。WebKit 上 `AiStateWorkerRequest` 解析类等专项错误需参数化处理：

```typescript
// 扩展后的接口（尚未实现）
export function trackPageErrors(
  page: Page,
  options?: { extraPatterns?: RegExp[] }
): string[]
```

- 替换 7+ 个 spec 中的重复 `page.on('pageerror', ...)` 逻辑前，需先确认各 spec 的专项过滤需求，再决定是否参数化或保留局部处理。

### 8.2 循环依赖监控

- 当前 0 个循环依赖（`npx madge --circular --extensions ts,tsx src`）
- **CI 建议：** 在现有 `check` job 中增加一步，而非独立 job。与 knip 的职责区分：
  - `knip`：未使用导出 / 未使用依赖
  - `madge --circular`：循环依赖
  - 两者互补，不重复
- 预估耗时：madge 全仓 < 5s，对 CI 时间影响可忽略

---

## 九、执行检查清单

| # | 任务 | 负责人 | 截止 | 状态 | 阻塞项 |
|---|------|--------|------|------|--------|
| 1 | Phase 0.1：hookRule/pageControllerRule matchRegex 落地 | Agent | 2026-05-08 | ✅ | — |
| 2 | Phase 0.1：hooks/services 批量 patternRule 扩展至子目录 | Agent | 2026-05-08 | ✅ | — |
| 3 | Phase 0.2：allowlist 机制实现 | 待分配 | 2026-05-12 | ⏳ | 阻塞 Wave 3 |
| 4 | Phase 0.3：基线脚本运行并归档 | Agent | 2026-05-08 | ✅ | — |
| 5 | Phase 0.4：guard 规则按域拆分（第一批） | 待分配 | 2026-05-15 | ⏳ | — |
| 6 | Wave 1.1：VoiceAgentService 拆出 dictation | Agent | 2026-05-08 | ✅ | — |
| 7 | Wave 1.2：waveform bridge 评估（暂不拆路径） | 待分配 | 2026-05-15 | ⏳ | — |
| 8 | Wave 2.1：AI Chat 层重组 | Agent | 2026-05-09 | 🟡 进入收尾 | localContextToolExecutors 深拆分已完成；formatters/slotResolver 继续拆分收敛；toolCallHelpers ratchet 删除条目已启动 |
| 9 | Wave 2.2：LinguisticService 目录重组 | 待分配 | 2026-05-29 | ⏳ | — |
| 10 | Wave 3：Hooks 分组启动 | 待分配 | 2026-06-05 | ⏳ | 被 0.2 阻塞 |

---

## 十、附录：接近阈值文件实时监控

运行 `node scripts/report-code-scale-baseline.mjs` 获取最新数据。

**当前热点（2026-05-09 基线）：**

| 文件 | 当前行数 | 阈值 | 使用率 | 行动 |
|------|---------|------|--------|------|
| `VoiceAgentService.ts` | 892 | 1000 | 89.2% | ✅ Wave 1.1 dictation 已拆出 |
| `VoiceAgentDictationController.ts` | 77 | 2000 | 3.9% | 🟢 新增，无风险 |
| `useTranscriptionWaveformBridgeController.ts` | 612 | 700 | 87.4% | 🟢 监控 |
| `useTranscriptionData.ts` | 529 | 600 | 88.2% | 🟢 监控 |
| `LinguisticService.ts` | 1684 | 2000 | 84.2% | 🟡 Wave 2 目录重组 |
| `LinguisticService.languageCatalog.ts` | 1639 | 2000 | 82.0% | 🟡 Wave 2 随主服务一起迁移 |
| `toolCallHelpers.ts` | 1256 | 1700 | 73.9% | 🟡 已进入 ratchet 删除阶段（目标 ≤1000 后回归批量规则） |
| `localContextToolExecutors.ts` | 202 | 1000 | 20.2% | ✅ 已深拆分，主文件转为编排入口 |
| `localContextToolFormatters.ts` | 923 | 1000 | 92.3% | 🟡 接近阈值，待深度拆分 |
| `localToolSlotResolver.ts` | 932 | 1000 | 93.2% | 🟡 接近阈值，待深度拆分 |
| `segmentTextParsers.ts` | 109 | — | — | 🟢 新增 |
| `toolCallValidation.ts` | 226 | — | — | 🟢 新增 |

> 注：当前 `^src/ai/chat/.*\.(ts|tsx)$` 批量规则 `excludeFiles` 仅包含 `toolCallHelpers.ts`。`localContextToolExecutors.ts`、`localContextToolFormatters.ts`、`localToolSlotResolver.ts` 均按批量规则（maxLines: 1000）治理；本轮已删除两条 1100 临时 ratchet，消除双口径。

---

## 十一、归档

- 初版七波次方案：`docs/architecture/_archive/code-governance-plan-2026-05-06-v1.md`
