---
title: desktop-4ws-slice1b-transcription-editing design
doc_type: execution-spec-design
status: active
owner: repo
last_reviewed: 2026-11-19
source_of_truth: desktop-4ws-slice1b-transcription-editing-spec
depends_on:
  - ./requirements.md
---

# Design — 转写切片 1b

## 1. 成熟方案扫描 / Research

- **仓库既有**：`useWaveSurfer`（wavesurfer.js 8 + regions 插件，无 Dexie 依赖）、受控 `WaveformToolbar`；`TranscriptionTimelineMediaTranscriptionLane`、`TimelineAnnotationItem` 不读编辑器上下文；`HorizontalMediaLanes`／`VerticalView` 绑 `TranscriptionEditorContext` 与旧写路径，不能直接挂桌面。单库 `updateBoundary`、`splitUnit`、`mergeUnits`／`undoMerge` 已有事务与回读。
- **现状与 E06 差额**（2026-11-17 读码）：时间存 `REAL` 秒且 `CHECK end_time >= start_time` 允许零长；层类型无点层；`updateBoundary` 只做共用边界联动、无撤销；`splitUnit` 两侧复制整段正文；`mergeUnits` 不查说话人、不允许空隙、丢弃被合并段正文、删除其下级子树、沿用旧 id。
- **同类产品**：[Praat TextGridEditor](https://praat.org/manual/TextGridEditor.html) 普通拖动只移一条边界，Shift 拖动移动各层同一时刻的边界；删边界即合并且正文拼接；拆分按文本光标分正文；点层独立。[ELAN](https://www.mpi.nl/tools/elan/docs/manual/Sec_Merging_annotations.html) 时间槽为整数毫秒；合并保留下级但会拉长下级时间。
- **采纳**：Praat 的「默认单边、显式联动」与正文拼接／按位置拆分，和 E06 一致；ELAN 的整数毫秒。
- **不采纳**：ELAN 推土机／平移模式（会挤动全文档，违反 E06「不挤邻段」）；ELAN 合并时拉长下级时间（违反 EF-018「不编造时间」）；把 `VerticalView` 整个挂进桌面（会回落 Dexie 写路径）。
- **坑**：媒体秒与文献毫秒的换算要集中一处，避免多处取整不一致；拖动预览不能写库；改旧组件 props 会波及 ReadyWorkspace。
- **决定：适配**。展示复用现有波形与时间轴组件，新写受控 controller；单库写操作按 E06 重写。不新增依赖。
- **本次创建／投影调研**：桌面已有的 `startCreate` 只覆盖空白起点、4px 手势阈值与单层 `units.create`，不能代替旧版套索的命中选择和层路由。旧版成熟路径是 `useLasso` → `createUnitFromSelectionRouted` → `resolveSegmentTimelineSourceLayer` / `resolveProjectionLayerIdsForNewUnit`；适配其命中、宿主选择、父段约束和正文投影语义，不挂载旧版 Dexie 写路径。WaveSurfer regions 插件只提供 waveform region 手势，不含文本轨道命中、宿主路由或正文投影，故不以插件替代领域路径；不增加依赖。
- **决定：适配旧版交互与路由**。空白起点拖过已存在语段进入选择；只有无命中拖动才创建。新建阈值为 50ms，仅影响新建拖选；既有边界拖动／键盘规则仍按 E06。相关实现锚点：`src/hooks/ui/useLasso.ts`、`src/pages/transcriptionSegmentCreationActions.ts`、`src/hooks/layer/useLayerSegments.ts`、`src/hooks/transcription/useTranscriptionUnitActions.helpers.ts`。

## 2. 架构选择

- 用户决定（2026-11-17）：点层进第一程且 v29 带表结构；1b-6 全部留第一程；旧库只有合成项目，直接拒绝、不做迁移工具；新建／删除单段复用现成实现；合并分隔偏好存 `project.settings_json`（不改表）；其余交互取值见 requirements §3。
- 用户决定（2026-11-18，[ADR-0122](../../../adr/0122-integer-milliseconds-and-optional-media.md)）：库和桌面接口都用整数毫秒并改名；录音时长保持秒；删掉逻辑时长和文稿映射，换录音用一次性整体调时；文稿可以不挂录音，句段按 `sort_order` 排，时间可空，允许部分对齐；点必须有时刻，解除关联时保留点和句段时间；一有一无的合并结果无时间；库只要求至少 1 毫秒，界面拖动和拆分用 10 毫秒下限。表结构在 1b-0，无录音界面为 1b-7。
- 用户决定（2026-11-19，[ADR-0127](../../../adr/0127-shared-waveform-region-controls-use-theme-paint.md)）：选区动作按钮和速度滑杆采用主题色实底。这两处类是共享的，旧转写页跟着改。波形选区、波峰、语段块和全稿概览不在这次里。
- 用户决定（2026-11-19 排期审查）：1b 新排期所需的全部表列在 1b-0（v29 新 ADR）一次建齐（`units` 补 `skip_processing`／`confidence`／`self_certainty`，`layers` 补 90 天软删三列／`modality`／轨高与字体展示列，新建 `layer_lane_locks` 子表，`unit_texts` 关联 `attachment_files(id)` 存口译短录音，`settings.ts` 放行合并分隔符键）；同层内仅同说话人（或均未标说话人）禁重叠，不同说话人允许重叠并分轨；口译 STT 本机 Whisper 优先、云端守 E11 授权且转出文本走候选待确认；VAD 自动分段只填空白区间（0 ms 不重叠）并整批同事务一步可撤；多层视图（#598）排在层结构（#597）之前，分轨（#600）用预置多说话人种子验收。

- 状态：选择、媒体、视口、草稿四块受控状态放 controller，Query 只放已保存数据（沿用 slice1 design §8）。
- 用户决定（2026-11-19）：恢复旧版多层正文投影，而非只创建当前显示层的简化实现。一个时间 unit 共享时间与说话人，`unit_texts.layer_id` 存各文本层正文；空正文按需创建，不为所有匹配层预写空行。正文草稿、正式保存、回执和撤销按 unit + layer 隔离。保留翻译层对多个宿主转写层的显式链接；`layers.parent_id` 仅表达结构父子，不能替代匹配链接。
- 用户决定（2026-11-19）：波形创建目标取活动文本层，没有明确活动层时默认转写层；关联层只按旧路由匹配。独立边界层仅在被选为目标时建段；时间细分要求新范围完全落在一个父段内并继承说话人。文本轨道拖选创建到指针所在说话人轨；同说话人不重叠、异说话人可重叠，沿用 E06，不复用旧版 20ms 邻段空隙。拖建最短 50ms；其余编辑仍按 10ms。
- **数据适配**：当前桌面格式为 v31，`units.layer_id` 是区间所属结构层，`unit_texts` 和 `unit_text_drafts` 目前均按 unit 单键；v32 增加 `unit_texts.layer_id`、显式 `layer_links` 及复合文本草稿／回执身份。按 ADR-0086 严格拒绝旧格式、不迁移；只在合成项目上验证。
- 动作：`onSelectUnit`、`onSeek`、`onRequestEdge`、`onRequestSharedBoundary`、`onRequestSplit`、`onRequestMerge`、层与分轨操作、口译录音与候选、点层增删改；展示组件不直接 `desktopCall`。
- 拒绝：在 `useDesktopProjectReadController` 上继续加；一个大 controller 承担全部编辑（会过 300 行，按职责拆分为媒体、选择、层与分轨、口译录音、边界拆合与自动分段）。

## 3. 落位清单

| 文件 | 职责 | 估计 |
| --- | --- | --- |
| `src/db/desktop/timeMs.ts` | 秒↔毫秒换算与取整（唯一入口） | < 80 |
| `src/db/desktop/schema.ts` | v29 既有毫秒列、点层、拆合映射、句段样态／确信度列、层软删与外观列、`layer_lane_locks`、口译附件关联；v32 增加 `unit_texts.layer_id`、显式多宿主 `layer_links`、layer-scoped text drafts / receipts | DDL |
| `src/db/desktop/layers.ts` | 层读路径携带链接关系；显式关系读写和同稿校验 | < 300 |
| `src/db/desktop/units.ts` | 按显示层解析宿主语段；正文按 layer 读写，空投影不预建 | < 300 |
| `src/db/desktop/textSave.ts` | 草稿、保存、回执、冲突与撤销按 `(unit_id, layer_id)` 隔离 | < 300 |
| `src/db/desktop/unitEdges.ts` | 单边、共用边界、同说话人防重叠校验、批量新建与撤销 | < 300 |
| `src/db/desktop/unitSpan.ts` | 拆分／合并按 E06 改写（文件已 1094 行，改写时拆出） | 降行数 |
| `src/db/desktop/points.ts` | 点层读写 | < 200 |
| `src/pages/useDesktopTranscriptionMediaController.ts` | 媒体、播放、视口 | < 220 / < 8 hooks |
| `src/pages/useDesktopTranscriptionSelectionController.ts` | 选择与定位请求 | < 150 |
| `src/pages/useDesktopTranscriptionLayerController.ts`（计划，后续切片） | 多层读取装配、层 CRUD／软删、层高与字体、分轨锁定 | < 280 / < 10 hooks |
| `src/pages/useDesktopTranscriptionOralController.ts`（计划，后续切片） | 口译短录音（附件 CAS）与 STT 候选采纳 | < 250 / < 10 hooks |
| `src/pages/useDesktopTranscriptionEditController.ts`（计划，后续切片） | 边界／行内草稿／拆合／点层／VAD 批量分段动作与回执 | < 300 / < 12 hooks |
| `src/pages/desktopTranscriptionCreateRouting.ts` | 纯层路由：目标层、旧版宿主选择、父段和说话人规则 | < 200 |
| `src/pages/useDesktopTranscriptionCreateController.ts` | 桌面 unit 创建、selection hit-test、一次性 receipt 与读回 | < 260 / < 10 hooks |
| `src/pages/DesktopTranscriptionLayers.tsx` | 多层只读装配与每层受控文本轨；页面仅装配 | < 240 |
| `src/db/desktop/projectRead.ts`、`projectExchange.ts`、`manuscriptPurge.ts` | 按层正文／链接的读回、交换与清理 | focused |

约束：守卫 `rules.desktop.mjs` 300 行；页面只装配；面板 CSS 最多两层边框。

## UI 精稿对照

| Pixso 画板 | 精稿事实 | 落地约束 |
| --- | --- | --- |
| `01 转写 · 样态 · 标准`（`19:6187`） | 波形与标尺共用水平时间轴；转写与翻译文本卡片纵向堆叠，卡片起止边界对齐；空翻译卡可编辑。 | 多层读取同一 unit 的时间区间，各自只显示本层正文；空文本是可编辑占位，不落空记录。 |
| `01 转写 · 样态 · 收起与连线`（`67:2846`） | 收起层仍以一行保留名称和段数；层连接关系作为显示状态，不改变时间轴数据。 | 折叠只影响展示；连接来源是显式 layer link，不能从 `parent_id` 推断翻译宿主。 |
| `01 转写 · 交互 · 多选`（`19:12433`） | 命中段的拖动表现为多选，选中摘要和批量菜单出现；已有段不能因从波形跨过而误建新段。 | 无命中空白拖动才创建；拖过既有卡片转入选择；保留现有多选入口，不以创建覆盖选择。 |
| `01 转写 · 交互 · 拖建预览`（`81:1`，说明 `81:481`） | 波形选中段为透明主题色底、无描边；同时间范围的波形与目标轨拖建预览使用蚂蚁线；转写与翻译只保留一张焦点卡。 | 按 [ADR-0133](../../../adr/0133-desktop-transcription-range-and-create-preview.md) 区分已有选区、焦点和未提交预览。当前 Electron 尚未实现选区波峰分段着色、文本轨发起拖建时同步显示波形预览。 |

波形拖选阈值与正文拖建按本次 ADR 为 50ms；截图只用于精稿对照，不提交运行态图像。

## 4. ADR

- 既有 1b-0 格式决定由 ADR-0126／0128／0129 管理；本次新增 ADR-0132 将 v31 升至 v32，新增 layer-scoped 正文、显式多宿主链接与 50ms 创建拖选规则。仅新格式合成项目；旧格式严格拒绝、不写迁移。

必须遵守的既有规范（开工清单第 0 步逐条写遵守方式；冲突回用户定）。队列 2–7 的归属在[工程索引 §7](../desktop-engineering-contract/design.md)，不在本文件重复：

| 条款 | 管哪片 | 约束 |
| --- | --- | --- |
| [ADR-0100](../../../adr/0100-desktop-engineering-contract.md) E01 | 全部含写操作的小片 | 自动保存节奏、失败重试、离开守卫；操作标识与回执同事务 |
| ADR-0100 E02 | 1b-2、#601 | 时间码框与行内正文半成品可存草稿；拖动非法才按 E06 回退 |
| ADR-0100 E03 | 1b-2～1b-4、1b-6 | 时间／说话人变化只使依赖项待复核 |
| ADR-0100 E04 | 1b-2～1b-6、#601、#604 | 撤销分组、各稿件独立、跨对象无后续修改才可撤；拆合形成完整分析版本；VAD 批量分段同一步可撤 |
| ADR-0100 E06、EF-018 | 全部 | 时间、句段、点、层（含 90 天软删）；同层仅同说话人禁重叠；合并保留下级。E06 映射条款以 [ADR-0122](../../../adr/0122-integer-milliseconds-and-optional-media.md) 第 12 条为准 |
| ADR-0100 E11、[ADR-0099](../../../adr/0099-desktop-product-design-and-release-contract.md) R08 | #603 | 口译 STT 本机优先，云端须项目级授权不静默回退，识别文本作候选待确认后写入 |
| ADR-0100 E13 | 全部交互片 | 快捷键双平台固定可查、优先级明确、有非快捷键入口 |
| ADR-0099 R02／R04／R11 | 全部 | 破坏性操作预览确认、整步提交；合法跨轨重叠；全键盘与焦点返回 |
| [ADR-0095](../../../adr/0095-attachment-file-publish-and-cleanup.md) | 1b-0、#603 | 口译短录音走 `attachments/objects/<sha256>` 原子发布与引用清理，不混入项目主 `media` 表 |
| [ADR-0107](../../../adr/0107-motion-compact-height-selection-and-shortcuts.md) | 1b-1、1b-4 | ⌘M 合并下一个；选中底色比悬停深一档 |
| [ADR-0115](../../../adr/0115-timeline-waveform-and-segment-highlights.md)／[0117](../../../adr/0117-active-segment-uses-input-focus-chrome.md) | 1b-1 | 波形与语段高亮、当前语段用输入焦点样式 |
| [ADR-0116](../../../adr/0116-page-notices-as-toasts-with-durable-carriers.md) | 全部含写操作的小片 | 拒绝原因与失败提示用 toast 加持久承载，不用页顶横幅 |
| [ADR-0086](../../../adr/0086-desktop-release-scope-and-format-freeze.md)、[0097](../../../adr/0097-desktop-write-entry-initialization-and-reference-identity.md) | 1b-0、#600、1b-3、1b-4 | 严格拒绝旧格式不迁移；分轨锁定建表不塞 `settings_json`；写入入口与引用身份 |
| `src/services/KeybindingService.ts` | 全部交互片 | 新按键注册到这里，不在组件里单独监听 |

## 5. Flag

- 沿用 `desktopTranscriptionWorkspaceEnabled`。本地直接使用，默认开。`VITE_DESKTOP_TRANSCRIPTION_WORKSPACE_ENABLED=false` 仍回到旧读页。

## 6. 失败模式 / 兼容性

- 旧库（非 v32）打开即拒绝、不改字节；只重建合成项目。
- 非法边界：拒绝并保留最后有效时间；拖动预览不落库。
- 撤销遇后续修改：提示先处理后续修改，不部分撤回（E06／ADR-0100 撤销条款）。

## 7. 验证矩阵

| 验证类型 | 命令 | 期望结果 |
| --- | --- | --- |
| typecheck | `npm run typecheck` | 0 errors |
| 单库 | `npx vitest run src/db/desktop` | all pass，含写→关→重开读回 |
| 页面 | `npx vitest run src/pages/DesktopTranscriptionWorkspacePage.test.tsx src/pages/useDesktopTranscription*` | all pass |
| 创建路由 | `npx vitest run src/pages/desktopTranscriptionCreateRouting.test.ts src/pages/useDesktopTranscriptionCreateController.test.tsx` | 旧版路由、父段和 speaker overlap 结果通过 |
| 多层正文 | `npx vitest run src/db/desktop/units.test.ts src/db/desktop/textSave.test.ts src/db/desktop/projectRead.test.ts` | 层间正文／草稿隔离，关闭重开后读回 |
| 结构守卫 | `npm run check:architecture-guard` | OK，无桌面例外新增 |
| 文档守卫 | `npm run check:docs-governance` | OK，含 Research 与 spec frontmatter 检查 |
| 桌面流程 | `npm run test:e2e:desktop-project` | green（CI `desktop-flow`） |
| 旧页回归 | `npm run test:e2e:chromium` | green（改旧组件 props 时） |
