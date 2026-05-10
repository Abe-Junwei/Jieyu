---
title: 代码治理计划（修订版 v2）
doc_type: architecture-governance-plan
status: active
owner: repo
last_reviewed: 2026-05-11
source_of_truth: code-governance-plan-2026-05-06-v2
depends_on:
  - ../execution/governance/未落地项汇总-2026-04-24.md
  - ../execution/audits/CODE_REVIEW_REPORT_2026-05-07.md
  - ../execution/plans/技术债修复方案-2026-05-08.md
---

# 代码治理计划（修订版 v2）

> 状态：可执行 | 基线：**2026-05-11**（与下文 `wc -l` 快照同源） | 规划人：Agent
>
> 本方案替代初版七波次方案，解决了与 `architecture-guard.config.mjs` 的兼容性冲突。
>
> **单一真源：** Wave（Phase 0～6）、附录热点表、**§十一** 横切滚动项（原《技术债滚动》）与 **§〇** 统一排期 **同一篇内自洽**；不再单独维护「技术债滚动」文档。执行计划索引见 `docs/execution/plans/README.md` 对本文件的引用。

---

## 〇、统一排期与优先级（与 §二～§八、§十一对齐）

> 本节把「门禁波次」与「横切工程债」压成一张优先级表，避免 §2.2 / §5.1 / §11.1 各说各话。行数均为 **2026-05-09** 前后 `wc -l` 快照，合并前请重跑。

| 优先级    | 主题                                  | 现状（快照）                                                                                                                                         | 主要落位                             | 下一步（可验收）                                                                                              |
| ------ | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **P0** | **Wave 2.2** Linguistic 门面 + 语言目录核心 | `LinguisticService.ts` **526** 行（卫星 `linguisticService*.ts` 已薄门面）；`languageCatalog/languageCatalogCore.ts` **薄 barrel ~8 行**（`languageCatalogCore*` + `languageCatalogUpsert*` + `languageCatalogListEntriesFilter`）；`languageCatalogCoreMutations.ts` **~256** 行；`LinguisticService.languageCatalog.ts` 薄 barrel **12** 行 | **§2.2**                         | 下一批：`languageCatalogUpsertLanguageDocExtended.ts` 若再涨可按子域拆；其余按需；每批 `madge --circular` + 定向 Vitest |
| **P0** | **ARCH-7** ReadyWorkspace 编排壳       | **入口** `TranscriptionPage.ReadyWorkspace.tsx` **10** / 40；**body** `TranscriptionPage.ReadyWorkspace.body.tsx` **20** / 80（薄壳）；**编排** `TranscriptionPage.ReadyWorkspaceOrchestrator.tsx` **~231** / 2600；`useReadyWorkspaceReadyPhaseBootstrap.ts` **122** / 140（ratchet） | **§5.1**、**§11.1**               | 延续 **C2**：新回调进专用 controller；编排增量默认进 **Orchestrator** 或阶段 hook；`npm run check:architecture-guard`；编排面外拆事实见 **§5.1.1**                                        |
| **P1** | **G4** `useAiChat` 与相关卫星            | `useAiChat.ts` **564** / `hookRule` **1100**（约 51.3%）；`sendTurnStreamPhase` / `confirmExecution` 等已部分外拆                                        | **§2.1**、**§11.1**、**§五 Wave 3** | 继续把大块迁入既有 `useAiChat.*` 卫星模块；控制 `useCallback`/`useEffect` 计数近顶前预拆                                     |
| **P1** | **Wave 4** DB 类型与 schema            | `db/types.ts` **1268**；`db/schemas.ts` **1517**                                                                                                | **§六**                           | 分型外迁；schemas 体量已高于旧规划数字，**以本表为真**                                                                     |
| **P2** | **Wave 3** hooks 根目录平铺              | 根目录约 **271** 个 `*.ts/*.tsx`（仅 `src/hooks/` 深度 1）                                                                                               | **§五**                           | 首批域迁入子目录 + guard `matchRegex` / `allowlist`；禁止全量 `src/hooks/index.ts` barrel                          |
| **P2** | **G3** 分包与 Wave 6 基建                | `language-mapping-runtime` 约 **342KB**（见 §11 历史口径）                                                                                             | **§八**、**§11.1**                 | 按需加载 / registry chunk 实验；与 Knip、体积分轨对齐                                                                |
| **持续** | 文档链接、i18n 硬编码、guard 回归              | `report:docs-link-debt`；ledger + `i18n-hardcoded-thresholds.json`                                                                              | **§11.1～11.3**                   | 见 **§11.2** 发版命令；大 doc 搬迁后重跑 link debt                                                                |

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

## 三、Wave 1：紧急阈值释放（已完成）

### 1.1 VoiceAgentService.ts（817/1100 行，约 74%）— ✅ 已完成并收口

**现状：** 主文件是 orchestrator，业务逻辑已分散在 10+ 子文件（`VoiceAgentService.*.ts`）中。主文件当前 **817** 行（`wc -l`），核心编排（Start/Stop/Toggle）保留在主文件。

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
- `VoiceAgentService.ts`：maxLines 1100（当前 817，缓冲充足）
  - ✅ 已从高水位区回落到可维护区间；后续以 **≤900** 行作为软目标继续监控。
- `VoiceAgentService.singleton.ts`：maxLines 80（独立规则，不受影响）
- `VoiceAgentService.state.ts` / `.runtime.ts` / `.wakeWordBindings.ts` 等：已独立存在，保持现状

### 1.2 useTranscriptionWaveformBridgeController.ts（460/700 行，约 66%）— ✅ 已拆卫星模块

**现状：** 主 controller 已降至 **460** 行（`wc -l`），仍由 `pageControllerRule('useTranscriptionWaveformBridgeController')` 约束（maxLines **700**）。RAF 聚合、tier 横向同步、选段播放/循环等已迁出到 **同目录、文件名不以 `use` 开头** 的模块，避免命中 `rules.patterns.postCss.mjs` 中对 `src/pages/use*.tsx?`（非 `Controller`）的 **300 行** 批量规则。

**卫星文件（职责摘要）：**

| 文件 | 行数（约） | 职责 |
|------|------------|------|
| `waveformBridgeRegionDragRaf.ts` | 60 | Regions 拖拽 `onRegionUpdate` / `onRegionUpdateEnd` 的 RAF 合并 |
| `waveformBridgeHoverScrollRaf.ts` | 142 | 悬停读数 + `waveformScrollLeft` 的 RAF 与鼠标移入/移出 |
| `waveformBridgeTierScrollSync.ts` | 51 | tier 与 WaveSurfer 横向对齐；无媒体→有媒体时 tier 复位 |
| `waveformBridgeSegmentPlaybackControls.ts` | 151 | 选段循环/播放、倍速、选区变化时的 seek / `zoomToUnit` |

**路径约定：** 主文件仍为 `src/pages/useTranscriptionWaveformBridgeController.ts`；若未来迁入子目录，需同步核对 `excludeFiles` / 单文件 ratchet，避免双计或漏计。

### 1.3 useTranscriptionData（入口 + 组合子 hook）— ✅ 已拆分

**现状：** 对外入口 `src/hooks/useTranscriptionData.ts` 现为 **薄组合层（约 10 行）**，装配逻辑在：

- `useTranscriptionDataFoundation.ts`（**114** 行）：`useTranscriptionState` + 持久化 + recovery 调度 + anchor + undo，以及 `activeUnitId` / `activeSegmentUnitId`。
- `useTranscriptionDataBindings.ts`（**579** 行）：derived、phase effect、媒体选择、快照、actions、mutex、云同步、canonical、selection 与四个 API 对象拼装。

`hookRule('useTranscriptionData')` 仍只 ratchet **入口文件**（maxLines **600**）；子文件落在 hooks **批量** `patternRule`（maxLines **1500**）下，当前远低于上限。

---

## 四、Wave 2：AI Chat 层与超大服务层拆分（2-3 周）

> **优先级调整：** Wave 2.1（AI Chat）先于 Wave 2.2（LinguisticService）。AI Chat 多文件并行逼近阈值，风险更紧迫。

### 2.1 AI Chat 层重组（75 平铺文件）— ✅ 主要收敛已完成

**与 G4（§〇 P1、§11.1）：** `useAiChat.ts` 命名 hook 仍为主编排面（当前 **564/1100** 行，`rules.hooks.mjs`）；大块逻辑应继续落入 `useAiChat.*` 卫星文件，避免在入口层堆叠新 `useCallback` 簇。

**已完成：**
- `toolCallHelpers.ts`：从 1571 拆到 690 行（-881 行，使用率 69.0%）
  - 拆出 `segmentTextParsers.ts`（109 行）：`parseChineseInteger`、`parseEnglishOrdinal`、`extractSegmentSelectorFromUserText`
  - 拆出 `toolCallValidation.ts`（226 行）：所有 `validate*` 函数 + 辅助函数
- `localContextToolExecutors.ts`：已完成深拆分，主文件当前约 **218** 行（`wc -l`）；拆分产物落地在 `src/ai/chat/executors/`（多子模块编排入口）
- 热点收敛（短期重点）：
  - `localContextToolFormatters.ts`：当前 82/1000（8.2%）
  - `localToolSlotResolver.ts`：当前 146/1000（14.6%）

**后续工作（非门禁阻塞项）：**
- 持续维持小文件编排入口形态，新增逻辑优先落到 `src/ai/chat/formatters/`、`src/ai/chat/executors/` 等子模块

**Guard 影响：**
- `toolCallHelpers.ts`：已回归 AI Chat 批量规则（maxLines 1000）
- `localContextToolExecutors.ts`：已回归 AI Chat 批量规则（maxLines 1000），当前约 218/1000
- `localContextToolFormatters.ts` 和 `localToolSlotResolver.ts`：均受 AI Chat 批量规则（maxLines 1000）直接约束
- **本轮已移除两条 1100 临时 ratchet，Guard 口径统一为单一 1000 ceiling**

#### 2.1.1 `toolCallHelpers.ts` ratchet 删除执行条目（已完成）

**当前状态：**
1. `src/ai/chat/toolCallHelpers.ts` 行数已降至 690（≤1000）。
2. `scripts/architecture-guard.config.mjs` 已无 `toolCallHelpers.ts` 专门 1700 规则。
3. `npm run check:architecture-guard:core`：**AI Chat 行数项不因 `toolCallHelpers` 失败**；命名 page controller 是否仍触顶以 **当前 guard 输出**为准（历史叙述见 **§10** 表与 **§11**）。

### 2.2 LinguisticService.ts + language catalog 子域 — **进行中（Wave 2.2 当前焦点）**

**现状（以仓库 `wc -l` 为准，随 PR 漂移）：**

- `src/services/LinguisticService.ts`：**526** 行（`wc -l`；卫星模块：`linguisticServiceMediaImport`、`linguisticServiceImportQualityReport`、`linguisticServiceLexemeOps`、`linguisticServiceUnitTokenOps`、`linguisticServiceLayerOps`、`linguisticServiceTextTimelineOps`、`linguisticServiceMediaReadWrite`、`linguisticServiceDatabaseIo`、`linguisticServiceProjectBootstrap`、`linguisticServiceTierFacade`、`linguisticServiceLanguageCatalogFacade`、`linguisticServiceOrthographyFacade`、`linguisticServiceStructuralProfileFacade`、`linguisticServiceCollaborationCleanupFacade` 等），Wave 2.2 **门面已薄**；语言目录核心已自 `languageCatalogCore.ts` 单文件拆出（见下条）。
- `src/services/LinguisticService.languageCatalog.ts`：已收口为 **薄 barrel**（re-export `languageCatalog/*` + customFieldAdmin），**动态 import 路径必须保持稳定**（见文件头注释）。
- `src/services/languageCatalog/languageCatalogCore.ts`：**薄 re-export**（`refreshLanguageCatalogReadModel` + CRUD/history API），逻辑分布在 `languageCatalogCoreNormalization.ts`、`languageCatalogCoreProjection.ts`、`languageCatalogCoreReadModel.ts`、`languageCatalogCoreHistory.ts`、`languageCatalogCoreMutations.ts`（list/get/delete/history + upsert 编排）、`languageCatalogListEntriesFilter.ts`（列表搜索过滤），以及 **`languageCatalogUpsertPrep.ts` / `languageCatalogUpsertRows.ts` / `languageCatalogUpsertLanguageDoc*.ts`**（`upsert` 预计算、别名与 displayName 行、`LanguageDoc` 分片 merge：identity / extended / trail）；**动态 import 仍指向 `./languageCatalog/languageCatalogCore`** 的路径不变。

**下一步（Wave 2.2 执行顺序建议）：**

1. ✅ **已完成外拆簇：** 媒体导入三 API → `linguisticServiceMediaImport.ts`；导入质量报告 → `linguisticServiceImportQualityReport.ts`；lexeme / 深链 → `linguisticServiceLexemeOps.ts`；unit + token + morpheme + `token_lexeme_links` + `getAllUnits`/`getUnitAtTime`/`getUnitsByTextId` → `linguisticServiceUnitTokenOps.ts`；层 / 文本时间线 / 媒体读写 / DB 快照 / `createProject` / tier+语言目录+正字法+结构规则门面 / cleanup → 对应 `linguisticService*.ts`。**语言目录**原 `languageCatalogCore.ts` 单文件 → 上段多模块拆分。`LinguisticService.test.ts`、`LanguageCatalogSearchService.test.ts` 等绿；`madge --circular` 0。
2. **下一批候选：** `LanguageDoc` upsert 已拆 `Identity` / `Extended` / `Trail`；列表搜索已迁 `languageCatalogListEntriesFilter.ts`；若 `languageCatalogUpsertLanguageDocExtended.ts` 继续膨胀可再按子域切分。门面仅按需再薄化。每批附定向 Vitest + `madge --circular`。

---

## 五、Wave 3：Hooks 分组（3-4 周）

> ⚠️ **前置条件：** Phase 0.2 allowlist 迁移策略落地（引擎已实现）+ Phase 0.1 hooks 批量 patternRule 扩展至子目录。

`src/hooks/` 根目录约 **271** 个 `*.ts` / `*.tsx`（深度 1 计数；含子目录文件总数以 `npm run report:code-scale` 为准）。

**按域分组（不一次性搬完，分批）：**

```
src/hooks/
  ├── useTranscriptionData.ts           # 保留原位（薄入口；组合见 useTranscriptionDataFoundation / useTranscriptionDataBindings）
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

> **优先级：** 与 **§〇 P1** 一致；`schemas.ts` 当前行数已高于 `types.ts`，外迁时建议 **并行或优先 schemas 拆分**，避免单文件继续成为 merge 冲突热点。

### 4.1 src/db/types.ts（**1268** 行，`wc -l` 快照）

```
src/db/types/
  ├── index.ts
  ├── transcription.ts
  ├── segment.ts
  ├── annotation.ts
  └── user.ts
```

### 4.2 src/db/schemas.ts（**1517** 行，`wc -l` 快照；外迁优先级不低于 types）

```
src/db/schemas/
  ├── index.ts
  ├── transcriptionSchema.ts
  ├── segmentSchema.ts
  └── ...
```

---

## 七、Wave 5：组件瘦身（5-6 周）

> **ARCH-7：** ReadyWorkspace **chunk 入口**（`TranscriptionPage.ReadyWorkspace.tsx`）、**薄 body**（`TranscriptionPage.ReadyWorkspace.body.tsx`，chunk 导出面）与 **编排实现**（`TranscriptionPage.ReadyWorkspaceOrchestrator.tsx`）分列行数口径，与 **§〇 P0**、**§11.1** 同一跟踪面；本 Wave 以「薄入口 + 薄 body + 编排模块 + 卫星 controller / hook」为验收单位。

### 5.1 TOP 组件拆分

| 组件 | 当前行数 | 阈值 | 使用率 | 拆分方向 | Guard 影响 |
|------|---------|------|--------|----------|-----------|
| `TranscriptionPage.ReadyWorkspace.tsx`（chunk 入口） | 10 | 40 | — | CSS + re-export body；重编排见 **Orchestrator** | `rules.pages.mjs` 入口 maxLines **40** |
| `TranscriptionPage.ReadyWorkspace.body.tsx` | 20 | 80 | 约 25% | 薄壳：结构锚点 + 转发 `TranscriptionPageReadyWorkspaceOrchestrator` | `rules.pages.mjs` body maxLines **80** |
| `TranscriptionPage.ReadyWorkspaceOrchestrator.tsx` | ~231 | 2600 | 约 8.9% | 编排壳：`domainShell` / `pre` / `bootstrap` 等阶段结果装配；重 wiring 见 `useReadyWorkspace*Phase` 与 `buildReadyWorkspace*PhaseParams`（事实记录 **§5.1.1**） | `rules.pages.mjs` orchestrator maxLines **2600**；结构测试合并读 shell+body+orchestrator |
| `useReadyWorkspaceReadyPhaseBootstrap.ts` | 122 | 140（ratchet） | 约 87.1% | ready 态前置：统一条数同步、段钳制、interaction helpers、段 mutation/creation、unit ops、overlay 路由 | `architectureGuardPageRatchetFileRules` |
| `useReadyWorkspaceSurfaceProps.tsx` | 504 | 650（单文件 ratchet） | 约 77.5% | ReadyWorkspace 舞台/侧栏/遮罩 props 组装 | `file:` 规则 + bulk `excludeFiles` |
| `useReadyWorkspaceTrackEditControllers.ts` | 316 | 450（单文件 ratchet） | 约 70.2% | 批量/轨道显示/说话人/轨道实体/文本编辑等聚合 | `file:` 规则 + bulk `excludeFiles` |
| `SettingsModal.tsx` | 142 | — | — | 已按 Tab 拆至 `src/components/settings/*`，主文件为薄编排壳 | 无单条规则，受批量约束 |
| `AiAnalysisPanel.tsx` | 243 | 2250（components 批量） | 约 10.8% | 声学分析拆至 `AiAnalysisPanelAcousticTabContent.tsx`、`useAiAnalysisPanelAcousticModel.ts`、`aiAnalysisPanelAcoustic/*` | 受 `rules.patterns.postCss.mjs` 中 `src/components` 批量 maxLines **2250** 约束 |
| `LayerActionPopover.tsx` | **192** | — | — | 创建/元数据/编辑区块与表单状态、动作 hook 已迁至 `src/components/layerActionPopover/*`；主文件仅组装 | 无单条规则，受批量约束 |

### 5.1.1 事实记录：`ReadyWorkspaceOrchestrator` 编排壳收口（2026-05-11）

> 本节为合并后可追溯的**事实快照**（行数以当时 `wc -l` 为准）；与 **§〇 P0**、§5.1 主表、**§10** 热点表交叉引用时，以本节日期后的重跑为准。

- **`TranscriptionPage.ReadyWorkspaceOrchestrator.tsx`**：由原先千行级 body 编排收敛为 **约 231 行**薄编排壳（`wc -l` ≈231）；`useTranscriptionData` 在壳层仅做**最小解构**（如 `state`、冲突票据与若干顶层 action），域壳能力经 **`useReadyWorkspaceDomainShellPhase`** 聚合为 `domainShell`，避免在编排文件内展开大块 `data` 字段。
- **前置 chrome / 读模型边界**：**`useReadyWorkspacePreBootstrapChromePhase`** 承接 transcription lane 读范围、时间线索引等与 ADR 0020 相关的 wiring（与 `audit:ready-workspace-timeline-host` 门禁对齐）。
- **阶段参数纯函数**：时间线 / 助手 / 播放 **`buildReadyWorkspaceTimelineAssistantPlaybackPhaseParams`**；侧栏与轨道 **`buildReadyWorkspaceSidebarAndTrackPhaseParams`**；viewModels 与 surface **`buildReadyWorkspaceViewModelsSurfacePhaseParams`** — 编排壳主要负责调用阶段 hook 并传入上述 builder 产物，降低 orchestrator 内联对象字面量体积。
- **验收**：`TranscriptionPage.structure.test.ts` 延续 shell + body + orchestrator 结构约束；`npm run check:architecture-guard`（含 `rules.pages.mjs` 与 timeline 审计脚本）为合并前硬门槛。

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
| 3 | Phase 0.2：allowlist 机制实现 | Agent | 2026-05-12 | 🟢 | `rules.patterns.preCss.mjs` 中 pages bulk `use*Controller.ts` 规则已接 `allowlist`（与 `excludeFiles` 并存）；引擎语义见 `check-architecture-guard.mjs` |
| 4 | Phase 0.3：基线脚本运行并归档 | Agent | 2026-05-08 | ✅ | `report:code-scale` / `report:code-scale:archive` + `reports/code-scale/README.md`；归档文件默认 gitignore |
| 5 | Phase 0.4：guard 规则按域拆分 | Agent | 2026-05-15 | ✅ | 根配置仅聚合；`rules.*` + `patterns.pre/post` + `rules.app` 已承载全部规则体；`index.mjs` 可选 |
| 6 | Wave 1.1：VoiceAgentService 拆出 dictation | Agent | 2026-05-08 | ✅ | — |
| 7 | Wave 1.2～1.3：波形桥 + `useTranscriptionData` 阈值释放 | Agent | 2026-05-15 | ✅ | 1.2：同目录 `waveformBridge*.ts` 卫星模块 + 主 controller **460/700**；1.3：入口薄化 + `useTranscriptionDataFoundation` / `useTranscriptionDataBindings` |
| 8 | Wave 2.1：AI Chat 层重组 | Agent | 2026-05-09 | ✅ | toolCallHelpers/formatters/slotResolver 已回落到安全区 |
| 9 | Wave 2.2：LinguisticService 门面 + `languageCatalog/*` 分簇 | 待分配 | 2026-05-29 | ⏳ | 门面已薄；语言目录已多文件分簇；当前最大块多为 `languageCatalogUpsertLanguageDocExtended.ts`；见 **§2.2** |
| 10 | Wave 3：Hooks 分组启动 | 待分配 | 2026-06-05 | ⏳ | 首批域与 `allowlist` 策略见 **§〇 P2**、**§五**；与 G4（`hooks/ai/`）可同批次规划 |
| 11 | 命名 page controller 行数（guard:core） | 待分配 | — | 🟢 | 以 `npm run check:architecture-guard:core` 为准；历史热点见 **§10** 表；若再超限则降压或经评审调整 `rules.pages.mjs` ratchet |

---

## 十、附录：接近阈值文件实时监控

运行 `node scripts/report-code-scale-baseline.mjs` 获取最新数据。

**当前热点（2026-05-09 文档同步，以本地 `wc -l` 为准；合并/拉取后请重跑）：**

| 文件 | 当前行数 | 阈值 | 使用率 | 行动 |
|------|---------|------|--------|------|
| `TranscriptionPage.ReadyWorkspace.tsx`（入口） | 10 | 40 | — | 🟢 chunk 壳；重逻辑在 Orchestrator |
| `TranscriptionPage.ReadyWorkspace.body.tsx` | 20 | 80 | 约 25% | 🟢 薄壳达标 |
| `TranscriptionPage.ReadyWorkspaceOrchestrator.tsx` | ~231 | 2600 | 约 8.9% | 🟢 编排壳已薄；增量进阶段 hook / builder（见 **§5.1.1**） |
| `useReadyWorkspaceReadyPhaseBootstrap.ts` | 122 | 140（ratchet） | 约 87.1% | 🟡 近 ratchet 顶；后续可再按域拆簇 |
| `useReadyWorkspaceSurfaceProps.tsx` | 504 | 650 | 约 77.5% | 🟢 单文件 ratchet，避免与 bulk 300 行规则冲突 |
| `useReadyWorkspaceTrackEditControllers.ts` | 316 | 450 | 约 70.2% | 🟢 聚合边界；与 bulk 规则互斥排除 |
| `AiAnalysisPanel.tsx` | 243 | 2250 | 约 10.8% | 🟢 声学 Tab 等已外拆；继续监控 |
| `VoiceAgentService.ts` | 817 | 1100 | 约 74.3% | ✅ 持续监控；软目标 ≤900 行 |
| `VoiceAgentDictationController.ts` | 77 | 2000 | 约 3.9% | 🟢 子模块，无阈值压力 |
| `useTranscriptionWaveformBridgeController.ts` | 460 | 700 | 约 65.7% | ✅ 已拆 `waveformBridge*.ts`；缓冲充足 |
| `waveformBridge*.ts`（4 文件合计） | 404 | — | — | 🟢 卫星模块；单文件各自受 `pages/(?!use)` 批量（800 行）约束 |
| `useTranscriptionData.ts` | 10 | 600 | 约 1.7% | ✅ 薄入口 |
| `useTranscriptionDataBindings.ts` | 579 | 1500 | 约 38.6% | 🟢 hooks 批量；继续避免再膨胀 |
| `useTranscriptionDataFoundation.ts` | 114 | 1500 | 约 7.6% | 🟢 hooks 批量 |
| `LinguisticService.ts` | 526 | 2000 | 约 26.3% | 🟡 Wave 2.2：门面已薄 |
| `languageCatalog/languageCatalogCore.ts` | ~8 | — | — | 🟢 Wave 2.2：薄 barrel，re-export 子模块 |
| `languageCatalog/languageCatalogCoreMutations.ts` | ~256 | — | — | 🟢 Wave 2.2：写路径编排 |
| `languageCatalog/languageCatalogUpsertLanguageDocExtended.ts` | ~172 | — | — | 🟢 Wave 2.2：扩展元数据 merge（濒危/地理/方言等） |
| `LinguisticService.languageCatalog.ts` | 12 | — | — | 🟢 薄 barrel；动态 import 路径勿改 |
| `toolCallHelpers.ts` | 690 | 1000 | 69.0% | ✅ 已完成 |
| `localContextToolExecutors.ts` | 218 | 1000 | 约 21.8% | ✅ 已深拆分，主文件编排入口 |
| `localContextToolFormatters.ts` | 82 | 1000 | 8.2% | 🟢 已收敛 |
| `localToolSlotResolver.ts` | 146 | 1000 | 14.6% | 🟢 已收敛 |
| `segmentTextParsers.ts` | 109 | — | — | 🟢 新增 |
| `toolCallValidation.ts` | 226 | — | — | 🟢 新增 |
| `useBatchOperationController.ts` | 112 | 130 | 约 86% | 🟢 当前低于 ceiling（以本地 `wc -l` / guard 为准） |
| `useSpeakerActionScopeController.ts` | 214 | 250 | 约 85.6% | 🟢 |
| `useTrackDisplayController.ts` | 259 | 260 | 约 99.6% | 🟡 缓冲薄；继续避免膨胀 |
| `useWaveformAcousticOverlay.ts` | 197 | 300 | 约 65.7% | 🟢 |
| `useAiChat.ts` | 564 | 1100（`hookRule`） | 约 51.3% | 🟡 **G4**：见 **§〇**、**§2.1**；近顶前继续外拆大块 |

> 注：当前 `^src/ai/chat/.*\.(ts|tsx)$` 批量规则 `excludeFiles` 仅包含 `toolCallHelpers.ts`。`localContextToolExecutors.ts`、`localContextToolFormatters.ts`、`localToolSlotResolver.ts` 均按批量规则（maxLines: 1000）治理；本轮已删除两条 1100 临时 ratchet，消除双口径。

> **guard:core 说明：** 命名 page controller 是否超限以 **`npm run check:architecture-guard:core` 输出**为准；上表行数为文档同步时快照，合并后请重跑脚本与 `wc -l`。

---

## 十一、持续滚动与横切项（承接原《技术债滚动》）

> **废止说明：** `docs/execution/plans/技术债滚动-2026-05-08.md` 已删除；本节为原 **§1～§3** 的真值承接。里程碑快照《[技术债修复方案-2026-05-08.md](../execution/plans/技术债修复方案-2026-05-08.md)》仍为 **`superseded`**，关闭条件已满足；**未消失的开放项**在下列表中统一跟踪，并与 **§〇**、**Wave 2 / 5 / 6** 交叉引用。

### 11.1 仍开放的工程与文档项

> **与 §〇 的关系：** **§〇** 给出跨 Wave 的统一优先级与行数快照；本表保留「主题 → 责任文书 / 命令」索引，便于台账与审计引用。

| 主题 | 当前口径 | 规划落位与下一步 |
|------|----------|------------------|
| **ARCH-7** | **入口** **10** 行 + **body 薄壳 ~20** 行 + **Orchestrator ~231** 行（见 **§〇 P0**、§5.1 表、**§5.1.1**） | **Wave 5.1** + 原方案 **C2**：编排增量进阶段 hook / 参数 builder；薄 orchestrator 上仍以 `check:architecture-guard` 验收 |
| **G4 `useAiChat` 瘦身** | `useAiChat.ts` **564**/1100；`sendTurnStreamPhase` / `confirmExecution` 等须控制继续膨胀（见 **§〇 P1**、**§2.1**） | 卫星模块 `useAiChat.*` 持续承接；近顶前预拆；定向 Vitest |
| **G3 Bundle** | `language-mapping-runtime` 已降至约 **342KB**；懒加载 / registry chunk 仍可选（**§〇 P2**） | **Wave 6** 与体积门禁：按需加载实验；与 Knip / 分包策略对齐 |
| **文档链接** | `npm run report:docs-link-debt` 在 `--all-links` 下 **0 broken**（2026-05-08 批量归一化后）；个别历史计划内链可能仍指向已迁文件 | 新增 archive 链接时继续用 **仓库相对** `src/…`、`../../…`；大搬迁后跑 `report:docs-link-debt` |
| **i18n 硬编码** | 台账：[i18n-hardcoded-remediation-ledger-2026-05-08.md](../execution/governance/i18n-hardcoded-remediation-ledger-2026-05-08.md)；阈值：`scripts/i18n-hardcoded-thresholds.json`（`src/ai/` **maxDelta**） | 按 ledger 优先级迁字典；收紧阈值前跑 `check:i18n-hardcoded:write-baseline` |

### 11.2 发版 / 大改动验收命令

与 **§九** 检查清单互补；发版或大范围改动时建议至少执行：

- `npm run typecheck`
- `npm run check:architecture-guard`
- `npx madge --circular --extensions ts,tsx src`
- `npm test`（Node 与 **`.nvmrc`** 一致，当前 **22**）
- `npm run report:docs-link-debt`（可选：CI `docs-governance` job 已跑）

### 11.3 与权威文书的关系

- 台账：[未落地项汇总-2026-04-24.md](../execution/governance/未落地项汇总-2026-04-24.md)
- AI 主规划：[AI智能体-战略规划与下一步-2026-05-07.md](../execution/plans/AI智能体-战略规划与下一步-2026-05-07.md)
- 审查基线：[CODE_REVIEW_REPORT_2026-05-07.md](../execution/audits/CODE_REVIEW_REPORT_2026-05-07.md)

---

## 十二、归档

- 初版七波次方案：`docs/architecture/_archive/code-governance-plan-2026-05-06-v1.md`
