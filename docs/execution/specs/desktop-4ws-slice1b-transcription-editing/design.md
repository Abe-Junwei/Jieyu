---
title: desktop-4ws-slice1b-transcription-editing design
doc_type: execution-spec-design
status: draft
owner: repo
last_reviewed: 2026-11-17
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

- 用户决定（2026-11-17）：点层进第一程且 v29 带表结构；1b-6 全部留第一程；旧库只有合成项目，直接拒绝、不做迁移工具；其余交互取值见 requirements §3。吸附距离、修饰键、分隔偏好存放位置在各片开工清单里定。

- 状态：选择、媒体、视口、草稿四块受控状态放 controller，Query 只放已保存数据（沿用 slice1 design §8）。
- 动作：`onSelectUnit`、`onSeek`、`onRequestEdge`、`onRequestSharedBoundary`、`onRequestSplit`、`onRequestMerge`、点层增删改；展示组件不直接 `desktopCall`。
- 拒绝：在 `useDesktopProjectReadController` 上继续加（已 312 行）；一个大 controller 承担全部编辑（会过 300 行）。

## 3. 落位清单

| 文件 | 职责 | 估计 |
| --- | --- | --- |
| `src/db/desktop/timeMs.ts` | 秒↔毫秒换算与取整（唯一入口） | < 80 |
| `src/db/desktop/schema.ts` | v29：毫秒列、点层、拆合映射 | DDL |
| `src/db/desktop/unitEdges.ts` | 单边、共用边界、校验、撤销 | < 300 |
| `src/db/desktop/unitSpan.ts` | 拆分／合并按 E06 改写（文件已 1094 行，改写时拆出） | 降行数 |
| `src/db/desktop/points.ts` | 点层读写 | < 200 |
| `src/pages/useDesktopTranscriptionMediaController.ts` | 媒体、播放、视口 | < 200 / < 8 hooks |
| `src/pages/useDesktopTranscriptionSelectionController.ts` | 选择与定位请求 | < 150 |
| `src/pages/useDesktopTranscriptionEditController.ts` | 边界／拆合／点层动作与回执 | < 300 / < 12 hooks |

约束：守卫 `rules.desktop.mjs` 300 行；页面只装配；面板 CSS 最多两层边框。

## 4. ADR

- 需新 ADR（1b-0）：user_version 29 的毫秒时间、点层、拆合映射与旧库拒绝规则。E06 的行为规则已由 ADR-0100 决定，不重复。

## 5. Flag

- 沿用 `desktopTranscriptionWorkspaceEnabled`（默认 false）。1b 全部片完成、自用一周后再议默认开。

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
