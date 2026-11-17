---
title: desktop-4ws-slice1b-transcription-editing requirements
doc_type: execution-spec-requirements
status: draft
owner: repo
last_reviewed: 2026-11-17
source_of_truth: desktop-4ws-slice1b-transcription-editing-spec
---

# Requirements — 转写切片 1b：波形、时间轴与句段编辑

## 1. What & Why

- **要做什么**：在桌面转写工作区接上波形、播放、时间轴，按 ADR-0100 E06 交付边界、拆分、合并、点层与撤销，写入单库并可重开读回。
- **为什么现在做**：主路线图 2026-11-02 唯一执行队列 1b；1a（[#556](https://github.com/Abe-Junwei/Jieyu/issues/556)）合入后开工。现有单库写操作与 E06 有差额（design §1）。
- **不做什么**：VAD／自动分段（FR-072）、自动对齐、口译轨、相邻合并候选扫描（EF-018 推荐半片，第二程）、按参与者复制层（EF-017）、右栏检查器（精稿已撤回）、ELAN 推土机／平移模式。

## 2. 用户场景

1. 转写者点句段即从该段播放，播放头跟随；拖一条边只改这条边，需要时显式联动共用边界；非法位置松开回到最后有效值并说明原因。
2. 转写者在时间切点和文字位置拆段，或把同说话人相邻两段合并并选择正文分隔方式；下级标注保留，可一步撤销。
3. 转写者在点层标记事件时刻，重开后时刻与文字不变。

## 3. 验收标准（每片各自验收，见 tasks）

- [ ] 内部时间为整数毫秒，开始早于结束；导入取整按 E06（恰半毫秒向后）
- [ ] 同层区间不重叠、可相接；超出媒体范围按文献轴映射判断后拒绝
- [ ] 默认单边移动；联动共用边界同一步保存与撤销
- [ ] 拆分按文字位置分正文；合并保留双方正文（用户确认分隔）与下级内容、顺序、已有时间，层级冲突阻断（EF-018）
- [ ] 拆合产生新身份并保留旧→新映射；唯一对应的分析保留，其余标待复核
- [ ] 点层同层同毫秒唯一，可增删改移
- [ ] 每项写入：写 → 关闭 → 重开 → 读回；Electron 合成证据（`test:e2e:desktop-project`）
- [ ] flag `desktopTranscriptionWorkspaceEnabled` 默认 false；关时旧读页不变

## 4. 受影响代码地图

| 类别 | 文件 / 目录 | 改动性质 |
| --- | --- | --- |
| 页面 | `src/pages/DesktopTranscriptionWorkspacePage.tsx` | 仅装配；去检查器 |
| Controller | `src/pages/useDesktopTranscription*Controller.ts` | 新增（媒体、选择、句段编辑分开） |
| Hook 复用 | `src/hooks/media/useWaveSurfer.ts`、`WaveformToolbar` | 复用，不改语义 |
| 组件复用 | `TranscriptionTimelineMediaTranscriptionLane`、`TimelineAnnotationItem` | 受控 props；不挂 `VerticalView`／`HorizontalMediaLanes` |
| Schema / DB | `src/db/desktop/schema.ts`、`units.ts`、`unitSpan.ts`、新 `points.ts` | user_version 29；改写边界／拆分／合并 |
| 宿主 | `operationContract.ts`、`desktopCall.ts`、`client.ts` | 新操作 |
| i18n | `dictKeys.ts`、`dictionaries/*` | 新键 |
| 测试 | `src/db/desktop/*.test.ts`、`tests/e2e-desktop/` | 每片新增 |

## 5. 已知风险与依赖

- 依赖 1a 合入；`useDesktopProjectReadController` 需先拆到 300 行内（守卫例外 30 天）。
- 改旧组件 props 可能影响 ReadyWorkspace：同 PR 跑 `test:e2e:chromium`。
- 格式变更须新 ADR，只重建合成项目，旧库拒绝且不改字节（D14 之后的规则）。
