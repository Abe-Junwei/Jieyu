---
title: 解语四页工作区 · 功能对账账本
doc_type: execution-plan
status: proposed
owner: repo
last_reviewed: 2026-10-31
source_of_truth: execution-plan
depends_on:
  - ./解语-主路线图-master-roadmap-2026-06-01.md
  - ./desktop-project-sqlite-2026-10-25.md
  - ./jieyu-4ws-impl-checklist-2026-10-31.md
---

# 解语四页工作区 · 功能对账账本

> **落盘**：`docs/execution/plans/jieyu-4ws-ledger-2026-10-31.md`（`status: proposed`）  
> **配套实施清单**：[jieyu-4ws-impl-checklist-2026-10-31.md](./jieyu-4ws-impl-checklist-2026-10-31.md)  
> **状态**：对账 + **Grill 拍板（2026-10-31）**；路线图标为待审后开工，**未改产品代码 · 未改 Figma**  
> **单库衔接**：[desktop-project-sqlite-2026-10-25.md](./desktop-project-sqlite-2026-10-25.md) 当前剩余队列

---

## Grill 拍板（2026-10-31）

Abe 确认按下列 **12 条**收口（含「需要改进」约束）。此前口头倾向不得一律标成已拍板；本表为权威口径。

### 三处守则（贯穿验收与实现）

1. **接替的验收单位是用户流程，不是页面或组件。** 例：「词条关联」须覆盖标注发起 → 库保存 → 词典用例更新 → 语料检索 → 重开读回。波形显示、Query 接线、单测通过只证明各自一段。
2. **A+B 消除重复职责。** 写入走现有具名业务入口；提交成功后发领域变化通知；由**统一位置**映射为查询失效。禁止「按钮手动重拉 + 页面监听重拉 + Query 再重拉」并存；禁止用库返回的新值覆盖用户尚未提交的输入。
3. **账本把「复用 / 修错 / 延期 / 删除 / 新增」分开。** 工作集与 Legacy 尤其如此：已有能力延期接替须写清后续去向与延期期间可达性；删除须单独决定，不得在页面重设计时顺手消失。

### 十二条决定

| # | 决定 | 约束 / 改进点 |
|---|---|---|
| 1 | **转写复用现有波形、时间轴和编辑能力，接单库；使用独立转写工作区。现有工程读页保留项目管理职责，表单转写界面作为过渡。** | 分开的是页面职责；播放、选区、编辑等已有能力应复用，避免再造第二套。 |
| 2 | **标注复用现有 IGT 和键盘交互，接单库。** | 接替范围还须逐项核对播放、分词与重分词、词条关联、候选接受等。复用 IGT 外观不等于标注功能迁完。 |
| 3 | **词典接替现有完整编辑能力，包括义项、引用、附件等；逐项验收。** | 「完整」以功能账本为边界，区分已有能力迁移和新增需求。原有字段保存不丢失，也不等于已有编辑入口。 |
| 4 | **语料先迁现有查询、筛选、分页和定位；工作集等单独排后续切片。** | 工作集旧实现若已存在，应记为「**延期接替**」，不能统称「后续再开发」。延期期间保留可用入口和数据访问。 |
| 5 | **Legacy 按功能逐项接替、逐项退出。** | 保留代码不代表旧入口仍可安全使用。必须说明它访问哪份数据；不能让用户误以为旧页和单库页显示的是同一份实时数据。 |
| 6 | **「改正文后待复核」与四页 UI 并行推进。** | 它涉及正文修改后分析结果的有效性，是数据语义。转写正文编辑切片必须接上相应状态；分析只读页也要能显示失效或待复核。 |
| 7 | **总体顺序为转写→标注→词典→语料，允许按依赖提前处理共享能力；最小分析只读页单列切片。** | 最小分析页用于查看现有分析、来源和复核状态，不借机扩成完整分析编辑器。顺序也不应阻塞必要的跨页验证。 |
| 8 | **Figma 工程稿约束视觉和交互规范；每页先核对功能与关键流程，再定布局和关键状态，最后出精稿并切片实现。** | 精稿前先解决区域分工、主要操作、键盘流程和失败处理。可基于旧版，但不照搬旧版的信息组织和缺陷。 |
| 9 | **库结构确有必要可以改，必须作为显式迁移决策。** | 这会解除此前 `user_version 27` 的冻结约束。每次变更都需说明必要性、数据迁移、兼容性和验证；界面重排本身不构成改库理由。 |
| 10 | **采用领域变化通知 A + TanStack Query B，分别负责变化传播和已保存数据的读取管理。** | 不让四页各自维护「事件→哪些查询失效」的映射。查询必须按项目/会话隔离；切库后旧请求不能污染新项目。输入草稿、播放位置、选区和撤销不放进查询缓存。 |
| 11 | **以转写的一条真实读写链路建立最小事件与 Query 接线，然后接波形和时间轴，随切片扩展。** | 不先做全库基建或全量搬迁。首次切片要验证：保存后刷新、失败不广播、切库隔离，以及旧异步结果不会覆盖新状态。 |
| 12 | **切页、切文稿时，合法且可提交的编辑自动保存；保存失败时保留草稿，阻止静默离开，并提供重试或明确放弃。** | 「自动保存」不能意味着强行提交半成品、结束输入法组合输入，或保存失败后照常切走。需要把临时草稿与已提交业务数据区分开。 |

### 第一刀（实施清单切片 0）

**选定转写的一条现有编辑流程**，完成：单库读取 → 保存 → 事件通知 → Query 刷新 → 切换失败保护 → 重开读回。随后波形、时间轴及其他页沿用该链路扩展。

### 处理决定标签约定（本轮）

| 标签 | 含义 |
|---|---|
| **复用接入** | 接成熟 UI/交互到单库与 A+B，不重造 |
| **修错** | 合同或行为缺陷修复（含改正文待复核语义） |
| **延期接替** | 旧能力仍在，本轮不迁完；保留入口/数据访问，写清后续切片 |
| **删除** | 须单独拍板；本草稿无新增删除项 |
| **新增** | 功能账本外的新需求；本轮最小分析只读页属「新增（只读、最小）」 |
| **过渡保留** | 表单读页等过渡壳，职责收窄后保留至独立工作区可替代 |
| **显式迁移（必要时）** | 仅当产品必要且写明迁移/兼容/验证时改库 |

---

## 0. 方法、范围与诚实边界

### 方法

- **对账对象**：用户可完成的工作（入口 → 操作与状态 → 业务 → 保存 → 跨页更新 → 关闭重开读回），不是「组件存在」或「SQLite 方法存在」。**验收单位 = 用户流程**（Grill 守则 1）。
- **旧实现**：非 Electron 桌面表面下的 Legacy 路由（`DesktopRoute` → `legacy`），主要是 Dexie / 现有工作台（`TranscriptionPage.Orchestrator`、`AnnotationWorkspace`、`LexiconPage`、`CorpusLibraryWorkspace`）。
- **桌面实现**：Electron 下 `DesktopRoute` → `desktop`，单库 `project.sqlite` + `desktopCall`（`src/db/desktop/desktopCall.ts`）。
- **证据来源**：BaideMac 源码与测试、用户指南（`user-guide/src/{recording,annotation,lexicon,corpus}.md`）、ADR 0085/0088、Figma 工程稿只读元数据。
- **处理决定列**：已按 **Grill 拍板（2026-10-31）** 填写；具体可复用组件路径、旧入口可达性、是否必须改库，仍须在切片开工前用**代码证据**再确认（本轮 Grill **未**重新全量扫仓）。

### 范围

| 纳入 | 排除（本轮） |
| --- | --- |
| 转写、标注、词典、语料库 + 跨页联动 + **最小分析只读页** | 模型下载、持久管理、转码、随包分发；完整分析编辑器 |
| 四页入口、选中、编辑、保存、重开；领域事件 + TanStack Query | 以「全面重设计」为由重写全栈 |
| 成熟 UI 文件与桌面简化页对照；每页功能规划→精稿→切片 | 照搬旧版信息组织缺陷；无迁移说明的改库 |
| **确有必要时**的显式 schema 迁移决策 | 界面重排本身作为改库理由 |

### 本草稿 **未** 在运行中的 Electron 里手操验收

下列结论来自 **代码与文档阅读**，不是真机点选：

1. 未在本机启动 Electron 做「改边界 → 撤销 → 重开」完整手测。
2. 未打开真实用户项目库核对数据读写回（单库后端能力以 `desktopCall` METHODS + 单元测试为证据）。
3. Legacy 转写/标注交互（波形拖拽、IGT 键盘机）以组件树与用户指南为准，未逐条复现。
4. Figma 仅 `get_metadata` 只读；**未**用设计稿当四页定稿，也未改稿。

### Legacy 数据说明（Grill #5）

| 表面 | 数据存储（证据基线） | 对用户须避免的误解 |
| --- | --- | --- |
| Legacy（非 Electron / `DesktopRoute`→`legacy`） | 主要为 Dexie / 既有工作台项目数据 | **不是**与 Electron 单库 `project.sqlite` 的同一份实时数据 |
| Desktop（Electron） | `project.sqlite` + `desktopCall` | 与 Legacy 页并开时，不得暗示「改一边另一边立即一致」 |

接替完成前保留 Legacy **代码与可达入口**；每接替一项功能，再决定是否退出对应旧入口。延期期间须在 UI/文案或文档标明数据源差异（切片内落实）。

---

## 1. 路由与表面分流（总览）

| 用户入口（侧栏文案） | 路由 | Legacy（非桌面） | Desktop（Electron） |
| --- | --- | --- | --- |
| 首页 | `/` | `HomePage` | → `/desktop-project` |
| 打开文件夹 / 工程 | `/desktop-project` | → `/` | `DesktopProjectReadPage`（folder） |
| 转写 | `/transcription` | `TranscriptionPage` → Orchestrator / ReadyWorkspace | **同页落到** `DesktopProjectReadPage`（无独立转写壳）→ **拍板：拆出独立转写工作区**；工程读页保留项目管理 |
| 标注 | `/annotation` | `AnnotationWorkspace`（`annotationPageEnabled`） | `DesktopAnnotationPage` → **拍板：复用 IGT+键盘接单库** |
| 词典 | `/lexicon` | `LexiconPage`（`CatalogProjectGate`） | `DesktopLexiconPage` → **拍板：完整编辑接替** |
| 语料库 | `/corpus` | `CorpusLibraryWorkspace`（`corpusLibraryPageEnabled`） | `DesktopCorpusPage` → 仅查询面板 → **拍板：先迁 query/筛选/分页/定位；工作集延期接替** |
| （旧写作） | `/writing` | → `/corpus` | → `/corpus` |

证据：`src/App.tsx` ~L899–986；`src/components/DesktopRoute.tsx`；`src/pages/TranscriptionPage.tsx`（desktop 时 Navigate 到 `/desktop-project`）。

**结构性结论（拍板后）**：桌面「转写」与「工程读页」**当前仍合流**；目标态为**独立转写工作区** + 工程读页专管项目管理；表单式读页为过渡。语料独立 `/corpus` 与工程读页内嵌查询需在切片中理顺入口，避免双源暗示。

---

## 2. 成熟 UI / 桌面简化页 · 组件对照（供后续映射）

| 区域 | 成熟实现（文件） | 桌面现状 | 备注 |
| --- | --- | --- | --- |
| 波形 / 选区 / 区域操作 | `src/components/transcription/WaveformRegionActionLayer.tsx`、`WaveformToolbar.tsx`、`Waveform*.tsx` | **无**；仅 `<audio controls>` | 后端已有 `units.updateBoundary/split/merge`；**复用接入**（切片 1+，在切片 0 链路之后） |
| 时间轴 / 多轨 | `TranscriptionTimelineVerticalView.tsx`、`TimelineDraftEditorSurface.tsx`、`TimelineLaneDraftEditorCell.tsx` | **无**；语段为按钮列表 | ReadyWorkspace 宿主：`TranscriptionPage.ReadyWorkspace*.tsx` |
| 转写编排 | `TranscriptionPage.Orchestrator.tsx`、`DataShell`、大量 `useTranscription*` | `useDesktopProjectReadController` + `DesktopProjectReadView` | 桌面为表单式 API 接线页（**过渡保留**） |
| IGT / 键盘 | `annotation/AnnotationIgtRow.tsx`、`annotationKeyboardMachine.ts`、`useAnnotationWorkspaceController.ts` | 词列表 + input/blur 写 gloss/POS | **复用接入**；外观≠功能迁完 |
| 词典义项表单 | `lexicon/LexiconEntryEditForm.tsx`、`LexiconSenseList.tsx`、`useLexiconEntryEditController.ts` | 仅 headword + translation 两框 | **复用接入**完整编辑（账本边界内） |
| 词典附件 | `LexiconAttachmentSection.tsx`、`useLexiconAttachmentController.ts` | **无 UI**（后端有 `attachments.*`） | 纳入完整编辑逐项验收；默认关策略以指南/账本为准 |
| 语料工作集 | `CorpusLibraryWorkspace.tsx`、`corpusBasketSession.ts`、`corpusWorksetExport*` | **无** basket；有 `corpus.query` 定位 | **延期接替**；延期期保留 Legacy 可用入口与数据访问 |

Figma（只读）约束后续设计规范，**不是**四页定稿：

- 文件 `BO15MX0jm25FJ1HOljNMzV`，顶页 `3:2`「解语设计规范」。
- 含：工作台骨架（52px 左轨、禁顶通栏）、时间轴交互状态板、IGT 输入状态板、间距与控件、组件映射与工程验收矩阵、色彩/字体 Token。
- 明文：**主画布波形+IGT 仍演进冻结**；「设计规定，不代表代码已实现」；工作台画面是草稿样态。
- **设计流程（#8）**：每页先核对功能与关键流程 → 布局与关键状态 → 精稿 → 切片实现；可基于旧版，不照搬缺陷。

---

## 3. 转写（含桌面工程读页）

**旧主路径**：`/transcription` → `TranscriptionPage.Orchestrator` → ReadyWorkspace + Timeline/Waveform。  
**桌面主路径（现状）**：`/transcription` 与 `/desktop-project` → `DesktopProjectReadPage` / `DesktopProjectReadView`。  
**目标态（#1）**：独立转写工作区接单库；工程读页保留项目管理；表单 UI 过渡。  
**单库已暴露**（UI 部分接线）：`units.updateText|undoText|split|merge|updateBoundary`、`manuscripts.setTimeMapping`、notes、exchange、speakers、customFields 等（`desktopCall.ts` METHODS）。  
**数据层（#10–#12）**：领域事件 + TanStack Query；切页/切文稿合法可提交则自动保存，失败留草稿并拦静默离开。

| 用户任务 | 旧实现实际情况 | 桌面实际情况 | 问题与证据 | 处理决定 | 验收方式 |
| --- | --- | --- | --- | --- | --- |
| 打开/新建工程并进入转写台 | **完整**：工具栏新建项目、首页进入转写（`user-guide/src/getting-started.md`、`recording.md`） | **部分**：`openFolder` 选项目夹；无「新建项目」同等向导 UI（读页按钮） | `DesktopProjectReadPage.tsx` L46–48；缺新建流程对照 | **复用接入**项目管理于工程读页；转写入口改独立工作区 | 打开夹 → 工程页管项目；转写页见文稿工作台；重开仍同夹会话 |
| 导入/更换媒体 | **完整**：导入媒体入口（指南 §2） | **部分**：交换面板 `DesktopExchangePanel` + `exchange.importFile`；非波形空态「导入媒体」 | `DesktopProjectReadPage` Exchange；`METHODS` exchange.* | **复用接入**（职责可留工程页或转写空态，切片定） | 导入后 units/media 可读；重开保留；事件后 Query 刷新 |
| 在波形上框选/选中一段 | **完整**：波形选区 + 播放头（Waveform*、指南设置「跟随选区」） | **缺失**：无波形；点语段按钮选中 | `DesktopProjectReadView` 单位列表；无 Waveform 引用 | **复用接入**成熟波形（切片 0 链路后再接） | 选中后属性区/播放跳到段起点；选区不进 Query 缓存 |
| 拖拽改语段边界并预览 | **完整**：手动改边界（指南 §3.2）；时间轴手柄类交互 | **部分**：数字输入 `boundary` + `onMoveBoundary`→`units.updateBoundary`；无拖拽预览 | `DesktopProjectReadView` boundary 输入；controller `moveBoundary` | **复用接入** | 改界 → 列表时间变 → 事件失效 → 重开一致；非法界拒绝；失败不广播 |
| 在时间点切分语段 | **完整**：手动建段/切分 + AI/工具 | **部分**：`split` 数字框 + `units.split`；无波形点击切分 | ReadView splitRef；`units.split` | **复用接入** | 切分后两段可播、可重开 |
| 合并相邻语段 | **完整**：merge 前后段 | **部分**：仅「与下一段 end==start 对齐」可 mergeNext | ReadView `next` 条件；`units.merge` | **复用接入** | 合并后正文/时间正确；undo 若保留需测 `units.undo` |
| 编辑转写正文并保存 | **完整**：时间轴单元格/草稿编辑器 | **部分**：单行 input + 保存按钮；`units.updateText` | ReadView textRef；`saveText` | **复用接入** + **第一刀真实读写链路**；切走自动保存（#12）；并行接线待复核状态（#6） | 保存 → Query 刷新 → 列表文案变 → 重开；失败留草稿拦离开；IME 组合中不强提 |
| 撤销最近正文修改 | **完整**：全局 Mod+Z 等（`settings.md`） | **部分**：`undoText`→`units.undoText`；无通用撤销栈 UI | controller `undoText`；METHODS `units.undoText` | **复用接入**；撤销栈**不**进 Query 缓存 | 改字→撤销→重开为撤销后状态 |
| VAD/一键自动分段 | **完整**（指南 §3.1） | **缺失** UI（modelRuns.* 在 METHODS，本轮排除模型产品化） | METHODS modelRuns.*；读页无入口 | **延期接替**（本轮范围外；非「删除」） | — |
| 多轨/翻译层编辑 | **完整**：层与翻译轨 | **缺失** | ReadyWorkspace vs 读页单层 units 列表 | **延期接替**（非本轮最小切片必达；有旧能力则保留 Legacy 可达） | — |
| 翻译层麦克风口译 | **完整**（指南 §5） | **缺失** | — | **延期接替** | — |
| 播放：空格、循环选区、变速 | **完整**（指南 §6、设置播放） | **部分**：原生 audio controls；无工作台快捷键壳 | ReadView `<audio controls>` | **复用接入**；播放头不进 Query 缓存 | 选中段后 currentTime 跳到段起点（已有 focusUnit） |
| 时间映射（文献轴↔播放器） | **完整**（ADR-0009 / 0088§12） | **部分**：offset/scale 输入 + `saveMapping` | ReadView mapping；`manuscripts.setTimeMapping` | **复用接入** | 改映射不改文献秒；播放位置换算正确 |
| 语段备注（含 timeline/waveform 视图备注） | **完整**（侧栏备注等） | **部分**：普通 note + tier note 按钮 | `saveUnitNote` / `saveTierNote` | **复用接入** | 重开读回 notes.list |
| 发音人目录与指派 | **完整**（侧栏说话人） | **部分**：`DesktopSpeakerCatalogPanel` | 同页嵌套；可归工程页 | **复用接入**（工程读页职责优先） | 指派后重开 |
| 自定义字段 | **完整**（项目字段） | **部分**：`ProjectCustomFieldManager` | 读页底部 | **复用接入**（工程读页） | set/get 重开 |
| 删除文稿（预览/恢复/提醒） | **部分～完整**（桌面删除规格） | **部分**：删除对话框接线 | `DesktopManuscriptDeleteDialog` 等 | **复用接入**（工程读页） | 预览→删→listDeleted |
| 导出/导入交换包 | **完整**（export 指南） | **部分**：Exchange 面板 jyt/jym/manuscript | `exchange.*` | **复用接入**（工程读页优先） | 导出再导入不丢正文 |
| 从语料定位焦点语段 | **完整**：深链回转写 | **部分**：query `manuscriptId&layerId&unitId` → focusUnitId | `desktopCorpusLocate.ts`；ReadPage locate | **复用接入**；目标改为独立转写工作区深链（切片定） | `/corpus` 点选 → 转写页高亮段 |
| 关闭应用重开读回工程 | **完整**（Dexie 项目） | **部分～完整**：会话 + 单库；依赖 folder session | `openProjectSession`；`reopen` method | **复用接入** + 切库 Query 隔离（#10） | 杀进程再开同夹数据在；切夹后旧缓存不污染 |

**转写小结**：后端单元操作面已明显宽于桌面 UI；拍板路径为 **独立转写壳 + 复用波形/时间轴/编辑 + A+B**；表单读页过渡。第一刀先钉一条真实读写链路，再接波形/时间轴。

---

## 4. 标注

**旧**：`AnnotationWorkspace` + IGT 组件族 + 多 controller（gloss、词素、播放、校验、AutoGloss…）。  
**桌面**：`DesktopAnnotationPage` + `useDesktopAnnotationWords` + `useDesktopAnnotationLexemeLinks` + 分类备注。  
**拍板（#2）**：复用 IGT + 键盘接单库；须**逐项**核对播放、分词/重分词、词条关联、候选接受等。

| 用户任务 | 旧实现实际情况 | 桌面实际情况 | 问题与证据 | 处理决定 | 验收方式 |
| --- | --- | --- | --- | --- | --- |
| 进入标注并选中句段 | **完整**（指南 §1；深链 unit） | **部分**：文稿按钮 + 语段按钮列表 | `DesktopAnnotationPage` manuscripts/units | **复用接入** | 选中后显示正文与词列表；Query 按会话隔离 |
| 将句切成词（tokenize） | **完整**：切词交互 | **部分**：`segmentWords` 一键；已有词则禁用 | `useDesktopAnnotationWords.segment`；`analysis.segmentWords` | **复用接入**（含重分词核对） | 空图→切词→列表出现 form；重开仍在；跨页 Query 失效 |
| 填写词级 gloss | **完整**：IGT 格 + 草稿保存机 | **部分**：blur 写 `node.setMapValue` gloss | words.setGloss → applyAnalysis | **复用接入**；草稿≠已提交（#12） | 提交后重开 gloss 在；未提交不被 Query 覆盖 |
| 填写/清除 POS | **完整**：POS 菜单等 | **部分**：文本框 blur；空则 removeField | setPos | **复用接入** | 重开 POS |
| 编辑词素行 gloss | **完整**：Morph 行（指南 §4） | **部分**：`segmentMorphemes`（form 含 -/=）+ blur gloss | morphemeSeed；无完整形态编辑器 | **复用接入**（对照旧 Morph 能力逐项） | 切词素→填 gloss→重开 |
| IGT 键盘移动与保存顺序 | **完整**：`annotationKeyboardMachine` | **缺失** | 无键盘机接线 | **复用接入**键盘机+换存储 | Tab/方向键走格；未保存/失败按 #12 |
| Leipzig 对齐展示 | **完整**：`AnnotationIgtRow*` | **缺失**：纵向 li 列表 | 无 IgtRow | **复用接入** IGT 视图（外观≠迁完） | 视觉对齐验收（真机） |
| 链接已有词典义项 | **完整**：链到 sense | **部分**：match/list/choose/replace/clear | `useDesktopAnnotationLexemeLinks`；`lexicon.*Link*` | **复用接入**；**验收=全流程**（标注→库→词典→语料→重开） | 链接后词典侧可见引用；语料可检索；重开 |
| 从标注创建并链接新词条 | **完整** | **部分**：beginCreate headword+translation | links.create → createLinkedEntry | **复用接入** | 新词在 `/lexicon` 可搜到 |
| 解除词义链接 | **完整** | **部分**：clear 按钮 | clearTokenLink | **复用接入** | 重开无链接 |
| 句段分类备注 CRUD | **完整**：备注/确信度等 | **部分**：7 类 category + textarea；无 selfCertainty UI | saveCategorizedUnitNote；页头注释旧页「不改转写时间码」 | **复用接入**（逐项对照旧备注能力） | 增改删重开 |
| 句段播放随选中 | **完整**：`useAnnotationSegmentPlaybackController` | **缺失**（标注页无 audio） | 无播放器 | **复用接入**（#2 必核项） | 选中即播该段；播放头不进 Query |
| AutoGloss 预览采纳 | **部分～完整**（B4；flag） | **缺失** | 旧 `useAnnotationAutoGlossController` | **延期接替**（候选接受若属旧主路径则在标注切片逐项核；否则延期并保留 Legacy 入口） | — |
| 结构校验面板 | **部分**（validator controller） | **缺失** | — | **延期接替** | — |
| 导出当前句 | **部分**（指南 §8） | **缺失** | — | **延期接替** | — |
| 改转写正文后分析失效/待复核 | **有缺陷/未齐**：ADR-0088/0089 合同，规格写明代码未齐 | **有缺陷**：桌面可改正文（读页）与改分析（标注页）并存；失效语义需真机核对 | ADR-0088§4；domain-landings requirements R2–R4 | **修错**（与四页 UI **并行**，#6）；转写正文切片必须接线；分析只读页显示失效/待复核 | 改正文→旧分析非当前；重开一致；分析只读页可见状态 |

**标注小结**：桌面已能「列表式」完成切词、gloss、POS、词素种子、链词典、备注——**交互远低于 IGT**；拍板为复用 IGT+键盘并逐项核播放/分词/关联/候选。跨页词条关联以**用户流程**验收。

---

## 5. 词典

**旧**：`LexiconPage` / `LexiconWorkspace` — 搜索、多字段、义项树、引用、附件、LIFT/DMLex。  
**桌面**：`DesktopLexiconPage` — 列表 + headword/translation。  
**拍板（#3）**：接替现有完整编辑（义项/引用/附件等），以功能账本为「完整」边界；区分**迁移**与**新增**。

| 用户任务 | 旧实现实际情况 | 桌面实际情况 | 问题与证据 | 处理决定 | 验收方式 |
| --- | --- | --- | --- | --- | --- |
| 打开词典并确认项目 | **完整** | **部分**：无会话则 Link 去 `/desktop-project` | `DesktopLexiconPage` L20–22 | **复用接入** | 有会话才列出词；切库隔离 |
| 搜索/浏览词条 | **完整** | **部分**：前端 filter `filterDesktopLexemes`；数据来自 `listLinkCandidates` | 非完整词库浏览语义？ | **复用接入**（对照旧浏览/搜索能力迁移） | 输入过滤列表；与标注创建联动可测 |
| 新建词条（最少 headword+译文） | **完整** | **部分**：两字段 saveLexemeEntry | controller beginCreate/save | **复用接入**（完整表单边界内字段） | 保存→列表出现→重开；事件→Query |
| 编辑已有词条基础式 | **完整** | **部分**：仅 headword/translation 草稿写回 entry JSON | `applyDesktopLexemeDraft` | **复用接入** | 改后重开；草稿不被 Query 覆盖 |
| 多义项 / 子义项编辑 | **完整**：`LexiconSenseList`、add/remove/move | **缺失** UI（存储仍 DMLex JSON） | 旧 `useLexiconEntryEditController`；桌面无 senses 编辑器 | **复用接入**义项表单+换接口（迁移，非新增） | 两义项重开皆在 |
| 从转写/标注命中回链跳转 | **完整**（指南 §5） | **缺失** 明确回链 UI | 旧页有 occurrence citation | **复用接入**（引用/回链属完整编辑边界） | 从词条到语段 |
| 查看词条被哪些语段引用 | **部分～完整**：citations | **缺失** | `LexiconSenseCitations` | **复用接入** | 引用列表与标注链接一致（流程验收） |
| 词条附件上传/预览/删除 | **部分**（指南：默认关） | **缺失** UI；METHODS 有 attachments.* | 附件协议 R5 未收口 | **复用接入**（#3 含附件；默认关策略按指南；非账本外新增） | 开旗后上传/预览/删→重开 |
| 导入 LIFT / 导出 DMLex | **完整**（指南 §6–7） | **缺失**（项目级 exchange 不等于词表 LIFT） | — | **延期接替**（若账本未列本轮必达；保留 Legacy 入口） | — |
| 删除词条（仍有链接则拒绝） | **完整**（ADR-0088§9） | **缺失** UI | deleteLexiconEntry 旧路径 | **复用接入** | 有链接删除失败；无链接可删→重开 |

**词典小结**：桌面最小可写闭环已通；拍板迁**完整编辑**（账本边界）。「两框保存」不得被误认为完整词典。字段不丢 ≠ 编辑入口已齐。

---

## 6. 语料库

**旧**：当前文稿语段索引 + 会话工作集（basket）+ 复制/打包；**不写**转写；深链回转写。  
**桌面**：项目级 `corpus.query`（text/form/gloss/pos/lexeme+sense）+ 定位到工程读页。  
**拍板（#4）**：先迁查询/筛选/分页/定位；工作集 = **延期接替**（保留可用入口与数据访问）。

| 用户任务 | 旧实现实际情况 | 桌面实际情况 | 问题与证据 | 处理决定 | 验收方式 |
| --- | --- | --- | --- | --- | --- |
| 进入语料并确认范围（当前文稿） | **完整**：scope=textId | **部分**：整项目会话查询；无「当前文稿」工作集壳 | `useCorpusLibraryController` vs `DesktopCorpusPage` | **复用接入**查询范围文案；工作集壳见延期行 | 明确范围文案；不暗示与 Legacy 同库实时 |
| 按文本筛选句段 | **完整**：filterText | **部分**：query text 字段 | DesktopCorpusQueryPanel | **复用接入** | 结果高亮 textSpans |
| 按 form/gloss/POS/义项检索 | **缺失或弱**（旧以正文筛选为主） | **部分～完整**：多条件 + sense 成对校验 | `useDesktopCorpusQuery` draftFilters；pair error | **复用接入**（桌面已有增强保留） | 成对校验失败有提示；命中 hits；改 gloss 后失效刷新 |
| 建立临时工作集（多选） | **完整**：basket session | **缺失** | `corpusBasketSession.ts` 仅旧页 | **延期接替**；延期期保留 Legacy 工作集入口与数据访问 | 多选计数；刷新不丢（会话）— 延期切片验收 |
| 复制工作集（纯文本/MD/HTML） | **完整** | **缺失** | corpusWorksetClipboard | **延期接替**（随工作集） | 剪贴板内容 |
| 下载工作集打包 | **完整** | **缺失** | corpusWorksetBundle | **延期接替**（随工作集） | 文件可打开 |
| 从结果回到原文定位 | **完整**：transcriptionHref 深链 | **部分**：navigate `desktopCorpusLocateHref` → 读页 focus | `desktopCorpusLocate.ts`；**不**进标注页 | **复用接入**；定位目标对齐独立转写工作区 | 定位后选中正确 unit |
| 分页加载更多 | **N/A/列表全量** | **部分**：limit 20 + more | PAGE=20 | **复用接入** | more 不丢过滤条件（#406 已测） |
| 确认语料页不写回转写 | **完整**（页头注释） | **完整**（只 query） | 两侧只读出站 | **复用接入**（保留只读合同） | 查询后正文未变 |

**语料小结**：旧「工作集摘句」与桌面「单库检索定位」是两种形态；本轮先迁检索定位；工作集**延期接替**而非含糊「以后再开发」。

---

## 7. 跨页联动

共享对象：项目 / 文稿(manuscript) / 层(layer) / 语段(unit) / 词·词素投影 / 词条·义项 / 查询定位。  
**拍板（#10）**：领域事件 A + TanStack Query B；统一 event→invalidate；按项目/会话隔离。

| 用户任务 | 旧实现实际情况 | 桌面实际情况 | 问题与证据 | 处理决定 | 验收方式 |
| --- | --- | --- | --- | --- | --- |
| 侧栏在四页间切换且保持工程 | **完整**：同一 Dexie 项目 | **部分**：依赖 `openProjectSession`；过期回文件夹页 | `DesktopSessionGate` | **复用接入** + Query 会话隔离；切页自动保存（#12） | 开夹→四页来回→数据同库；失败不静默丢稿 |
| 转写 ↔ 标注：同一 unit 上下文 | **完整**：深链 unit/layer | **部分**：两页各自选 unit；无统一 return deep link | 旧 `transcriptionUrlDeepLink` / workspaceReturn；桌面弱 | **复用接入**深链/上下文；事件驱动失效 | 标注改 gloss 后回转写见投影策略（合同） |
| 标注 → 词典：创建/跳转词条 | **完整** | **部分**：可创建；无「打开该词条」导航 | createLinkedEntry；Lexicon 另页自选 | **复用接入** | 创建后 `/lexicon` 选中同 id（流程验收） |
| 词典 → 语段：引用定位 | **部分～完整** | **缺失** | — | **复用接入**（完整词典边界内） | 从引用到语段 |
| 语料 → 转写/工程读页定位 | **完整** | **部分**：只到 `/desktop-project?...` | 不进 `/annotation` | **复用接入**→独立转写工作区 | 三参数缺一不定位（注释已写） |
| 语料 → 标注定位 | **部分**（分析深链族） | **缺失** | — | **复用接入**（跨页验证不因顺序阻塞，#7） | 定位到正确 unit |
| 查询命中词形/gloss 与标注投影一致 | 旧索引 vs 标注写路径 | **部分**：corpus.query 读投影+链接（ADR-0088§18） | 需真机对照 | **复用接入** + A+B 统一失效 | 改 gloss→事件→Query→命中更新 |
| 左轨 IA 符合设计规范 | 现 App 导航文案齐全 | 桌面简化页 **未**按 52px 轨/禁止顶栏做视觉壳 | Figma SPEC-01；现 CSS `desktop-project-read` | **复用接入**规范（#8）；每页规划→精稿→切片 | 视觉+路由；不照搬旧缺陷 |
| 改正文后分析状态跨页可见 | 合同未齐 | 桌面可改正文与改分析并存 | ADR-0088/0089 | **修错**并行 + 最小分析只读页（#6/#7） | 只读页显示失效/待复核；转写切片已接线 |

---

## 8. 最小分析只读页（本轮新增切片）

| 用户任务 | 旧实现实际情况 | 桌面实际情况 | 问题与证据 | 处理决定 | 验收方式 |
| --- | --- | --- | --- | --- | --- |
| 查看现有分析、来源与复核状态 | 分散在标注/合同文档 | **缺失**独立只读页 | ADR-0088 待复核语义 | **新增**（只读、最小；**非**完整分析编辑器） | 能看见分析内容/来源/有效或待复核；改正文后状态更新；重开一致 |

---

## 9. 统计（本草稿任务行）

| 分区 | 任务行数（约） |
| --- | --- |
| 转写 | 18 |
| 标注 | 15 |
| 词典 | 10 |
| 语料库 | 9 |
| 跨页联动 | 9 |
| 最小分析只读 | 1 |
| **合计** | **62** |

状态标签在表中已用「完整 / 部分 / 缺失 / 有缺陷」描述旧实现与桌面列；处理决定已按 Grill 标签填写。

---

## 10. Top 缺口（拍板后仍须切片消化）

1. **转写无波形/时间轴壳**：边界/选区/拖拽仅有数字表单；成熟组件未接到单库 → **复用接入**（切片 0 后）。  
2. **`/transcription` 桌面合流到工程读页** → **拆独立转写工作区**；工程页留项目管理。  
3. **标注无 IGT/键盘/播放** → **复用接入**并逐项核功能。  
4. **词典桌面只有双字段** → **完整编辑迁移**（账本边界）。  
5. **语料工作集未迁** → **延期接替** + 保留 Legacy 入口；本轮先迁检索定位。  
6. **改正文待复核未齐** → **修错并行**；分析只读页展示状态。  
7. **跨页刷新无统一 A+B** → 切片 0 建立最小事件+Query 链路。

---

## 11. 原开放问题 → 拍板收口

| # | 原问题 | 收口（2026-10-31） |
|---|---|---|
| 1 | 转写独立工作区 vs 工程读页主壳？ | **独立转写工作区**；工程读页管项目；表单过渡 |
| 2 | 波形+时间轴复用还是重设计？ | **复用**现有能力接单库；Figma 管规范；每页规划→精稿→切片，不照搬缺陷 |
| 3 | 语料工作集 vs 检索？ | **先迁检索/筛选/分页/定位**；工作集 **延期接替** |
| 4 | 标注是否必须首发 IGT？ | **是（复用 IGT+键盘）**；外观≠功能迁完，须逐项核 |
| 5 | 改正文待复核是否阻塞 UI？ | **不阻塞**；与四页 UI **并行**；转写正文切片与分析只读页必须接线/展示 |
| 6 | Legacy 退出条件？ | **按功能逐项接替、逐项退出**；标明数据源；代码保留≠入口可安全混用 |

**库结构**：确有必要可改（#9），须显式迁移决策；解除「绝对冻结 user_version 27」的口头约束，但每次变更要必要性/迁移/兼容/验证。

---

## 12. 建议的下一刀

1. ~~Abe 审本账本 → 填「处理决定」~~ → **已于 2026-10-31 Grill 收口**。  
2. 按 `jieyu-4ws-impl-checklist.md` 执行：**切片 0** = 转写一条真实编辑流程 + 单库读写 + 事件 + Query + 切换失败保护 + 重开。  
3. 并行：改正文待复核合同修错；转写页功能规划→精稿（可与切片 0 基建并行）。  
4. 其后按转写波形/时间轴 → 标注 → 词典 → 语料 → 最小分析只读；共享能力可提前；跨页验证不阻塞。

---

*更新：Grok Bot 执行子代理 · 2026-10-31 Asia/Shanghai · 仅文档 · 未改产品代码 / 未推送 / 未改 Figma*
