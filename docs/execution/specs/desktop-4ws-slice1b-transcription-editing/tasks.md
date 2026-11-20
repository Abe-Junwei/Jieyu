---
title: desktop-4ws-slice1b-transcription-editing tasks
doc_type: execution-spec-tasks
status: draft
owner: repo
last_reviewed: 2026-11-19
source_of_truth: desktop-4ws-slice1b-transcription-editing-spec
depends_on:
  - ./requirements.md
  - ./design.md
---

# Tasks — 转写切片 1b

> 每片单独 PR：开工前在本文件补该片落位与测试并经用户确认，再实现。每片附 Electron 合成证据。2026-11-17 用户确认「v29 单独升级」。2026-11-19 重排：先毫秒和只读语段，再层与分轨，再边界与正文；旧层头不挂回轨道。同一子轨不能重叠。

## 每片开工清单（动产品代码前，逐项写进该片 issue 或本文件）

0. 规范：读 design §4「必须遵守的既有规范」中本片对应条款原文，逐条写「怎么遵守」；与条款冲突的设计回用户定，不自行改规则。
1. 盘点：本片涉及的现有代码，列文件与行号（单库、宿主、页面、可复用组件）。
2. 审查：对照 ADR-0100 E06、EF-018 与本规格逐项核对现有行为；发现的问题先写成会失败的测试。
3. 结论：每项写「直接用 / 改着用 / 自己写」与理由；只有引入新做法时才补业内调研（design §1 格式）。
4. 用户确认后才实现。

## 前置（[#559](https://github.com/Abe-Junwei/Jieyu/issues/559)）

- [x] 1a 合入（[#556](https://github.com/Abe-Junwei/Jieyu/issues/556)）→ 验证：1a 退出条件
- [x] `useDesktopProjectReadController` 拆到 300 行内，删除 `rules.desktop.mjs` 中的例外 → 验证：`npm run check:architecture-guard`
- [x] 主路线图 1b 行改为指向本规格，去掉「检查器」；北极星 user_version 与代码一致 → 验证：`npm run check:docs-governance`

## 小片

- [x] 1b-0（[#560](https://github.com/Abe-Junwei/Jieyu/issues/560)）格式 v29（1b-2 又升到 v30，见 ADR-0128），按 [ADR-0122](../../../adr/0122-integer-milliseconds-and-optional-media.md) 及 2026-11-19 全量建齐决定：`startMs`／`endMs`、点的 `timeMs`、转写范围 `rangeStartMs`／`rangeEndMs`；`timeMs.ts` 唯一换算（恰半毫秒向时间轴正方向取整）；删逻辑时长和文稿映射；`media_id` 可空、`sort_order`、时间可空且开始早于结束；点必须有时刻；拆合映射不设外键；`units` 补 `skip_processing`、`confidence`、`self_certainty`；`layers` 补软删三列（`deleted_at`／`retain_until`／`reminder_shown_at`）、`modality`、轨高与显示字体列；新增 `layer_lane_locks(layer_id, speaker_id, lane_index)` 子表；`unit_texts` 关联 `attachment_files(id)` 存口译短录音；`settings.ts` 放行合并分隔符键。桌面读路径改走毫秒并读整稿多层与句段链接。格式冻结记录与旧库拒绝 → 验证：`npx vitest run src/db/desktop`（写→关→重开读回、半毫秒取整）
- [x] 1b-1 收口（[#561](https://github.com/Abe-Junwei/Jieyu/issues/561)）只读语段换成 `TimelineAnnotationItem`（文本与选中；64px 层名；不显示拖柄、不开行内输入、不挂旧层头）。波形／播放／缩放／视图菜单已在页上，本片不扩 → 验证：页面 vitest + `test:e2e:desktop-project`
- [ ] 播放与选区（[#602](https://github.com/Abe-Junwei/Jieyu/issues/602)）从这里播放、清除选区 → 验证：页面 vitest
- [ ] 语段样态（[#596](https://github.com/Abe-Junwei/Jieyu/issues/596)）机器转写置信度下划线、跳过处理斜纹、标记为跳过处理／取消跳过（写→关→重开读回）、紧凑密度 → 验证：单库与页面 vitest
- [ ] 多层视图（[#598](https://github.com/Abe-Junwei/Jieyu/issues/598)）时间轴第二层、折叠轨道、层级连接线（有链接才画；开关在层列表或视图菜单）。精稿补收起的层和两层之间的连线 → 验证：页面 vitest + 桌面流程
- [ ] 层结构（[#597](https://github.com/Abe-Junwei/Jieyu/issues/597)）上下文栏层列表与单库层写操作：新建转写层、新建翻译层、编辑层信息、按 E06 删除当前层（迁移至兼容层或 90 天软删依赖子树并进统一已删除列表）、排序、拖动层高（落 `layers` 表）。不挂旧层头 → 验证：单库与页面 vitest + 桌面流程
- [ ] 口译轨（[#603](https://github.com/Abe-Junwei/Jieyu/issues/603)）翻译层上的译文录音、播放、删除、语音转文字：短录音复用 `attachments/objects/<sha256>` 与 `unit_texts` 关联；语音转文字本机 Whisper 优先，云端遵守 E11 项目授权不静默回退，转出结果进候选待确认后再写入译文正文；适配受控 `TimelineTranslationAudioControls` → 验证：单库与页面 vitest + 桌面流程（写→关→重开读回）
- [ ] 层显示样式（[#599](https://github.com/Abe-Junwei/Jieyu/issues/599)）层的正字法与字体（落 `layers` 表）。不放回旧层头 → 验证：单库与页面 vitest
- [ ] 分轨（[#600](https://github.com/Abe-Junwei/Jieyu/issues/600)）自动分轨、锁定到某一轨（落 `layer_lane_locks` 子表，不进 `settings_json`）、一人一轨、折叠时重叠临时展开、单轨重叠轮换。同层仅同说话人（或均未标说话人）禁重叠，不同说话人允许重叠；本片用预置多说话人种子验收，指派交互留 1b-6。精稿补同一层上下两行且一行锁定 → 验证：单库与页面 vitest + 桌面流程
- [x] 1b-2（[#562](https://github.com/Abe-Junwei/Jieyu/issues/562)）边界：默认单边、Shift 联动、吸附、键盘微调、拖动预览、非法回退、同层同说话人（同一子轨）重叠／媒体范围拦截、撤销重做；新建与删除单段（复用 `createUnit`／`deleteUnitTree`）；时间码框半成品按 E02 存草稿、不回退。选中拖柄精稿已有，不另补。写入已落：`unitEdges.ts`、`unit_time_drafts`（user_version 30，ADR-0128）、按稿件撤销和重做。页面已接：选中拖柄、拖动预览、吸附提示、时间码草稿、共用边界、删除确认。→ 验证：页面 vitest 已过；`npm run test:e2e:desktop-project` 14 passed、3 skipped（转写页选段并空格播放通过）
- [x] 行内正文（[#601](https://github.com/Abe-Junwei/Jieyu/issues/601)）选中后再点进入正文：光标、失焦保存、Esc 还原并退出；空正文留草稿。确信度不在本片改。→ 验证：页面 vitest 14 passed（2026-11-19 补输入法组字结束保存用例后）；`npm run test:e2e:desktop-project` 14 passed、3 skipped（转写页选段并空格播放通过）
- [ ] 1b-3（[#563](https://github.com/Abe-Junwei/Jieyu/issues/563)）拆分：时间切点 + 文字位置、预览、新身份与映射、跨切点分析待复核、撤销 → 验证：同上
- [ ] 1b-4（[#564](https://github.com/Abe-Junwei/Jieyu/issues/564)）合并：同稿同层同说话人相邻、显示空隙、确认正文分隔（记 `project.settings_json`）、下级保留与冲突阻断（EF-018）、新身份与映射、撤销 → 验证：同上
- [ ] 1b-5（[#565](https://github.com/Abe-Junwei/Jieyu/issues/565)）点层：增删改移、同层同毫秒唯一 → 验证：同上
- [ ] 1b-6（[#566](https://github.com/Abe-Junwei/Jieyu/issues/566)）其余入口：多选（批量改说话人、批量删除、多段一次合并）、说话人与备注、修改确信程度、说话人目录筛选（FR-032）、部分转写（FR-066/068）、馆藏音频手动定位（FR-082）。说话人指派放句段菜单和上下文栏 → 验证：同上
- [ ] 1b-7（[#584](https://github.com/Abe-Junwei/Jieyu/issues/584)）无录音文稿与逐段补时间：按顺序和字数排版、只按文字位置拆分、部分对齐夹在前后已对齐段之间；合并一有一无则结果无时间并在确认框说明；两段都没有时间的相邻合并也留在本片；解除录音关联保留已有时间和点。表结构不在本片 → 验证：同上
- [ ] 自动分段（[#604](https://github.com/Abe-Junwei/Jieyu/issues/604)）沿用现有 VAD（FR-072）：仅在当前转写层空白区间生成新段（严格 0 ms 不重叠、不改已有段），整批一次事务提交并作为同一步可撤销，失败有提示。依赖 1b-0 毫秒与 1b-2 新建／撤销 → 验证：单库与页面 vitest + 桌面流程（写→关→重开读回）
- [ ] 收尾（[#567](https://github.com/Abe-Junwei/Jieyu/issues/567)）：flag 开路径完整桌面流程；自用一周后决定默认值；用户本人抽验 → 验证：主路线图 1b 退出条件

## Pre-merge gates（每片）

- [x] `npm run typecheck`
- [x] `npx vitest run src/db/desktop src/pages/DesktopTranscriptionWorkspacePage.test.tsx`（加本片新测试）
- [x] `npm run test:e2e:desktop-project`
- [x] 改旧组件 props 时：`npm run test:e2e:chromium`（122 通过，1 条 flaky 重试后通过）
- [x] `npm run check:architecture-guard`
- [x] `npm run check:docs-governance`
- [x] 不适用：不触及 `src/ai/**`
- [x] Flag `desktopTranscriptionWorkspaceEnabled` 默认开。`false` 才回到旧读页

## Post-merge

- [ ] 全部勾完后删除本目录与 `desktop-4ws-slice1-transcription-shell/`（ADR-0051）
