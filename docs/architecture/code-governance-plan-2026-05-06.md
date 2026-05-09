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

`scripts/architecture-guard.config.mjs`（**仅 ~30 行**：聚合 spread，无内联规则体）、`scripts/architecture-guard/rule-builders.mjs`（`hookRule` / `pageControllerRule` / `patternRule` 工厂）与 **`scripts/architecture-guard/rules.*.mjs`** 域文件共同构成硬门禁。`check-architecture-guard.mjs` 仍 **只 import 根配置**一处。任何文件移动若导致规则路径失效，会触发「Missing guarded file」硬失败。

**原则：先改规则（Phase 0），再拆文件（Wave 1+）。**

---

## 二、Phase 0：门禁迁移准备（必须先做）

### 0.1 Guard 规则从固定路径 → 模式匹配

| 规则类型 | 旧写法 | 新写法 | 状态 | Guard 影响 |
|---------|--------|--------|------|-----------|
| `hookRule`（单个命名 hook） | `file: 'src/hooks/${name}.ts'` | `matchRegex: /^src/hooks/(?:[^/]+/)?${name}\.(ts\|tsx)$/` | ✅ 已落地 | `src/hooks/audio/useX.ts` 等子目录路径现可被单条规则命中 |
| `pageControllerRule`（单个命名控制器） | `file: 'src/pages/${name}.ts'` | `matchRegex: /^src/pages/(?:[^/]+/)?${name}\.ts$/` | ✅ 已落地 | `src/pages/transcription/useX.ts` 等子目录路径现可被单条规则命中 |
| `patternRule`（hooks 批量） | `^src/hooks/use.*\.(ts\|tsx)$` | `^src/hooks/(?:[^/]+/)*use.*\.(ts\|tsx)$` | ✅ 已落地 | 支持多级子目录（`src/hooks/audio/useX.ts`、`src/hooks/audio/sub/useX.ts` 等） |
| `patternRule`（pages 批量 controller） | `^src/pages/use.*Controller\.ts$` | `^src/pages/(?:[^/]+/)*use.*Controller\.ts$`（并维护 `excludeFiles`） | ✅ 已落地 | 子目录 controller 与根目录同批 800 行上限；超大聚合 hook 另用 `file:` 单条 ratchet（如 `useReadyWorkspaceSurfaceProps.tsx`、`useReadyWorkspaceTrackEditControllers.ts`）并从 bulk `use*` 规则 `excludeFiles` 排除，避免双计 |
| `patternRule`（pages 批量 `use*` 非 Controller） | `^src/pages/use.*\.(ts\|tsx)$`（若曾不含子目录） | `^src/pages/(?:[^/]+/)*use.*\.(ts\|tsx)$` + 上述 `excludeFiles` | ✅ 已落地 | 300 行批量阈值覆盖子目录；与 controller 批量的排除集对齐 |
| `patternRule`（services 批量） | `^src/services/.*Service\.ts$` | `^src/services/(?:[^/]+/)*.*Service\.ts$` | ✅ 已落地 | 支持多级子目录（`src/services/voiceAgent/VoiceAgentService.ts` 等） |

**验证命令：**
- 快速：`npm run check:architecture-guard:core`（仅 guard 子集）
- 完整：`npm run check:architecture-guard`（含 parity、timeline、telemetry 等）
- **合并前必须以完整命令为准**，避免 CI 与本地习惯不一致

### 0.2 allowlist 机制（引擎已实现，规则接入中）

> ✅ **状态：引擎已实现。** `scripts/check-architecture-guard.mjs` 已支持 `allowlist`：命中 `matchRegex` 且不在 `allowlist` 时降级为 warning（`warn-only`），在 `allowlist` 内继续执行硬门禁（`enforce`）。

当前落地口径：
1. 规则引擎能力已就绪，可用于分批迁移
2. 各域规则仍需按批次补齐具体 `allowlist` 条目
3. 迁移窗口期可与 `excludeFiles` 组合使用，避免一次性大迁移

**约束调整：Wave 3 不再被“引擎未实现”阻塞；但每个迁移批次必须先补 allowlist（或等价过渡策略）并通过 guard 校验。**

### 0.3 基线脚本自动化

- **即时报告：** `scripts/report-code-scale-baseline.mjs`（✅）；`npm run report:code-scale`（stdout JSON，含文件数、行数、TOP20、目录 flat 数）
- **归档落盘：** `scripts/archive-code-scale-baseline.mjs`（✅）；`npm run report:code-scale:archive` → `reports/code-scale/baseline-<ISO>.json` 与 `reports/code-scale/latest.json`（二者默认 **gitignore**，避免噪声提交）
- **说明：** `reports/code-scale/README.md`（命令与用途）
- 建议：每个 Wave 或重大拆分合并前后各跑一次归档，便于对比热点漂移

### 0.4 规则配置拆分

**状态：Phase 0.4 物理拆分已收口**（主配置仅聚合；规则体均在 `scripts/architecture-guard/`）。

| 模块 | 导出常量 | 职责摘要 |
|------|-----------|----------|
| `rule-builders.mjs` | 工厂函数 | `hookRule` / `pageControllerRule` / `patternRule` |
| `rules.pages.mjs` | `architectureGuardPageWorkspaceRules`、`architectureGuardPageControllerRules`、`architectureGuardPageRatchetFileRules` | ReadyWorkspace 壳、命名 page controller、`useReadyWorkspaceSurfaceProps` / `TrackEditControllers` ratchet |
| `rules.hooks.mjs` | `architectureGuardNamedHookRules` | 命名 `src/hooks` 规则 |
| `rules.services.mjs` | `architectureGuardServiceFileRules` | `VoiceAgentService*` 等单文件服务 ratchet |
| `rules.css.mjs` | `architectureGuardCssFileRules` | `src/styles/**` 契约（required / forbidden） |
| `rules.patterns.preCss.mjs` | `architectureGuardPreCssPatternRules` | CSS 之前的全部 `patternRule`（pages bulk、串层、hooks/services/ai bulk、`pages/(?!use)` 等） |
| `rules.patterns.postCss.mjs` | `architectureGuardPostCssPatternRules` | CSS + ratchet 之后至 useZoom 的 `patternRule`（含 M18、components/contexts 等） |
| `rules.app.mjs` | `architectureGuardAppLayerRules` | M3 app 方向、`src/app/index.ts` 契约、page→db/services、hooks↔Supabase |

根文件 **`scripts/architecture-guard.config.mjs`**：`export const architectureGuardRules = [ ...按上表顺序 spread …]`，与历史单文件数组 **语义顺序一致**（已用 `npm run check:architecture-guard` 回归）。

```
scripts/architecture-guard/
  ├── rule-builders.mjs
  ├── rules.pages.mjs
  ├── rules.hooks.mjs
  ├── rules.services.mjs
  ├── rules.css.mjs
  ├── rules.patterns.preCss.mjs
  ├── rules.patterns.postCss.mjs
  └── rules.app.mjs
```

**可选后续（非阻塞）：** 若希望 `check-architecture-guard.mjs` import 更短路径，可再建 **`index.mjs`** 只做 re-export（当前不建亦可）。

---

## 三、Wave 1：紧急阈值释放（本周）

### 1.1 VoiceAgentService.ts（945/1100 行，85.9%）— ✅ 已完成并收口

**现状：** 主文件是 orchestrator，业务逻辑已分散在 10+ 子文件（`VoiceAgentService.*.ts`）中。主文件已降至 945 行，核心编排（Start/Stop/Toggle）保留在主文件。

**已拆出子模块：**

| 新子文件 | 行数 | 职责 | Guard 影响 |
|---------|------|------|-----------|
| `VoiceAgentDictationController.ts` | 77 | Dictation pipeline 控制器，持有 `SpeechAnnotationPipeline` 实例 | 匹配 `^src/services/(?:[^/]+/)*.*Service\.ts$` patternRule（maxLines: 2000） |
| `VoiceAgentService.grounding.ts` | 56 | Grounding UI 上下文合并与 GroundingContext 构建 | 独立 helper，无额外阈值风险 |
| `VoiceAgentService.commandBridgeFields.ts` | 45 | CommandBridge 字段拼装 helper | 独立 helper，无额外阈值风险 |
| `VoiceAgentService.wakeWordLifecycle.ts` | 40 | WakeWord 生命周期绑定/停止编排 | 独立 helper，无额外阈值风险 |
| `VoiceAgentService.wakeWordFailure.ts` | 24 | WakeWord 失败日志与错误态回写 | 独立 helper，无额外阈值风险 |

**Grounding 未拆分：** `setUiContext`/`setLocale`/`_buildGroundingContext` 仅 ~33 行，拆出收益不抵接口复杂度，评估后跳过。

**不拆的内容（留在主文件）：**
- Constructor（~60 行）：类的初始化入口
- Start/Stop/Toggle（~180 行）：核心生命周期编排
- State getters/setters + event emission（~70 行）：状态管理骨架
- `_handleSttResult`（~40 行）：STT 结果分发（已有 `VoiceAgentService.sttResultDispatch.ts` 处理具体逻辑）

**Guard 相关规则：**
- `VoiceAgentService.ts`：maxLines 1100（当前 945，缓冲 155 行）
  - ✅ 已从高水位区回落到可维护区间；后续以 900~950 作为软目标继续监控。
- `VoiceAgentService.singleton.ts`：maxLines 80（独立规则，不受影响）
- `VoiceAgentService.state.ts` / `.runtime.ts` / `.wakeWordBindings.ts` 等：已独立存在，保持现状

### 1.2 useTranscriptionWaveformBridgeController.ts（673/700 行，96.1%）

**现状：** 阈值已从 620 提升到 700，当前有 27 行缓冲。

**暂不拆文件路径。** 页面专属 controller 的惯例仍是 `src/pages/useXxxController.ts`。命名 controller 的 `pageControllerRule` 与 **0.1 已扩展的 pages 批量 patternRule**（`^src/pages/(?:[^/]+/)*use.*Controller\.ts$` 等）已支持子目录命中；若未来迁入 `src/pages/<子域>/`，需同步检查该文件是否在既有 `excludeFiles` 或单文件 `file:` ratchet 列表中，避免阈值口径遗漏。

**若需瘦身：** 将波形渲染逻辑（Canvas/WebGL）抽为同目录或子目录的专用 hook/helper，原 controller 通过 import 调用；子目录路径在批量规则下已可被覆盖，仍以「单 PR 小步 + guard 全量通过」为约束。

### 1.3 useTranscriptionData.ts（529/600，88.2%）

**暂不拆分**，监控至 570 行再行动。当前有 71 行缓冲。

---

## 四、Wave 2：AI Chat 层与超大服务层拆分（2-3 周）

> **优先级调整：** Wave 2.1（AI Chat）先于 Wave 2.2（LinguisticService）。AI Chat 多文件并行逼近阈值，风险更紧迫。

### 2.1 AI Chat 层重组（75 平铺文件）— ✅ 主要收敛已完成

**已完成：**
- `toolCallHelpers.ts`：从 1571 拆到 690 行（-881 行，使用率 69.0%）
  - 拆出 `segmentTextParsers.ts`（109 行）：`parseChineseInteger`、`parseEnglishOrdinal`、`extractSegmentSelectorFromUserText`
  - 拆出 `toolCallValidation.ts`（226 行）：所有 `validate*` 函数 + 辅助函数
- `localContextToolExecutors.ts`：已完成深拆分，主文件降至 202 行；拆分产物落地在 `src/ai/chat/executors/`（9 个子模块，合计 1780 行）
- 热点收敛（短期重点）：
  - `localContextToolFormatters.ts`：当前 82/1000（8.2%）
  - `localToolSlotResolver.ts`：当前 146/1000（14.6%）

**后续工作（非门禁阻塞项）：**
- 持续维持小文件编排入口形态，新增逻辑优先落到 `src/ai/chat/formatters/`、`src/ai/chat/executors/` 等子模块

**Guard 影响：**
- `toolCallHelpers.ts`：已回归 AI Chat 批量规则（maxLines 1000）
- `localContextToolExecutors.ts`：已回归 AI Chat 批量规则（maxLines 1000），当前 202/1000
- `localContextToolFormatters.ts` 和 `localToolSlotResolver.ts`：均受 AI Chat 批量规则（maxLines 1000）直接约束
- **本轮已移除两条 1100 临时 ratchet，Guard 口径统一为单一 1000 ceiling**

#### 2.1.1 `toolCallHelpers.ts` ratchet 删除执行条目（已完成）

**当前状态：**
1. `src/ai/chat/toolCallHelpers.ts` 行数已降至 690（≤1000）。
2. `scripts/architecture-guard.config.mjs` 已无 `toolCallHelpers.ts` 专门 1700 规则。
3. `npm run check:architecture-guard:core` 当前通过，且无 `toolCallHelpers.ts` 专项口径报错。

### 2.2 LinguisticService.ts（1684 行）+ LinguisticService.languageCatalog.ts（1639 行）

该域尚未开始目录重组，继续维持 Wave 2 待办。AI Chat 的拆分收尾（2.1）完成后，再启动该域拆分，避免并发改动放大 review 与回归风险。

---

## 五、Wave 3：Hooks 分组（3-4 周）

> ⚠️ **前置条件：** Phase 0.2 allowlist 迁移策略落地（引擎已实现）+ Phase 0.1 hooks 批量 patternRule 扩展至子目录。

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
| `TranscriptionPage.ReadyWorkspace.tsx` | 1981 | 2600 | 76.2% | 已抽出 `useReadyWorkspaceTrackEditControllers`、`useReadyWorkspaceTimelineSyncSetup`、`useReadyWorkspacePlaybackReadModelSetup`、`useReadyWorkspaceSurfaceProps` 等；后续继续按域减薄编排层 | 单文件规则 maxLines 2600；结构锚点见 `TranscriptionPage.structure.test.ts` |
| `useReadyWorkspaceSurfaceProps.tsx` | 488 | 650（单文件 ratchet） | — | ReadyWorkspace 舞台/侧栏/遮罩 props 组装 | `file:` 规则 + bulk `excludeFiles` |
| `useReadyWorkspaceTrackEditControllers.ts` | 300 | 450（单文件 ratchet） | — | 批量/轨道显示/说话人/轨道实体/文本编辑等聚合 | `file:` 规则 + bulk `excludeFiles` |
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
| 3 | Phase 0.2：allowlist 机制实现 | Agent | 2026-05-12 | 🟡 引擎已实现 | 待在目标规则中补齐 allowlist 条目 |
| 4 | Phase 0.3：基线脚本运行并归档 | Agent | 2026-05-08 | ✅ | `report:code-scale` / `report:code-scale:archive` + `reports/code-scale/README.md`；归档文件默认 gitignore |
| 5 | Phase 0.4：guard 规则按域拆分 | Agent | 2026-05-15 | ✅ | 根配置仅聚合；`rules.*` + `patterns.pre/post` + `rules.app` 已承载全部规则体；`index.mjs` 可选 |
| 6 | Wave 1.1：VoiceAgentService 拆出 dictation | Agent | 2026-05-08 | ✅ | — |
| 7 | Wave 1.2：waveform bridge 评估（暂不拆路径） | Agent | 2026-05-15 | ✅ | 结论：暂不拆路径，继续按 700 阈值监控 |
| 8 | Wave 2.1：AI Chat 层重组 | Agent | 2026-05-09 | ✅ | toolCallHelpers/formatters/slotResolver 已回落到安全区 |
| 9 | Wave 2.2：LinguisticService 目录重组 | 待分配 | 2026-05-29 | ⏳ | — |
| 10 | Wave 3：Hooks 分组启动 | 待分配 | 2026-06-05 | ⏳ | 待确定首批域和迁移顺序 |

---

## 十、附录：接近阈值文件实时监控

运行 `node scripts/report-code-scale-baseline.mjs` 获取最新数据。

**当前热点（2026-05-09 文档修订，以本地 `wc -l` / 最新基线脚本为准）：**

| 文件 | 当前行数 | 阈值 | 使用率 | 行动 |
|------|---------|------|--------|------|
| `TranscriptionPage.ReadyWorkspace.tsx` | 1981 | 2600 | 76.2% | 🟢 已部分下沉；继续监控编排层回调密度 |
| `useReadyWorkspaceSurfaceProps.tsx` | 488 | 650 | 75.1% | 🟢 单文件 ratchet，避免与 bulk 300 行规则冲突 |
| `useReadyWorkspaceTrackEditControllers.ts` | 300 | 450 | 66.7% | 🟢 聚合边界；与 bulk 规则互斥排除 |
| `VoiceAgentService.ts` | 945 | 1100 | 85.9% | ✅ Task 6 收口完成，持续监控 |
| `VoiceAgentDictationController.ts` | 77 | 2000 | 3.9% | 🟢 新增，无风险 |
| `useTranscriptionWaveformBridgeController.ts` | 673 | 700 | 96.1% | 🟡 高水位监控 |
| `useTranscriptionData.ts` | 529 | 600 | 88.2% | 🟢 监控 |
| `LinguisticService.ts` | 1684 | 2000 | 84.2% | 🟡 Wave 2 目录重组 |
| `LinguisticService.languageCatalog.ts` | 1639 | 2000 | 82.0% | 🟡 Wave 2 随主服务一起迁移 |
| `toolCallHelpers.ts` | 690 | 1000 | 69.0% | ✅ 已完成 |
| `localContextToolExecutors.ts` | 202 | 1000 | 20.2% | ✅ 已深拆分，主文件转为编排入口 |
| `localContextToolFormatters.ts` | 82 | 1000 | 8.2% | 🟢 已收敛 |
| `localToolSlotResolver.ts` | 146 | 1000 | 14.6% | 🟢 已收敛 |
| `segmentTextParsers.ts` | 109 | — | — | 🟢 新增 |
| `toolCallValidation.ts` | 226 | — | — | 🟢 新增 |

> 注：当前 `^src/ai/chat/.*\.(ts|tsx)$` 批量规则 `excludeFiles` 仅包含 `toolCallHelpers.ts`。`localContextToolExecutors.ts`、`localContextToolFormatters.ts`、`localToolSlotResolver.ts` 均按批量规则（maxLines: 1000）治理；本轮已删除两条 1100 临时 ratchet，消除双口径。

---

## 十一、归档

- 初版七波次方案：`docs/architecture/_archive/code-governance-plan-2026-05-06-v1.md`
