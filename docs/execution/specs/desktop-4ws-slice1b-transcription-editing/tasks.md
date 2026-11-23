---
title: desktop-4ws-slice1b-transcription-editing tasks
doc_type: execution-spec-tasks
status: active
owner: repo
last_reviewed: 2026-11-22
source_of_truth: desktop-4ws-slice1b-transcription-editing-spec
depends_on:
  - ./requirements.md
  - ./design.md
---

# Tasks — 转写切片 1b

> 每片单独 PR：开工前在本文件补该片落位与测试并经用户确认，再实现。每片附 Electron 合成证据。2026-11-17 用户确认「v29 单独升级」。2026-11-19 重排：先毫秒和只读语段，再层与分轨，再边界与正文；同一子轨不能重叠。当前已确认的旧版行为恢复范围见 design §1／§2 与新增的 1b-2R；两个拖建入口在完整验收前保持关闭。

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
- [x] 播放与选区（[#602](https://github.com/Abe-Junwei/Jieyu/issues/602)）波形空白处右键从点击处播放；点击空白处清除已选语段（离开守卫）。放大缩小仍走现有缩放条；循环选区留 1c。→ 验证：`npx vitest run src/pages/DesktopTranscriptionWorkspacePage.waveMenu.test.tsx src/pages/desktopTranscriptionEdgePointer.test.ts`
- [x] 语段样态（[#596](https://github.com/Abe-Junwei/Jieyu/issues/596)）机器转写置信度用正文颜色（ADR-0136）、跳过处理斜纹、标记为跳过处理／取消跳过（写→关→重开读回）、紧凑密度只记在本机 → 验证：`npx vitest run src/utils/segmentConfidence.test.ts src/db/desktop/unitTextLayers.test.ts src/db/desktop/modelRuns.test.ts src/pages/useDesktopLayerView.test.tsx`
- [x] 多层视图（[#598](https://github.com/Abe-Junwei/Jieyu/issues/598)）时间轴第二层、折叠轨道、层级连接线（有链接才画；开关在层列表或视图菜单）。精稿补收起的层和两层之间的连线。收口按精稿：连线只来自 `layer_links`，不另设隐藏开关；宿主折叠钮收起整组从属层（`+N`），层名菜单收成窄条，折叠只存本机 → 验证：页面 vitest（`DesktopTranscriptionWorkspacePage.selection.test.tsx`「draws a tree line only for a linked layer…」）+ 桌面流程「a linked layer sits under its host…」
- [x] 层结构（[#597](https://github.com/Abe-Junwei/Jieyu/issues/597)）上下文栏层列表与单库层写操作：新建转写层、新建翻译层、编辑层信息、按 E06 删除当前层（迁移至兼容层或 90 天软删依赖子树并进统一已删除列表）、排序、拖动层高（落 `layers` 表）。不挂旧层头。落位：`layers.ts` 读出 `lane_height` 并滤掉已删层；写操作在 `layerStructure.ts`（改名、排序、层高、迁移或软删、恢复），经 `layers.rename` / `layers.move` / `layers.setHeight` / `layers.delete` / `layers.listDeleted` / `layers.restore`。页面用 `useDesktopTranscriptionLayerController.ts`，上下文栏只渲染；不进句段撤销栈。→ 验证：`npx vitest run src/db/desktop/layerStructure.test.ts src/pages/DesktopTranscriptionWorkspacePage.selection.test.tsx`，再 `npm run test:e2e:desktop-project -- --grep "layer structure"`
  - 调研（2026-11-21）：ELAN 删层立即删标注与子层，层高只有全局偏好（[Deleting tiers](https://www.mpi.nl/tools/elan/docs/manual/Sec_Deleting_tiers.html)、[Editing preferences](https://www.mpi.nl/tools/elan/docs/manual/Sec_Editing_preferences.html)）。本仓库按 E06 更严。结论：适配。删除沿用文稿软删，层高按层写 `lane_height`，新建沿用 `layers.create`。不挂旧层头、不加依赖、不改表。
  - 落位：写操作在 `src/db/desktop/layers.ts`，经 `operationContract` 与 `desktopCall` 露出。页面由 `useDesktopTranscriptionLayerController.ts` 发调用，上下文栏只渲染。层树只认 `layer_links`，`layers.parent_id` 不动。不进 `edit_receipts` 撤销栈。
  - 列表：`listLayers`／`getLayer`／`listLayerLinks` 过滤已删层（链接任一端已删即隐去），读模型带 `laneHeight`。上下文栏按层树列出真实层名并标当前层。
  - 新建：转写层 `time-aligned`＋`transcription`，不挂宿主。翻译层 `symbolic-association`＋`translation`，首选宿主为当前转写层。名称必填；`key` 在稿内唯一，含已删层（`UNIQUE(manuscript_id, key)`）。
  - 编辑：只改名称，一次写入。类型、正字法、字体、父子关系留 #599 及以后。
  - 排序：上移／下移。根层改 `layers.sort_order`，同宿主从属层改 `layer_links.sort_order`，一次事务。
  - 层高：时间轴层行下缘拖动，松手写入正整数像素；空值用现有行高；拖动中不写库。
  - 删除：无标注无从属层则直接软删。否则确认框预览影响后二选一，一次事务。① 迁到兼容层（同 `content_type`、未删）：`unit_texts`／`unit_text_drafts` 改层；拥有 unit 的层同时改 `units.layer_id` 与 `points.layer_id`；目标层同一 unit 已有正文、或同说话人时间重叠，整次拒绝不覆盖。② 整棵从属子树一起软删：拥有的 unit、点和从属层正文随层隐去，不物理删除。`layer_lane_locks` 与 `target_type='layer'` 备注保留，随层恢复。
  - 保留与恢复：`retain_until` 为 90 天，提醒后至少 7 天（复用 `reminder_shown_at`）。软删层进现有已删除列表，可恢复；稿件已删或首选宿主仍在删除状态则拒绝恢复。单层到期清除延后，软删层随稿件清除。
  - 验证：`npx vitest run src/db/desktop/layers.test.ts`（新建、改名、排序、层高、迁移冲突拒绝、软删子树、恢复拒绝，关库重开读回）；页面 vitest（上下文栏两层、新建翻译层后时间轴多一行、删除后行消失）；`npm run typecheck`、`npm run check:architecture-guard`；`npm run test:e2e:desktop-project -- --grep "<用例名>"`（新建翻译层、拖高、删除后从已删除列表恢复）。正字法、字体、口译录音、分轨不在本片。
- [x] 口译轨（[#603](https://github.com/Abe-Junwei/Jieyu/issues/603)）口译录音、播放、删除、语音转文字。审查（2026-11-21）：短录音不挂在翻译层正文上，确认后的文字也不写入译文正文或主转写。录音放在只放录音的层，文字放在它的子文本层；#597 已有的纯文本翻译层不动，也不在那里加 `modality`。三步，仍记在 #603，不另开议题：
  - 现状缺口：`unit_texts.audio_file_id` 有列但无写入路径；`publishAttachment` 只挂词条（要求 `lexemeId`）；桌面页没有麦克风入口；旧 `TimelineTranslationAudioControls` 认旧版媒体对象（`MediaItemDocType`），只能参照外观，数据来源重写；`modelRuns` 接受后会新建句段，不能写已有子层，语音转文字不走它。
  - 步骤 1 Electron 麦克风验证（2026-11-21，Electron 44.10.2）：开发壳录到 `audio/webm;codecs=opus`（约 400ms、5460 字节）。`MediaRecorder.isTypeSupported`：opus、webm、mp4 为真，wav 为假，所以短录音不用 wav。未装权限回调时 `getUserMedia` 仍成功，因为本机已授权给开发用的 Electron。打包配置 `electron-builder.yml` 还没有 `NSMicrophoneUsageDescription`，步骤 2 要给解语包补上，否则安装包弹不出麦克风。桌面 Whisper 只收 wav-pcm16、16kHz、单声道，转码留在步骤 3。
  - 步骤 2 录音存取：只登记文件的发布（不挂词条）、`attachAudio`／`detachAudio`、播放、删除。一次只建一对：语音转写是 `content_type=transcription`、`modality=audio` 的录音层，加上它自己的子文本层（`content_type=transcription`、`modality=text`）；口译另一次再建 `content_type=translation`、`modality=audio` 的录音层，加上它自己的子文本层（`content_type=translation`、`modality=text`）。同一个语段转写层下每类只建一次。新增页面控制器 `useDesktopTranscriptionOralController.ts`（计划见 design.md）。验证：单库 vitest（写→关→重开读回；删除后文件引用清理，见 ADR-0095）、页面 vitest、`npm run typecheck`、`npm run check:architecture-guard`、`npm run test:e2e:desktop-project -- --grep "<用例名>"`。
  - 步骤 3 语音转文字：子层草稿、确认后才写入子层正文并记下模型，不走 `modelRuns`。模型来源写在草稿行上（user_version 33，ADR-0137），关掉再开后保存仍写入；之后再手改正文则清掉来源。本机 Whisper；没有已授权的本机模型就停止，不改走云端。切项目或关闭时取消未完成的转写，不把结果写入。确认沿用已有正文草稿，不另做候选界面。验证：单库 vitest（草稿、拒绝已有草稿、保存后带来源、放弃后不带来源、无模型不写、重启后保存仍带来源、手改后来源消失）+ `oralClipWav` + `npm run typecheck`。
  - 精稿：Pixso 已有 `OralAudio`（`67:2782`）、`OralAudioPlaying`（`69:11999`）、`OralRecord`（`69:12016`），只覆盖录音控件。确认候选不新做界面，转写结果进已有正文草稿。
  - 开工前：步骤 1 结果出来后，在本条补落位与测试并经用户确认。
  - 证据（2026-11-22）：`npm run test:e2e:desktop-project -- --grep "oral clip records"` 1 passed。假麦克风录音、播放、本机模型转写成子层草稿；关掉重开后草稿还在；删除后 `unit_texts.audio_file_id` 与 `attachment_files` 都是 0。
  - #603点击收尾（2026-11-22）：窄卡片按钮保持24px，按钮高于拖柄、控件空白不遮邻卡；`oral clip records` 已改用正常鼠标点击覆盖开始/停止/播放/转写/删除并通过，重开读回草稿、删除清理通过。使用假麦克风与本机协议模拟模型，不作为真实Whisper准确率或安装包验收；配置记忆/长录音归5a，下载/随包/服务与云归第二程#285。
  - 导入录音只建稿件。没有层时，时间轴说明原因并只提供「新建转写层」（DESIGN.md「反馈与阻断」）。
- [x] 层依附关系（[#634](https://github.com/Abe-Junwei/Jieyu/issues/634)）给已有的关联层改宿主：宿主组、首选宿主、链接类型。补 #597 盘点漏掉的旧版「编辑元信息」宿主部分。不改层类型、不改 `layers.parent_id`、不挂旧 popover。证据（2026-11-21）：`npx vitest run src/db/desktop/layerHosts.test.ts src/db/desktop/layerStructure.test.ts src/db/desktop/operationContract.test.ts` 通过（含一种链接类型写到全部宿主链接）；页面 `DesktopTranscriptionLayerHostsDialog.test.tsx`、`DesktopTranscriptionContextColumn.test.tsx` 通过；`npm run typecheck`、`check:architecture-guard`、`check:docs-governance` 通过；`npm run test:e2e:desktop-project -- --grep "layer hosts"` 1 passed。精稿 `88:471` 已对照，帧名已去掉「（待审）」。类型名沿用已有枚举（直译／意译／逐字／教学），不用方案草稿里的「直接／直译」。
  - 旧代码审查（2026-11-21）：入口是 `LayerActionPopoverEditMetadataTranslationStructureSection.tsx`，校验在 `useLayerActionPopoverHandleSaveMetadata.ts`，写入在 `useTranscriptionLayerMetadataController.ts`，环检测在 `LayerConstraintService.detectParentCycle`。写入时宿主整组替换：去重，只收转写层；首选宿主不在组里时回落到第一个；整层用一种链接类型，缺省沿用原首选链接的类型。层、链接与 tier 在一个事务里写入。旧版改宿主不检查已有正文，拆掉宿主后正文会失联。
  - 落位：沿用上面的规则，重写成 SQLite 写操作，不引入旧版 Dexie 类型。新文件 `src/db/desktop/layerHosts.ts`，因为 `layerStructure.ts` 已有 604 行。`createLayer` 里的 `insertHostLinks` 移到这个文件共用。操作有两个：`layers.previewHosts`（只读）和 `layers.setHosts`（一个事务），都经 `operationContract`／`desktopCall`／`client` 露出。页面由 `useDesktopTranscriptionLayerController.ts` 发调用。上下文栏层菜单加「依附关系…」，弹出 `ModalPanel`，含宿主多选、首选宿主、链接类型和影响预览。不进 `edit_receipts` 撤销栈。
  - 范围：只处理 `symbolic-association` 层（翻译层，以及符号关联的转写层）。`time-subdivision` 层的句段必须落在宿主句段内，改宿主会破坏这个约束，本片不放开。
  - 校验：宿主至少 1 个。宿主必须是同稿、未删的转写层，且不是本层或本层的后代：沿 `layer_links` 查环，库里没有防环触发器。首选宿主必须在组内。链接类型取 `direct`／`free`／`literal`／`pedagogical` 之一。指向已删宿主的旧链接保持不动。
  - 有损拒绝（E06）：要拆掉的宿主上如果还有本层的正文（`unit_texts`）或草稿（`unit_text_drafts`），整次拒绝。预览列出各宿主的条数，并提示先清空，或另建新层迁移。库里的正文触发器只挡写入，不挡拆链接，所以这条检查必须在 `setHosts` 里做。新增宿主和只换首选宿主是无损的，直接提交。
  - 排序：首选宿主变了，本层追加到新宿主的从属层末尾（`MAX(sort_order)+1`）。首选宿主不变，保留原 `sort_order`。
  - 验证：`npx vitest run src/db/desktop/layerHosts.test.ts`，覆盖以下情况，每项都关库重开读回：
    - 加宿主后新宿主的句段出现在本层；
    - 换首选宿主后时间轴改挂到新宿主下；
    - 拆有正文的宿主被拒，库里不变；
    - 成环被拒；
    - 非转写层不能当宿主。
    页面 vitest：改首选宿主后层树换位。再跑 `npm run typecheck`、`npm run check:architecture-guard`，以及 `npm run test:e2e:desktop-project -- --grep "layer hosts"`。开工前先用 Pixso 读精稿，在 design 里补「UI 精稿对照」。
- [x] 拖层改归属（issue 待开，不进 #599，不改 #603）侧栏层头和时间轴层头拖拽改宿主；波形轨道仍是语段时间。上下按钮留着。落到转写层头：一条首选宿主链接，排在该宿主最后，不改 `layers.parent_id`。这条链接只改层树位置，不借用宿主的语段。落到翻译层头：仅同一宿主时，上半排到该行之前、下半排到之后，否则拒绝。菜单「回到顶层」和顶部接收区都排到根列表最前。只有一个宿主的翻译层落到转写层头，换成这一个。已有多个宿主的翻译层落到转写层头拒绝，不弹确认，改走宿主弹窗。根缝和 `layers.clearHosts` 只给 `time-aligned` 转写层。翻译层落根缝拒绝，菜单没有「回到顶层」。被拿掉的宿主仍有该层正文或草稿则整次拒绝。类型不弹选择，已有类型带走，没有则 `direct`。宿主弹窗仍只给 `symbolic-association`，且仍要求至少一个宿主。`time-subdivision` 仍拒绝。自己、后代、别的稿、已删层沿用现有拒绝。不进 `edit_receipts`，与 `layers.setHosts` 一样清空句段撤销栈。拖动中不写库；失败、Esc 或指针取消时行回到原位，库不变。
  - 调研：见 design §1「拖层改归属」。结论：适配。指针手势沿用本页，不引入拖拽库，不做 `role="application"` 键盘拖拽。
  - 落位：纯函数 `src/pages/desktopTranscriptionLayerDrop.ts`。写操作仍在 `src/db/desktop/layerHosts.ts`：`setHosts` 的从属层放宽到 `time-aligned`＋`transcription`；`layers.clearHosts` 只接受这类转写层（正文检查相同，根上的 `sort_order` 按缝插入），翻译层调用直接拒绝。同宿主改顺序一次事务改 `layer_links.sort_order` 或根上的 `layers.sort_order`，不连按 `layers.move`。页面用新的 `useDesktopTranscriptionLayerDragController.ts`，`DesktopTranscriptionWorkspacePage.tsx` 只装配。侧栏与时间轴层头起拖，轨道上的 `onPointerDown` 不动。两个面不跨面落下。视觉按 design「拖层改归属视觉」。文案走 `dictKeys` 与 zh-CN、en-US。
  - 验证：`npx vitest run src/db/desktop/layerHosts.test.ts src/pages/desktopTranscriptionLayerDrop.test.ts`。库端关库重开：转写层挂上后仍在目标下，且该层 unit 的 id 与时间与挂之前相同；向该层保存正文仍落在自己的 unit，宿主 unit 的正文条数不变（若路径会误写，则该写入被拒且库不变）；有正文则拒绝且库不变；只有转写层能清空宿主并回到根；翻译层清空或落根缝被拒且链接还在；多个宿主的翻译层落到转写层头被拒且链接还在；细分层仍拒绝。页面：拖动过程中不调用写接口；失败、Esc、指针取消后行回到原位且库不变；菜单「挂到当前转写层」后层树换位；「回到顶层」只对转写层出现。再跑 `npm run typecheck`、`npm run check:architecture-guard`、`npm run check:docs-governance`，以及 `npm run test:e2e:desktop-project -- --grep "layer drag"`。精稿 `90:1` / `91:141` 已审，帧名已去掉「（待审）」。页面已按该稿接上拖层。
  - 进度（2026-11-21）：写路径、投放函数和页面手势已落地。`npx vitest run src/db/desktop/layerHosts.test.ts src/pages/desktopTranscriptionLayerDrop.test.ts src/pages/useDesktopTranscriptionLayerDragController.test.tsx src/pages/DesktopTranscriptionLayerList.test.tsx src/db/desktop/operationContract.test.ts` 通过；`npm run typecheck`、`npm run check:architecture-guard` 通过。`npm run test:e2e:desktop-project -- --grep "layer drag"` 1 passed：松手前不写库，松手后转写层挂到目标宿主，关掉再开链接还在；翻译层菜单没有「回到顶层」，转写层可以回到顶层且翻译层的宿主链接不动。
- [x] 层显示样式（[#599](https://github.com/Abe-Junwei/Jieyu/issues/599)）时间轴层头用「1 · 层头悬停与行缝」（精稿 `101:7498`）：纸面，层名列右缘的分界线在导入音频后通到舞台底，没导入音频和层头折叠时不画；选中层名 14px 半粗，其余 13px 中黑；悬停、按下只铺浅墨；同一组的层之间不画底缝。不挂旧名牌。不挂 `TimelineLaneHeader`。字体族（预设、本地字体搜索与覆盖）、字号、粗体、斜体、重置，以及层高与字号互算。不把 `ProjectOrthography` 断言成 `OrthographyDocType`，无语言层与指定书写体系按 design 的回退。正字法写入 `layers.orthography_id`，且必须属于该层语言，否则整次拒绝、原值不变。不提供、不保存字体颜色。字号、粗体、斜体需要新列并升 `user_version`，另写 ADR，不改 ADR-0126 正文。→ 验证：单库 vitest（写→关→重开读回；错配正字法被拒且原值未变；无语言层；拖层高改字号；改字号改层高；重置；颜色不落库）与页面 vitest
- [x] 分轨与单段指派（[#600](https://github.com/Abe-Junwei/Jieyu/issues/600)）见 design §1「分轨与指派」与 2026-11-22 用户决定。布局 `single`／`auto`／`one-per-speaker` 按稿加层存本机，切换布局不写锁。锁进 `layer_lane_locks`，一次事务先删后写；重复行号或 `speakers` 中无此人则整次拒绝，不查稿件归属。单轨始终一行，重叠时轮换并在层头计数；自动分轨只在重叠处拆行；一人一轨每人固定一行，派生行号不入库。冲突用提示条说明，不写在层上；解开时只删这些说话人的锁。折叠临时展开不持久化。句段右键只指派这一张卡或清除，最近 3 人按本稿句段的最晚 `updated_at`（含正文更新）排序，其余按名字；复用 session edit `assign` 的撤销链路并支持清除。卡片显示名字，`speakerId` 从现有读模型补传到层行。去掉只读页「指派给列出的全部句段」。新建、批量、目录筛选与上下文栏指派留 #566。同层同说话人重叠仍由触发器整次拒绝。不挂 `TimelineLaneHeader`，不接 `useTrackDisplayController`。层控制器已 286 行，锁与布局用 `useDesktopTranscriptionLaneController.ts`，写锁用 `layerLaneLocks.ts`。精稿已在精稿页：自动分轨 `103:1`、一人一轨 `103:469`、单轨重叠 `103:937`、分轨冲突 `103:1405`、说话人菜单 `103:1873`。对照见 design「#600 分轨与说话人」。→ 验证：单库 vitest（锁写→关→重开；重复行号与不存在的说话人拒绝且原表不变；清除后重开；指派与清除可撤销；指派造成重叠则整次拒绝）+ 页面 vitest（三档布局、轮换、冲突标记、菜单最近 3 人、卡片名字）+ `npm run test:e2e:desktop-project -- --grep "speaker lanes"`
  - 进度（2026-11-22）：锁、清除、三档布局、冲突提示条、单卡指派和卡片名字已接上。`npx vitest run src/db/desktop/layerLaneLocks.test.ts src/db/desktop/speakerAssign.test.ts src/pages/desktopSpeakerLanes.test.ts src/pages/DesktopTranscriptionLayerRows.lanes.test.tsx src/utils/speakerLayerLayout.test.ts src/db/desktop/operationContract.test.ts` 通过；`npm run typecheck`、`npm run check:architecture-guard` 通过。`npm run test:e2e:desktop-project -- --grep "speaker lanes"` 1 passed：自动分轨后两张卡分行并显示名字，关掉再开锁还在。
- [x] 1b-2（[#562](https://github.com/Abe-Junwei/Jieyu/issues/562)）边界：默认单边、Shift 联动、吸附、键盘微调、拖动预览、非法回退、同层同说话人（同一子轨）重叠／媒体范围拦截、撤销重做；新建与删除单段（复用 `createUnit`／`deleteUnitTree`）；时间码框半成品按 E02 存草稿、不回退。选中拖柄精稿已有，不另补。写入已落：`unitEdges.ts`、`unit_time_drafts`（user_version 30，ADR-0128）、按稿件撤销和重做。页面已接：选中拖柄、拖动预览、吸附提示、时间码草稿、共用边界、删除确认。→ 验证：页面 vitest 已过。收口补齐（[ADR-0129](../../../adr/0129-edit-receipts-and-undo-guard.md)，user_version 31）：编辑回执 `edit_receipts`（E01，回复丢失先查再按同一 id 重发一次）、撤销遇后续修改留栈并可显式放弃（E04）、时间码草稿基准冲突并排显示与按新时间重验（E02）、改时间不失效任何对象的守护测试（E03）、`E` 切换当前边界、波形上拖动新建、库端删除预览与 `ModalPanel` 确认。`modelRuns.test.ts` 里越出 8 秒媒体的新建段已改到 2–3 秒，`npx vitest run src/db/desktop/modelRuns.test.ts` 9 passed。`npm run test:e2e:desktop-project` 15 passed、3 skipped；其中 `transcription edge writes survive close and reopen` 经 Electron 写入共用边界、单边、新建、时间码草稿、删除并查询新建回执，关闭后重开读回，删除回执重开后仍为已提交。选段加空格播放不作为本项写入证据。现已整合到 `feat/desktop-shell-rail`，以集成构建验证结果为准；#562 已于 2026-11-20 关闭。E03 决定（2026-11-20）：库里没有依赖语段时间的对象，改时间不标待复核，保留 ADR-0129 第 6 条与 `schema.test.ts` 守护，将来出现此类对象时同一次改动接失效。#614 补测：细分卡方向键与时间码框、拖父段边界时的子段跟随提示均有 e2e，删除预览的关联层文本数有库端测试。波形区拖语段边界已补（#614）：主行选中卡的波形段左右缘出把手（单边，Shift 联动共用边界，Alt 关吸附）、顶部抓条整段平移并带走子段（`units.moveUnit`，一次事务、一步撤销，越出媒体、父段或同说话人相邻段被拒）；e2e `waveform handles resize…` 通过。调研结论：ELAN／Audacity 均以边缘把手加整体拖动，wavesurfer RegionsPlugin 的交互在桌面端关闭（`regionsInteractive: false`），故沿用旧版把手外观、自绘覆盖层复用现有边界控制器。平移时子段不做实时预览，松手后随动。选中段的整个波形区也可拖动平移；在已选中的段内再点一下，播放头落到点击位置；框选多个段时全部高亮（首段为主段，边界与键盘仍只作用于主段）
- [x] 行内正文（[#601](https://github.com/Abe-Junwei/Jieyu/issues/601)）选中后再点进入正文：光标、失焦保存、Esc 还原并退出；空正文留草稿。确信度不在本片改。→ 验证：页面 vitest 14 passed（2026-11-19 补输入法组字结束保存用例后）；`npm run test:e2e:desktop-project` 14 passed、3 skipped（转写页选段并空格播放通过）
- [x] 1b-2R（恢复旧版跨层拖建与正文投影；新开工切片；PR [#609](https://github.com/Abe-Junwei/Jieyu/pull/609)）：
  - 格式：user_version 31 → 32；`unit_texts` 按 `(unit_id, layer_id)` 唯一，显式 `layer_links` 支持一个文本层链接多个宿主层及 preferred host；`unit_text_drafts`、编辑回执和撤销身份按 `(unit_id, layer_id)` 隔离。严格拒绝非 v32 格式、不迁移。
  - 读写：一个时间 unit 共享时间／说话人；关联文本层读取同一 unit，只读自身 layer 的正文；缺正文行显示空白并可编辑，首次非空保存才建记录；保存、flush、离开守卫、retry 与 undo 全链路不得跨层覆盖。读取、导入导出和清理路径覆盖层身份。
  - 路由：适配 `useLasso`、`createUnitFromSelectionRouted`、`resolveSegmentTimelineSourceLayer` 与旧版投影匹配；波形以活动文本层为目标、无指定时默认转写层；符号层按旧宿主路由，时间细分完整包含于父段并继承 speaker，独立边界层只在自身为目标时建段；文本轨按光标所在 speaker lane 创建。
  - 手势：空白处开始，拖过已有语段进入选择；只有无命中空白拖动创建；最短 50ms，不影响既有 10ms 边界编辑；同 speaker 不重叠，异 speaker 可重叠；波形与文本轨共用一套路由和库端校验。删除仍列出下级并确认。
  - 视图：多层卡片共用 unit 时间／speaker，正文按层显示；空白可编辑但不落空记录；折叠层保留名称与段数；连接线只根据显式 layer link 显示。按 Pixso `19:6187`、`67:2846`、`19:12433` 对齐标准态、收起与连线、多选态。
  - 落位：v32 schema、`layers.ts`／`units.ts`／`textSave.ts` 与 project read/exchange/purge；纯路由和创建 controller 分离；页面只装配，`useDesktopDraftGuard.ts` 不超过 300 行；不得改其他会话的 token、设计资产或转写工作区 CSS。
  - 验证：定向单元测试覆盖多宿主 preferred/fallback、时间细分越界拒绝、拖过已有段转选择、按 speaker overlap、空投影首次保存、同 unit 双 layer 草稿／正文／回执互不覆盖；数据库写入后关闭重开读回。再跑 `npm run typecheck`、相关 `vitest`、`npm run check:architecture-guard`、`npm run check:docs-governance`、`npm run test:e2e:desktop-project`；若改共享旧组件 props，再跑 `npm run test:e2e:chromium`。
  - 安全门禁：波形和文本轨创建入口仅在上述单库读回与 Electron 流程均通过后一起开放；未完成时保持关闭，其他编辑不受影响。
  - 进度（2026-11-20）：格式、读写、路由、手势与多层行已落地，两个拖建入口已开放。证据：`npm run typecheck` 通过；相关 vitest 458 通过／1 跳过；`check:architecture-guard`、`check:docs-governance`、`check:desktop-format-freeze` 通过；`npm run test:e2e:desktop-project` 17 通过（含「波形与关联层行拖建、正文按层保存」真实手势用例）。层树落地（2026-11-20）：层名列 148px 的缩进（三级）／连线／圆点、非首选宿主虚线侧轨与节点悬停提示、宿主组收起、单层收起为窄条、层头折叠（`desktopTranscriptionLayerTree.ts`、`useDesktopLayerView.ts`；本机视图偏好），页面与 hook vitest 覆盖。移出本片（2026-11-20）：关联层行卡边缘拖动与菜单 → [#611](https://github.com/Abe-Junwei/Jieyu/issues/611)（2026-11-21 已在 #611 分支落地：把手、右键菜单、子段随动及实时提示、细分卡右键菜单与方向键／时间码框）；多选态（`19:12433`）→ #566；speaker lane → #600；拆分／合并时关联层正文 → #563／#564。
- [x] 1b-3（[#563](https://github.com/Abe-Junwei/Jieyu/issues/563)）拆分：时间切点 + 文字位置、预览、双新 id 与映射、跨切点分析待复核、回执与整步撤销。调研（2026-11-22）：Praat 按文本光标分正文，ELAN 在指定时刻拆开；身份、引用和撤销只按 ADR-0122 第 10 条与 E06，不沿用二者的左段旧 id，也不把 ELAN 正中拆的「两边同一原文」写进来。结论：适配。不新增依赖，不升 `user_version`。不调用 `deleteUnitTree`（它会清掉候选、批次、采纳、草稿和文本回执，也不处理没有外键的 `parent_unit_id`）。
  - 写入顺序：先把旧行 `start_ms`／`end_ms` 同时置空（两端皆空符合 CHECK；`units_same_speaker_no_overlap_insert` 与 `units_aligned_order_insert` 在起点为空时不检查）。旧行还占着 `UNIQUE(layer_id, sort_order)`，先把它的 `sort_order` 挪到层尾，再插入新左、新右。然后搬依赖，最后删旧行。撤销反过来：先把两条新段的时间置空并挪开 `sort_order`，插回旧行，依赖指回旧 id，再删新段。
  - 新行的列：`layer_id`、`speaker_id`、`parent_unit_id`、`skip_processing`、`self_certainty` 两侧都复制。`confidence` 两侧清空（它是原区间的模型分，切开后两侧都不是被打分的那段）。`analysis_generation` 与 `graph_fingerprint` 跟着图：图留在左段时只写左段，右段是 `0` 和空指纹；图卸下时两侧都是 `0` 和空指纹，原值在快照里。
  - 正文：只有发起拆分的那一层按切点切开。该层左段沿用原 `unit_texts.id`，只改 `unit_id` 和正文；右段用新 id。切点在 0、左段正文为空时不留空行，原正文行 id 改挂新右段。切点在末尾时右段不建行。`audio_file_id` 留在仍持有原行 id 的那一侧，不复制。其它层（含翻译层）整段留在左段；确认框写明这一点。
  - 备注：锚在整段上的改到新左段。锚在正文行上的跟着该 `unit_texts.id`（因此切点在 0 时跟去右段）。锚在词或语素上的：图保留时保持 `active` 并改到新左段；图卸下时标 `detached`，id 保留，`unit_id` 改到新左段。锚在分析节点上的同样：图保留则跟着图走，图卸下则标 `detached`。
  - 图：能不能留，看本段自己那层 `role = 'transcription'` 的正文（`analysisCandidates.ts` 的 `MATERIAL`），不看发起拆分的层。从翻译层拆时转写正文整段在左，图可以留。拆完后该转写正文等于 `graph.text`，且这一层没有分到右段，整图、词、语素、结构边改挂新左段，id 不变。否则不把旧图写入左段的 `analysis_graph_json`（`validateAnalysisGraphPayload` 要求 `graph.text` 等于段正文）。新左段插入后，用拆前捕获的材料写 `review-snapshot`，再按改正文的现成路径卸下投影。没有图就不写快照。词没有句内字符位置，不按 `token_index` 猜到右段。
  - 子段：终点 `<=` 切点的归左，起点 `>=` 切点的归右，只改 `parent_unit_id`。跨切点的按本片递归成双新 id，没有光标，正文整段留在它自己的新左段；切点离它任一端不足 10 毫秒则整次拒绝。子树里有无时间的段也整次拒绝。
  - 草稿与回执：预览字符串依次取未提交缓冲、该层草稿、正式正文。确认时重读；基准变了就冲突，不写。发起层草稿被消费。其它层草稿整行到左段。`base_body` 已和正式正文不一致，或时间草稿的 `base_ms` 对不上要去的那一端，整次拒绝。对得上的起点草稿到新左段，终点草稿到新右段。`text_save_receipts` 只把 `unit_id` 改到新左段。`units.split` 增加 `operationId` 与切点载荷，走 `withEditReceipt`；`EditReceiptKind` 与 `EDIT_METHODS` 同时加上 `split`。同一 id、同一摘要返回已存的左右 id。
  - 撤销与重做：撤销载荷记下左右 id 和拆前行。重做沿用这对 id，映射仍用原来那次的 `operation_id`，不再 `randomUUID`。过期判断沿用 `splitStillAfter` 的集合比对，范围是两条新段加上它们的依赖（正文、说话人、时间、草稿、备注、分析、以及以它们为父的子段）。多了或少了都拒绝。
  - 落位：`src/db/desktop/unitSplit.ts`（从 `unitSpan.ts` 拆出；合并留到 1b-4）。页面用 `useDesktopTranscriptionSplitController.ts`，只装配。入口是句段菜单和已有的 `splitSegment`。时间用段内播放头，距边不足 10 毫秒只提示。预览用 `ModalPanel`，确认才写。
  - 验证：`npx vitest run src/db/desktop/unitSplit.test.ts`（现有「右边正文等于整段」的断言改成按切点切开；关库重开）。覆盖触发器顺序、切点在 0 时正文行 id 跟去右段、翻译层发起时图仍在、回执丢失重试不产生第二对 id、草稿冲突不写、跨切点子段递归、重做沿用原 id、新段上加了备注或改了说话人则撤销拒绝。再跑 `npm run typecheck`、`npm run check:architecture-guard`，以及 `npm run test:e2e:desktop-project -- --grep "split unit"`。
- [ ] 1b-4（[#564](https://github.com/Abe-Junwei/Jieyu/issues/564)）合并：同稿同层同说话人相邻、显示空隙、确认正文分隔（记 `project.settings_json`）、下级保留与冲突阻断（EF-018）、新身份与映射、撤销 → 验证：同上
- [ ] 1b-5（[#565](https://github.com/Abe-Junwei/Jieyu/issues/565)）点层：增删改移、同层同毫秒唯一 → 验证：同上
- [ ] 1b-6（[#566](https://github.com/Abe-Junwei/Jieyu/issues/566)）其余入口：多选（批量改说话人、批量删除、多段一次合并）、说话人与备注、修改确信程度、说话人目录筛选（FR-032）、部分转写（FR-066/068）、馆藏音频手动定位（FR-082）。单段指派与清除已改到 #600。本片仍做批量改说话人、新建说话人、说话人与备注、目录筛选；上下文栏的指派留在本片 → 验证：同上
- [ ] 1b-7（[#584](https://github.com/Abe-Junwei/Jieyu/issues/584)）无录音文稿与逐段补时间：按顺序和字数排版、只按文字位置拆分、部分对齐夹在前后已对齐段之间；合并一有一无则结果无时间并在确认框说明；两段都没有时间的相邻合并也留在本片；解除录音关联保留已有时间和点。表结构不在本片 → 验证：同上
- [ ] 自动分段（[#604](https://github.com/Abe-Junwei/Jieyu/issues/604)）沿用现有 VAD（FR-072）：仅在当前转写层空白区间生成新段（严格 0 ms 不重叠、不改已有段），整批一次事务提交并作为同一步可撤销，失败有提示。依赖 1b-0 毫秒与 1b-2 新建／撤销 → 验证：单库与页面 vitest + 桌面流程（写→关→重开读回）
- [ ] 旧页台账关账（[S7 对照](../desktop-legacy-isolation/tasks.md#s7-台账关账对照)）：`scripts/old-path-exit.record.json` 的 `features` 中 `home`、`transcription`、`language-metadata`、`orthography`、`orthography-bridge` 改为 `ported`，填桌面测试与决定；旧测试的业务断言在桌面测试里有对应 → 验证：`npm run check:old-path-exit`
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
