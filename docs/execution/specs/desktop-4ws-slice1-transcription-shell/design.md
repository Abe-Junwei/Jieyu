---
title: desktop-4ws-slice1-transcription-shell design
doc_type: execution-spec-design
status: active
owner: repo
last_reviewed: 2026-11-02
source_of_truth: desktop-4ws-slice1-transcription-shell-spec
depends_on:
  - ./requirements.md
---

# Design — desktop-4ws-slice1-transcription-shell

## 1. 成熟方案扫描 / Research

- 仓库既有：`DesktopProjectReadPage` + `useDesktopProjectReadController` + 切片 0 事件／Query／`useDesktopDraftGuard`；浏览器侧 ReadyWorkspace 为成熟时间轴／波形宿主。
- 同类产品：ELAN／Praat 式「壳 + 波形 + 多轨时间轴 + 对象菜单」；本仓设计候选为板 **51**（待核验），菜单交接板 **52**；旧三栏板 27 已废弃。
- Best practice：feature flag 默认关替换在用桌面页（4ws 清单 §原则 7）；复用而非重写波形。
- 反模式：在简化读页继续堆交互；第二套转写视觉；把草稿放进 Query；按废弃板 27 做右栏检查器。
- 坑：ReadyWorkspace 深绑 Dexie——本片只做独立壳 + 单库已有读写；波形全量复用另任务，避免一次 PR 拖入编排层热点。
- **决定：适配** — 新页装配既有 desktop controller；壳布局参考板 **51**（上下文 + 主区，无右栏检查器）；波形／Timeline 受控映射后续任务逐条迁。

## 2. 架构选择

- 落位：`routing` + 页面装配；业务写路径仍在 controller／desktopCall。
- 选 A：独立页 + flag 分流。拒 B：继续在 `DesktopProjectReadPage` 加模式开关（工程／转写职责继续纠缠）。

## 3. 落位清单

| 文件 | 职责 |
| --- | --- |
| `featureFlags.ts` | `desktopTranscriptionWorkspaceEnabled` 默认 false |
| `App.tsx` | flag 开时 `/transcription` → 新页 |
| `DesktopTranscriptionWorkspacePage.tsx` | 壳：上下文条 + ReadView 主区 + 检查器栏 |
| `desktop-transcription-workspace.css` | 最多两层边框的壳布局 |
| `DesktopTranscriptionWorkspacePage.test.tsx` | 有 host 时渲染壳；文案分区 |

## 4. ADR

- ADR-0086 白名单内「既有能力 SQLite 接替」；ADR-0099 不在本片实现词典／查询。
- 不新开 ADR。

## 5. Flag

- 名：`desktopTranscriptionWorkspaceEnabled`；env `VITE_DESKTOP_TRANSCRIPTION_WORKSPACE_ENABLED`；默认 `false`。

## 6. 2026-11-02 准入核对与组件映射

**UI 精稿准入未确认：** 用户已撤回转写片段检查器；当前插件未连接，无法核验板 51–61 的最新状态。下表为代码接线差额；不得把精稿静态板当 Electron 运行证据。

| 区域/路径 | 实际入口与复用 | 目标接口/状态与差额 |
| --- | --- | --- |
| 壳/路由 | DesktopTranscriptionWorkspacePage.tsx，既有flag/App分流 | 保留独立路由；当前复用ReadView表单，仅是过渡，不能算时间轴交付 |
| 项目/稿件上下文 | useDesktopProjectReadController、useDesktopProjectReadQueries；稿件按钮经draft.leave | 保留sessionId隔离与统一Query刷新；检查切稿/切页/切项目/关闭入口全部走同一最新草稿协议 |
| 波形/播放 | 当前波形为waveformPlaceholder，ReadView提供audio；WaveformToolbar及transcription下Waveform*是复用候选 | 提取媒体URL/播放时间/选区的受控输入，先核props和hook依赖，禁止挂整个Dexie ReadyWorkspace；媒体缺失禁相关播放，焦点/选区本地保存 |
| 时间轴/句段 | TranscriptionTimelineVerticalView、HorizontalMediaLanes等是复用候选；read.splitUnit/mergeUnits/moveBoundary已有入口 | 同一unitId贯穿选择/播放/检查器；候选非已接线；边界单边/联动、拆合预览与毫秒载荷差额分小片验收 |
| 正文编辑 | DesktopProjectReadView→useDesktopDraftGuard→read.saveText→desktopClient.updateUnitText→unit.textSaved | 当前手动保存/离开保存、单内存草稿；缺500ms/5s队列、持久未生效草稿、三态回执与精确保存提示；IME不得强制提交 |
| 保存刷新 | read.saveText以emitAfterWrite连接统一事件→Query；catch返回false | 写入成功与刷新失败须分状态，不能刷新错就重放内容；最新输入版本匹配才清dirty，不用一个boolean涵盖unknown |
| 检查器 | 当前selectedUnit从draft.unitId/focusUnitId派生，只读时间/正文 | 需明确用户选择回调；时间/说话人/备注编辑各走具名业务操作，失败保草稿，回读后刷新；不能从正文草稿猜全部选择 |
| 离开/关闭 | useDesktopDraftGuard/useBlocker、beforeunload及DesktopDraftLeaveDialog | 核宿主关窗确认实际调用链；查询取消后再flush；异步保存期间继续输入不得保存旧值后直接离开 |
| 窄窗/暗色/焦点 | desktop-transcription-workspace.css及DESIGN角色 | 先收检查器再收上下文，保留重开入口与焦点；需实际视窗/键盘测试，不能只靠三栏CSS和formatTime显示 |

### 1a边界与验收输入

只补正文生产链，复用已有事件/Query/守卫：主进程回执及inspect、项目内草稿、最新版本队列、全离开入口。全部域字段草稿、多窗查询、完整词典或50GB包不是该片前置。格式冻结变化须单独明确版本和受控项目策略；不把显示端秒→毫秒格式化当内部时间协议已经完成。

必须新增故障验证：事务提交后IPC断开→inspect确认仅写一次；事务已成功而Query刷新失败→显示已保存/刷新失败、不得重写；保存A期间输入B→A返回不能清B或执行待离开导航；连续输入5s/停输500ms/IME组词；非法/未生效草稿重开读回；切稿/路由/切项目/宿主关闭的失败、重试和明确放弃；旧会话回执不得污染新项目。测试须通过真实业务事务并重开读回。

定向入口：DesktopTranscriptionWorkspacePage.test.tsx、DesktopProjectReadPage.test.tsx、useDesktopProjectReadController.test.tsx；草稿hook与宿主/desktopCall测试沿对应模块补用例，Electron生产路由验证另外记录。具体回执/草稿载荷设计见desktop-save-recovery，未有实现证据前不勾1a。

### 当前准入状态

- [x] 独立壳/正文保存/离开守卫现有调用链已核对，代码差额已列明。
- [x] 区域复用候选和单库/刷新/焦点责任已列明，未将候选冒充直接可用。
- [ ] Penpot 主稿及状态重新核验，用户撤回片段检查器；实际键盘行为仍待实现验证。
- [ ] 波形/时间轴候选props与媒体生命周期逐项核对，形成可直接接线的适配签名。
- [ ] 1a回执/草稿载荷的冻结格式方案及宿主关闭链故障测试方案通过检查。
- [ ] 壳页布局从过渡三栏收到板 51（去右栏检查器）。
- [ ] 合成Electron实际页面及重开证据；用户抽验仍由用户执行。

## 7. 2026-11-02 连接恢复后的视觉复查

27/29/43/44/45均已原生导出并逐张查看（本机/tmp/jieyu-transcription-{编号}.png，临时检查文件而非持久发布证据）。44的“稿件列表”按钮遮住片段元信息，已将元信息移到按钮右侧，再次导出确认无遮挡；27标题/编辑提示的误替换也已恢复。五稿的选中灰、独立焦点、错误和暗色表达可辨。

仍不足以定稿：目前没有保存中、提交结果未知、已保存未生效草稿三种明确表达，也缺离开处理与取消返回的完整操作示例；当前五稿只是静态状态对照。下一步在现有27/29上补这些状态说明和交接，不复制五套同类工作区。

接口核对：WaveformToolbar本身为受控展示，可从filename/isReady/isPlaying/playbackRate/volume/loop及onTogglePlayback/onSeek等接入桌面播放controller；声学/外观选项须按实际可用能力提供，不能空实现回调冒充支持。TranscriptionTimelineVerticalView依赖TranscriptionEditorContext、层segment hook及writeChosenTimelineText等旧写路径，不能直接装到桌面单库；应先分离受控展示/动作回调，旧写路径不得暗中回落Dexie。波形引擎/媒体生命周期适配仍需独立核对，Toolbar可复用不等于波形已接入。

## 8. 设计候选（2026-11-02，待重新核验）

待核验：板 **51** 曾作为转写主稿候选；板 **52** 为菜单与布局交接；同壳状态板 **53–61**（保存中／未知／失败+草稿／离开失败／在途核实／1280／窄窗／暗色／空媒体）。板 **27／29／43／44／45** 为历史参考，勿直接实现。

桌面适配仍采用单一受控状态：selection={manuscriptId,layerId,unitId}、media={url,ready,playing,currentSeconds,durationSeconds,rate,volume,loop}、viewport={startMs,endMs,zoom}、draft={rawInput,revision,persistence,publication}。选择来源明确为用户动作/定位请求，不能由draft.unitId暗改全部选择；Query只放已保存领域数据，播放头、焦点、输入草稿不入缓存。

展示动作约定：onSelectUnit(unitId)、onSeek(mediaSeconds)、onTogglePlayback()、onEditText(unitId,text)、onCompositionChange(boolean)、onRequestBoundary(preview)、onRequestSplit(preview)、onRequestMerge(preview)、onLeave(intent)。controller将媒体秒与文献毫秒按映射转换；展示组件不读Dexie、不直接desktopCall。只有成功持久回执后广播统一领域事件，刷新失败独立提示、不重放写入。

**UI 精稿准入：未通过，须核对当前画布。** 代码实现准入仍开：1a 回执／草稿／离开故障验证；1b 受控波形／时间轴（不得直接挂旧 VerticalView）；Electron 重开证据。运行时键盘、焦点返回与持久化仍由实现测试验收。
