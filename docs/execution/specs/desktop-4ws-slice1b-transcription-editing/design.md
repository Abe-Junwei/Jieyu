---
title: desktop-4ws-slice1b-transcription-editing design
doc_type: execution-spec-design
status: draft
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

## 2. 架构选择

- 用户决定（2026-11-17）：点层进第一程且 v29 带表结构；1b-6 全部留第一程；旧库只有合成项目，直接拒绝、不做迁移工具；新建／删除单段复用现成实现；合并分隔偏好存 `project.settings_json`（不改表）；其余交互取值见 requirements §3。
- 用户决定（2026-11-18，[ADR-0122](../../../adr/0122-integer-milliseconds-and-optional-media.md)）：库和桌面接口都用整数毫秒并改名；录音时长保持秒；删掉逻辑时长和文稿映射，换录音用一次性整体调时；文稿可以不挂录音，句段按 `sort_order` 排，时间可空，允许部分对齐；点必须有时刻，解除关联时保留点和句段时间；一有一无的合并结果无时间；库只要求至少 1 毫秒，界面拖动和拆分用 10 毫秒下限。表结构在 1b-0，无录音界面为 1b-7。
- 用户决定（2026-11-19，[ADR-0127](../../../adr/0127-shared-waveform-region-controls-use-theme-paint.md)）：选区动作按钮和速度滑杆采用主题色实底。这两处类是共享的，旧转写页跟着改。波形选区、波峰、语段块和全稿概览不在这次里。
- 用户决定（2026-11-19 排期审查）：1b 新排期所需的全部表列在 1b-0（v29 新 ADR）一次建齐（`units` 补 `skip_processing`／`confidence`／`self_certainty`，`layers` 补 90 天软删三列／`modality`／轨高与字体展示列，新建 `layer_lane_locks` 子表，`unit_texts` 关联 `attachment_files(id)` 存口译短录音，`settings.ts` 放行合并分隔符键）；同层内仅同说话人（或均未标说话人）禁重叠，不同说话人允许重叠并分轨；口译 STT 本机 Whisper 优先、云端守 E11 授权且转出文本走候选待确认；VAD 自动分段只填空白区间（0 ms 不重叠）并整批同事务一步可撤；多层视图（#598）排在层结构（#597）之前，分轨（#600）用预置多说话人种子验收。

- 状态：选择、媒体、视口、草稿四块受控状态放 controller，Query 只放已保存数据（沿用 slice1 design §8）。
- 动作：`onSelectUnit`、`onSeek`、`onRequestEdge`、`onRequestSharedBoundary`、`onRequestSplit`、`onRequestMerge`、层与分轨操作、口译录音与候选、点层增删改；展示组件不直接 `desktopCall`。
- 拒绝：在 `useDesktopProjectReadController` 上继续加；一个大 controller 承担全部编辑（会过 300 行，按职责拆分为媒体、选择、层与分轨、口译录音、边界拆合与自动分段）。

## 3. 落位清单

| 文件 | 职责 | 估计 |
| --- | --- | --- |
| `src/db/desktop/timeMs.ts` | 秒↔毫秒换算与取整（唯一入口） | < 80 |
| `src/db/desktop/schema.ts` | v29：毫秒列、点层、拆合映射、句段样态／确信度列、层软删与外观列、`layer_lane_locks`、口译附件关联 | DDL |
| `src/db/desktop/layers.ts` | 层改名、排序、层高／字体、分轨锁定、E06 迁移与 90 天软删 | < 300 |
| `src/db/desktop/unitEdges.ts` | 单边、共用边界、同说话人防重叠校验、批量新建与撤销 | < 300 |
| `src/db/desktop/unitSpan.ts` | 拆分／合并按 E06 改写（文件已 1094 行，改写时拆出） | 降行数 |
| `src/db/desktop/points.ts` | 点层读写 | < 200 |
| `src/pages/useDesktopTranscriptionMediaController.ts` | 媒体、播放、视口 | < 220 / < 8 hooks |
| `src/pages/useDesktopTranscriptionSelectionController.ts` | 选择与定位请求 | < 150 |
| `src/pages/useDesktopTranscriptionLayerController.ts` | 多层读取装配、层 CRUD／软删、层高与字体、分轨锁定 | < 280 / < 10 hooks |
| `src/pages/useDesktopTranscriptionOralController.ts` | 口译短录音（附件 CAS）与 STT 候选采纳 | < 250 / < 10 hooks |
| `src/pages/useDesktopTranscriptionEditController.ts` | 边界／行内草稿／拆合／点层／VAD 批量分段动作与回执 | < 300 / < 12 hooks |

约束：守卫 `rules.desktop.mjs` 300 行；页面只装配；面板 CSS 最多两层边框。

## 4. ADR

- 需新 ADR（1b-0）：user_version 29 的毫秒时间、点层、拆合映射、句段样态与确信度列、层软删与显示列、`layer_lane_locks` 子表、口译附件关联与旧库拒绝规则，接在 ADR-0121（v28）之后。E06 的行为规则已由 ADR-0100 决定，不重复。

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

- 旧库（≤ 28）打开即拒绝、不改字节；只重建合成项目。
- 非法边界：拒绝并保留最后有效时间；拖动预览不落库。
- 撤销遇后续修改：提示先处理后续修改，不部分撤回（E06／ADR-0100 撤销条款）。

## 7. 验证矩阵

| 验证类型 | 命令 | 期望结果 |
| --- | --- | --- |
| typecheck | `npm run typecheck` | 0 errors |
| 单库 | `npx vitest run src/db/desktop` | all pass，含写→关→重开读回 |
| 页面 | `npx vitest run src/pages/DesktopTranscriptionWorkspacePage.test.tsx src/pages/useDesktopTranscription*` | all pass |
| 结构守卫 | `npm run check:architecture-guard` | OK，无桌面例外新增 |
| 桌面流程 | `npm run test:e2e:desktop-project` | green（CI `desktop-flow`） |
| 旧页回归 | `npm run test:e2e:chromium` | green（改旧组件 props 时） |
