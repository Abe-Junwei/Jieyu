---
title: desktop-4ws-slice1b-transcription-editing requirements
doc_type: execution-spec-requirements
status: active
owner: repo
last_reviewed: 2026-11-21
source_of_truth: desktop-4ws-slice1b-transcription-editing-spec
---

# Requirements — 转写切片 1b：波形、时间轴与句段编辑

## 1. What & Why

- **要做什么**：在桌面转写工作区接上波形、播放、时间轴，按 ADR-0100 E06 交付边界、拆分、合并、点层与撤销，写入单库并可重开读回。
- **为什么现在做**：主路线图 2026-11-02 唯一执行队列 1b；1a（[#556](https://github.com/Abe-Junwei/Jieyu/issues/556)）合入后开工。现有单库写操作与 E06 有差额（design §1）。
- **不做什么**：自动对齐、相邻合并候选扫描（EF-018 推荐半片，第二程）、按参与者复制层（EF-017）、右栏检查器（精稿已撤回）、ELAN 推土机／平移模式、给没录音的句段编造时间。自动分段（FR-072）与口译轨（译文录音、播放、删除、语音转文字）在 2026-11-19 排入本切片，见 tasks.md。

## 2. 用户场景

1. 转写者单击句段即选中并把播放头移到段首（不自动播），空格播放，另有键只播本段；拖一条边只改这条边，需要时显式联动共用边界；非法位置松开回到最后有效值并说明原因。
2. 转写者在时间切点和文字位置拆段，或把同说话人相邻两段合并并选择正文分隔方式；下级标注保留，可一步撤销。
3. 转写者在点层标记事件时刻，重开后时刻与文字不变。

## 3. 验收标准（每片各自验收，见 tasks）

- [ ] 内部时间为整数毫秒并改名（`startMs`／`endMs`、`timeMs`、`rangeStartMs`／`rangeEndMs`），开始早于结束；导入取整经 `timeMs.ts`（恰半毫秒向时间轴正方向）
- [ ] 文稿可以不挂录音：按 `sort_order` 和字数排版，时间可空；部分对齐时已对齐段的时间与顺序一致，未对齐段夹在中间。没录音不能新建点层。解除录音关联保留已有句段时间和点（ADR-0122）
- [x] 同层内同说话人（或均未指定说话人）区间禁止重叠、可相接；不同说话人（分轨显示）及不同层的跨轨重叠合法（E06／R04）；超出媒体范围按范围判断后拒绝
- [ ] 层结构与分轨：层支持按 E06 迁移或 90 天软删（入统一已删除列表）；层高与显示字体存 `layers` 表；说话人分轨锁定存 `layer_lane_locks` 子表，不入 `project.settings_json`
- [ ] 拖层改归属：转写层的宿主链接只改层树位置，不改 `parent_id`，也不借用宿主的语段；挂上之后该层自己的 unit 仍在。根缝和「回到顶层」只给转写层。翻译层落到根缝则拒绝，菜单里没有「回到顶层」。同一宿主的翻译层头只改顺序。只有一个宿主的翻译层落到转写层头，换成这一个宿主。已有多个宿主的翻译层落到转写层头则拒绝，不弹确认，改走宿主弹窗。有正文或草稿的宿主拆不掉。拖动中不写库；失败、Esc 或指针取消都回到原位且库不变。转写层挂上宿主后，正文仍写在自己的 unit 上，不写进宿主的 unit
- [ ] 口译轨：译文短录音走 `attachments/objects/<sha256>` 内容寻址存储并与 `unit_texts` 关联；语音转文字本机 Whisper 优先，云端遵守 E11 项目授权不静默回退，识别文本进候选待人工确认后再写入译文
- [ ] 自动分段（FR-072）：仅在当前转写层空白区间生成新段（严格 0 ms 不重叠、不改已有段），整批一次事务提交且同一步可撤销
- [x] 拖动到非法位置按 E06 回退；时间码框里的半成品按 E02 存为草稿，不回退
- [x] 默认单边移动；Shift 拖动联动共用边界，右键菜单同一动作；键盘先选中共用边界再用方向键移；同一步保存与撤销
- [x] 拖动默认在 8 像素内吸附到邻段边与播放头，按住 Alt／Option 临时关闭
- [x] 键盘微调：方向键 10 ms，加 Shift 100 ms
- [x] 未关联媒体时仍可编辑时间，只是不查媒体范围，界面提示「未关联媒体」
- [x] 新建（空白处拖出）与删除单段（列出下级并确认）：完整适配旧版 `useLasso` 与创建路由，不保留简化路由。空白处开始、拖过已有语段转为选择；点击仍走既有选择／定位。目标层取当前活动文本层，无指定时取默认转写层；按旧版宿主解析选择结构层。时间细分要求范围被父语段完整包含并继承说话人；独立边界层只在自身被选为目标时建段；符号层路由到其宿主结构层。拖建最短 50ms，既有边界编辑仍为 10ms；同层同说话人不重叠、异说话人可重叠，波形／文本轨道创建共用一条路由
- [ ] 多层正文投影：同一时间语段只存一条 unit；关联文本层读取同一 unit 的时间与说话人，正文按 `layer_id` 区分，空正文不预建记录，首次输入才写。层关联使用显式多宿主链接，不把 `layers.parent_id` 当作文本匹配；草稿、正式保存、回执和撤销均按 `(unit_id, layer_id)` 隔离
- [x] 文本轨道拖选按鼠标所在说话人轨创建；同说话人不能与既有区间重叠，异说话人允许重叠。波形拖选不指定说话人时沿用旧路由的命中／继承规则
- [ ] 拆分：有正文光标按光标分，否则全留左段；预览可拖正文分割点再确认
- [ ] 合并：允许有空隙，确认框显示空隙长度，结果覆盖空隙；分隔默认一个空格，可改，记在 `project.settings_json`；保留下级内容、顺序、已有时间，层级冲突阻断（EF-018）
- [ ] 多选：批量改说话人、批量删除（列出下级并确认）、多个相邻段一次合并（同一步撤销）
- [x] 撤销／重做按 E04：项目打开期间多步、各稿件独立，重开不保留
- [ ] 拆合产生新身份并保留旧→新映射；唯一对应的分析保留，其余标待复核；拆合形成完整分析历史版本（E04）
- [ ] 点层：点只带时刻与文字标签（无说话人、上级、下级）；同层同毫秒唯一，可增删改移
- [ ] 每项写入：写 → 关闭 → 重开 → 读回；Electron 合成证据（`test:e2e:desktop-project`）。至少覆盖同一 unit 的两个 layer 正文与草稿互不覆盖
- [ ] flag `desktopTranscriptionWorkspaceEnabled` 默认开；显式 `false` 时旧读页不变

## 4. 受影响代码地图

| 类别 | 文件 / 目录 | 改动性质 |
| --- | --- | --- |
| 页面 | `src/pages/DesktopTranscriptionWorkspacePage.tsx` | 仅装配；去检查器 |
| Controller | `src/pages/useDesktopTranscription*Controller.ts` | 新增（媒体、选择、句段编辑分开） |
| Hook 复用 | `src/hooks/media/useWaveSurfer.ts`、`WaveformToolbar` | 复用，不改语义。选区按钮和速度滑杆的画法按 ADR-0127，旧页同一套类一起改 |
| 组件复用 | `TranscriptionTimelineMediaTranscriptionLane`、`TimelineAnnotationItem` | 受控 props；不挂 `VerticalView`／`HorizontalMediaLanes` |
| Schema / DB | `src/db/desktop/schema.ts`、`layers.ts`、`units.ts`、`textSave.ts`、`unitSpan.ts`、新 `points.ts` | v29 既有结构与 v32 layer-scoped 正文／宿主链接；改写边界／拆分／合并 |
| 宿主 | `operationContract.ts`、`desktopCall.ts`、`client.ts` | 新操作 |
| i18n | `dictKeys.ts`、`dictionaries/*` | 新键 |
| 测试 | `src/db/desktop/*.test.ts`、`tests/e2e-desktop/` | 每片新增 |

## 5. 已知风险与依赖

- 1a 已合入，读控制器已拆到 300 行内（[#559](https://github.com/Abe-Junwei/Jieyu/issues/559)）。
- 改旧组件 props 可能影响 ReadyWorkspace：同 PR 跑 `test:e2e:chromium`。
- 格式变更须新 ADR，只重建合成项目，旧库拒绝且不改字节（D14 之后的规则）。
