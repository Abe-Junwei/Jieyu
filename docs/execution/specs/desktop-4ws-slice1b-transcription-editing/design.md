---
title: desktop-4ws-slice1b-transcription-editing design
doc_type: execution-spec-design
status: active
owner: repo
last_reviewed: 2026-11-23
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
- **拖层改归属（2026-11-21）**：旧版 `LayerOrderingService.resolveLayerDrop` 拖的是层。翻译层换首选宿主链接，转写从属层写 `parentLayerId`。桌面层树先认首选 `layer_links`，只写 `parent_id` 不会把转写层挂到目标下面。ELAN 的层名拖拽只在分组内改显示顺序，不改依存。WAI-ARIA 无拖放模式，`aria-grabbed` 已废弃；用 `role="application"` 抢方向键做键盘拖拽是已知的坑。WCAG 2.5.7 要求拖拽能用单击完成。HTML5 拖放在嵌套落点上不可靠。`dnd-kit`、React Aria 能做树拖放，但是新依赖；本页层高和语段已经用指针事件。
- **决定：适配**。指针拖拽沿用本页手势，落下交给纯函数，写入沿用 `layers.setHosts` 的校验。不引入拖拽库，不做第二套键盘拖拽。顺序仍用上下按钮。改归属在层菜单里有一次单击，与拖拽走同一条写路径。回到顶层只给转写层。
- **分轨与指派（2026-11-22）**：ELAN 一层内不能重叠，不同说话人做成不同层（[User Guide ch.3](https://www.mpi.nl/corpus/html/elan_ug/ch03.html)）。这和 ADR-0126 相反。排轨只有 `buildSpeakerLayerLayoutWithOptions` 的两条路径：`multi-speaker-fixed` 固定行，其余走分组。`useTrackDisplayController` 在有重叠时把 `single` 改成 `multi-auto`（约 57–63 行），并把一人一轨算出的行号写回锁（约 125–136 行）。桌面 `layer_lane_locks` 会留下这些行号，所以不接这个控制器。旧页「最近说话人」按出现次数取前 3；本片改按本稿句段最晚的 `updated_at`，改正文也会把该人提前。桌面 `speakers.assign` 已进 session edit，可撤销；它要求说话人存在，清除要另写。说话人徽章在 `timeline-annotation.css` 里是 `display: none`，桌面 `speakers` 没有颜色列。
- **决定：适配**。三种布局加明确的锁。指派只搬旧菜单里「指派给已有说话人」和「清除」，走现有 session edit。不新增依赖，不升 `user_version`。

## 2. 架构选择

- 用户决定（2026-11-17）：点层进第一程且 v29 带表结构；1b-6 全部留第一程；旧库只有合成项目，直接拒绝、不做迁移工具；新建／删除单段复用现成实现；合并分隔偏好存 `project.settings_json`（不改表）；其余交互取值见 requirements §3。
- 用户决定（2026-11-18，[ADR-0122](../../../adr/0122-integer-milliseconds-and-optional-media.md)）：库和桌面接口都用整数毫秒并改名；录音时长保持秒；删掉逻辑时长和文稿映射，换录音用一次性整体调时；文稿可以不挂录音，句段按 `sort_order` 排，时间可空，允许部分对齐；点必须有时刻，解除关联时保留点和句段时间；一有一无的合并结果无时间；库只要求至少 1 毫秒，界面拖动和拆分用 10 毫秒下限。表结构在 1b-0，无录音界面为 1b-7。
- 用户决定（2026-11-19，[ADR-0127](../../../adr/0127-shared-waveform-region-controls-use-theme-paint.md)）：选区动作按钮和速度滑杆采用主题色实底。这两处类是共享的，旧转写页跟着改。波形选区、波峰、语段块和全稿概览不在这次里。
- 用户决定（2026-11-19 排期审查）：1b 新排期所需的全部表列在 1b-0（v29 新 ADR）一次建齐（`units` 补 `skip_processing`／`confidence`／`self_certainty`，`layers` 补 90 天软删三列／`modality`／轨高与字体展示列，新建 `layer_lane_locks` 子表，`unit_texts` 关联 `attachment_files(id)` 存口译短录音，`settings.ts` 放行合并分隔符键）；同层内仅同说话人（或均未标说话人）禁重叠，不同说话人允许重叠并分轨；口译 STT 本机 Whisper 优先、云端守 E11 授权且转出文本走候选待确认；VAD 自动分段只填空白区间（0 ms 不重叠）并整批同事务一步可撤；多层视图（#598）排在层结构（#597）之前，分轨（#600）用预置多说话人种子验收。

- 状态：选择、媒体、视口、草稿四块受控状态放 controller，Query 只放已保存数据（沿用 slice1 design §8）。
- 用户决定（2026-11-19）：恢复旧版多层正文投影，而非只创建当前显示层的简化实现。一个时间 unit 共享时间与说话人，`unit_texts.layer_id` 存各文本层正文；空正文按需创建，不为所有匹配层预写空行。正文草稿、正式保存、回执和撤销按 unit + layer 隔离。保留翻译层对多个宿主转写层的显式链接；`layers.parent_id` 仅表达结构父子，不能替代匹配链接。
- 用户决定（2026-11-19）：波形创建目标取活动文本层，没有明确活动层时默认转写层；关联层只按旧路由匹配。独立边界层仅在被选为目标时建段；时间细分要求新范围完全落在一个父段内并继承说话人。文本轨道拖选创建到指针所在说话人轨；同说话人不重叠、异说话人可重叠，沿用 E06，不复用旧版 20ms 邻段空隙。拖建最短 50ms；其余编辑仍按 10ms。
- 用户修正（2026-11-22）：波形拖建只写当前选中的时间对齐转写层，不再受旧文本卡片焦点覆盖；文本行拖建仍以指针所在行为目标。切层查询未完成时保留旧画面但阻止波形建段并提示稍候，明确目标层已不存在时拒绝写入，不回退写入第一层。Electron 临时项目复现了旧文本卡片焦点导致新段写进原宿主层，并以选中层及原宿主层的数据库回读锁定修复。
- 用户决定（2026-11-23，#563）：拆分把句段上的自定义字段复制到左右两个新段，同一份 JSON，引用仍指向原对象。[ADR-0097](../../../adr/0097-desktop-write-entry-initialization-and-reference-identity.md) 要求每个新段通过必填校验，缺了整次拆分回滚，所以不能只改挂到左段。跨切点子段自己那层的正文草稿整行跟到它的新左段，不按发起层消费。撤销后把该层排在原 `sort_order` 之后的句段序号减一，不留空号。
- 用户决定（2026-11-23）：新建层和每行的上移、下移、改名、删除不放在侧栏列表。它们在时间轴层头右键菜单的「新建层」和「层」里。精稿 `40:1407` 仍把新建层画在列表末两行、把三点菜单画在每行右侧；落地以这个决定为准。
- 用户决定（2026-11-23，#564）：合并按 tasks.md 的 1b-4。新身份；下级只改挂，仅约束冲突才拒绝。各层正文按时间拼接，一个 `mergeSeparator`。两侧正文都空时不写内容，但仍有录音或行级备注锚点则保留载体行；空正文保存和撤销分析也不删有录音的行。分析不能留下时，先分别捕获活动图再写成复核快照，然后才清投影。自定义字段冲突整次拒绝。确认框固定两段和录音条目，事务内核对完整基准，不单看文稿 generation。一行最多 5 条录音，表为 `unit_text_audios`，归属 `unit_text_id`，外键 `ON DELETE CASCADE`。同一个文件只留较早那条。删条后 `position` 分两步重排。会话撤销账本仍引用的文件不得物理清理；扫描发生在会话结束、打开项目和清空重做栈之后。只读页去掉合并。34 版项目打不开，不迁移。升 `user_version` 35 的 ADR 与 schema 同一次写完，上述规则写进该 ADR。多段合并与无时间合并不在本片。
- **数据适配**：当前桌面格式为 v31，`units.layer_id` 是区间所属结构层，`unit_texts` 和 `unit_text_drafts` 目前均按 unit 单键；v32 增加 `unit_texts.layer_id`、显式 `layer_links` 及复合文本草稿／回执身份。按 ADR-0086 严格拒绝旧格式、不迁移；只在合成项目上验证。
- 动作：`onSelectUnit`、`onSeek`、`onRequestEdge`、`onRequestSharedBoundary`、`onRequestSplit`、`onRequestMerge`、层与分轨操作、口译录音与候选、点层增删改；展示组件不直接 `desktopCall`。
- 拒绝：在 `useDesktopProjectReadController` 上继续加；一个大 controller 承担全部编辑（会过 300 行，按职责拆分为媒体、选择、层与分轨、口译录音、边界拆合与自动分段）。
- 用户决定（2026-11-22，#600）：布局是 `single`、`auto`、`one-per-speaker` 三档，按稿件加层记在本机，不进项目库，不加列。锁只写用户明确提交的说话人，进 `layer_lane_locks`；一人一轨画出的行号不写回。单轨有重叠时仍保持单轨，卡片轮换，层头标出重叠处数，不自动改布局。自动分轨只在重叠处拆行，并遵守用户的锁。一人一轨每人固定一行，锁指定的行优先，显示行号是派生值。锁定不改布局。两个说话人要同一行号，或说话人在 `speakers` 中不存在，整次拒绝、原表不变。说话人表没有稿件归属，不另做「属于这篇稿」的检查；一次事务里先删后写。锁住的行当时被占，用提示条说明，不写在层上。解开时只删这些说话人的锁，不删同层其他人的。折叠时临时展开只是当次界面状态。句段右键把这一张卡指派给已有说话人，或清除；先列本稿最近 3 人（按该人句段最晚 `updated_at`），其余按名字。走现有 session edit 的 `assign`，一步可撤销；清除把 `speaker_id` 置空，也走同一撤销路径。造成同说话人重叠则整次拒绝。卡片上写出说话人名字。`speakerId` 已在读模型里，名字用 `speakers.list` 对上。只读页「指派给列出的全部句段」去掉。新建说话人、批量改说话人、目录筛选与上下文栏指派留 #566。不挂 `TimelineLaneHeader`，不接 `useTrackDisplayController`。
- 用户决定（2026-11-21，拖层改归属）：不进 #599，不改 `layers.parent_id`。侧栏层头和时间轴层头都能拖；波形轨道仍是语段时间。落到转写层头上，写成指向它的一条首选宿主链接，排在该宿主最后。只有一个宿主的翻译层可以这样换。已有多个宿主的翻译层落到转写层头一律拒绝，不弹确认，改走宿主弹窗。落到翻译层头上，只有同一宿主才排到那一行，否则拒绝。根缝和 `layers.clearHosts` 只接受 `time-aligned` 转写层：清空它的宿主链接，并按该缝回到根。翻译层落到根缝一律拒绝，菜单不提供「回到顶层」。符号关联层没有宿主就没有句段可读，#634 的「至少一个宿主」保持不变。转写层的这条链接只表示层级组织：`listUnits` 与新建仍用该层自己的 unit，不改读宿主的语段。`unit_texts` 触发器允许把一层的文字写到链接宿主的 unit 上，所以挂上宿主之后，转写正文仍只能写进自己的 unit，不能写进宿主的 unit。被拿掉的宿主若还有该层正文或草稿，整次拒绝。类型不弹选择：已有就带走，没有就写 `direct`。宿主弹窗仍只给翻译层。`time-subdivision` 仍不放开。自己、后代、别的稿、已删层沿用现有拒绝。上下按钮留着。拖动过程中不写库。失败、Esc 或指针取消时预览撤掉，行回到原位，库不变。

## 3. 落位清单

| 文件                                                                        | 职责                                                                                                                                                                                                | 估计               |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `src/db/desktop/timeMs.ts`                                                  | 秒↔毫秒换算与取整（唯一入口）                                                                                                                                                                       | < 80               |
| `src/db/desktop/schema.ts`                                                  | v29 既有毫秒列、点层、拆合映射、句段样态／确信度列、层软删与外观列、`layer_lane_locks`、口译附件关联；v32 增加 `unit_texts.layer_id`、显式多宿主 `layer_links`、layer-scoped text drafts / receipts | DDL                |
| `src/db/desktop/layers.ts`                                                  | 层读路径携带链接关系；显式关系读写和同稿校验                                                                                                                                                        | < 300              |
| `src/db/desktop/units.ts`                                                   | 按显示层解析宿主语段；正文按 layer 读写，空投影不预建                                                                                                                                               | < 300              |
| `src/db/desktop/textSave.ts`                                                | 草稿、保存、回执、冲突与撤销按 `(unit_id, layer_id)` 隔离                                                                                                                                           | < 300              |
| `src/db/desktop/unitEdges.ts`                                               | 单边、共用边界、同说话人防重叠校验、批量新建与撤销                                                                                                                                                  | < 300              |
| `src/db/desktop/unitSpan.ts`                                                | 拆分／合并按 E06 改写（文件已 1094 行，改写时拆出）                                                                                                                                                 | 降行数             |
| `src/db/desktop/points.ts`                                                  | 点层读写                                                                                                                                                                                            | < 200              |
| `src/pages/useDesktopTranscriptionMediaController.ts`                       | 媒体、播放、视口                                                                                                                                                                                    | < 220 / < 8 hooks  |
| `src/pages/useDesktopTranscriptionSelectionController.ts`                   | 选择与定位请求                                                                                                                                                                                      | < 150              |
| `src/pages/useDesktopTranscriptionLayerController.ts`（计划，后续切片）     | 多层读取装配、层 CRUD／软删、层高与字体。分轨锁定不放这里（已近 300 行）                                                                                                                            | < 280 / < 10 hooks |
| `src/db/desktop/layerLaneLocks.ts`                                          | 一层的锁一次事务先删后写；重复行号、说话人不存在则整次拒绝                                                                                                                                      | < 160              |
| `src/pages/useDesktopTranscriptionLaneController.ts`                        | 本机三档布局、锁的写入与冲突清除。页面只装配                                                                                                                                                        | < 200 / < 8 hooks  |
| `src/pages/desktopTranscriptionLayerDrop.ts`                                | 拖层落点：改归属、同宿主改顺序、回到根，或拒绝                                                                                                                                                     | < 120              |
| `src/pages/useDesktopTranscriptionLayerDragController.ts`                   | 层头指针拖拽与层菜单单击，只发已有写调用                                                                                                                                                            | < 180 / < 8 hooks  |
| `src/pages/useDesktopTranscriptionOralController.ts`（计划，后续切片）      | 口译短录音（附件 CAS）与 STT 候选采纳                                                                                                                                                               | < 250 / < 10 hooks |
| `src/pages/useDesktopTranscriptionEditController.ts`（计划，后续切片）      | 边界／行内草稿／拆合／点层／VAD 批量分段动作与回执                                                                                                                                                  | < 300 / < 12 hooks |
| `src/pages/desktopTranscriptionCreateRouting.ts`                            | 纯层路由：目标层、旧版宿主选择、父段和说话人规则                                                                                                                                                    | < 200              |
| `src/pages/useDesktopTranscriptionCreateController.ts`                      | 桌面 unit 创建、selection hit-test、一次性 receipt 与读回                                                                                                                                           | < 260 / < 10 hooks |
| `src/pages/DesktopTranscriptionLayers.tsx`                                  | 多层只读装配与每层受控文本轨；页面仅装配                                                                                                                                                            | < 240              |
| `src/db/desktop/projectRead.ts`、`projectExchange.ts`、`manuscriptPurge.ts` | 按层正文／链接的读回、交换与清理                                                                                                                                                                    | focused            |

约束：守卫 `rules.desktop.mjs` 300 行；页面只装配；面板 CSS 最多两层边框。

## UI 精稿对照

2026-11-23 MCP 重读句段菜单 `19:11830`：合并入口和确认框外观沿用既有稿。获取合并预览前等待当前文字保存结束，避免输入框失焦或自动保存把本次确认误判为过期；保存失败或输入法组字未结束时不打开预览。确认框内文字变更后的刷新也先等待保存，数据库后续变更仍按基准拒绝。 本次允许既有合并 controller 接近 300 行阈值，只加入保存等待、不扩职责；下次扩展前先将纯比较函数移入现有 `desktopTranscriptionMerge.ts`。

2026-11-23 MCP 重读 `19:12433` 转写交互精稿。按用户确认的命中规则修正缩放浮层：保留原热区范围来触发显示，透明容器与控件空隙不拦截波形语段点击；只有按钮、滑条自身接收指针，键盘聚焦时仍显示。

删除句段确认框沿用现有 `#611` 对照；若删除预览没有关联内容，正文只说明删除本段与撤销身份，不提示下级内容。预览有非零计数时才提示并列出关联内容。

2026-11-22 MCP 核对 `19:12433`：波形框选多段后，菜单显示“已选 2 段”，删除项为“删除 2 个句段”。当前实现复用现有删除确认框，按所选段总数说明影响；同层批量删除在单一 SQLite 事务和单步撤销中完成，任一段不可删除时整批回滚。

2026-11-22 MCP 重读口译录音控件 `67:2782` / `69:11999` / `69:12016`：按钮保持24px命中尺寸；窄语段控件组不得压缩或向左挤入层头，操作按钮位于语段拖柄之上，空白控件容器不提层遮挡相邻按钮。已保存的口译没有正文，仍与空白槽同属空卡片；删除按钮把已保存的卡片留在空白槽之上。Electron用正常鼠标点击验收，禁止DOM click绕过命中。

2026-11-22 MCP 重读 `90:1`（01 转写 · 交互 · 拖层）：沿用已审颜色、蚂蚁线和宿主内框；修正外层源块层叠，补活动拖动失焦取消、菜单共用写入锁，以及展开渲染后的双面最近距离定位。顶层接收区侧栏至少 36px、时间轴至少 54px；禁用原因同时提供悬停标题和辅助技术描述。

2026-11-22 再核对 Pixso `90:1`：按新产品规则，能独立建段的时间对齐转写层不再接受宿主，因此不显示其“挂到当前转写层”菜单项，也不能拖到另一转写层头上。译文依附与同宿主排序仍沿用精稿。旧项目中的转写宿主链接暂保留读回；“回到顶层”继续用于安全解除旧链接，避免自动清理时丢失关联正文。

| Pixso 画板                                                                         | 精稿事实                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | 落地约束                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `01 转写 · 样态 · 标准`（`19:6187`）                                               | 波形与标尺共用水平时间轴；转写与翻译文本卡片纵向堆叠，卡片起止边界对齐；空翻译卡可编辑。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | 多层读取同一 unit 的时间区间，各自只显示本层正文；空文本是可编辑占位，不落空记录。                                                                                                                                                                                                                                                                                            |
| `01 转写 · 样态 · 收起与连线`（`67:2846`）                                         | 收起层仍以一行保留名称和段数；层连接关系作为显示状态，不改变时间轴数据。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | 折叠只影响展示；连接来源是显式 layer link，不能从 `parent_id` 推断翻译宿主。                                                                                                                                                                                                                                                                                                  |
| 层树与层头折叠（`81:2020`、`81:2527`、`81:3901`、`81:4474`）                       | 层名列 148px，每级缩进 16px（视觉最多三级），竖线与折线表示关系、圆点表示节点；多宿主层只有一个点，挂在首选宿主下；其他宿主用虚线侧轨连到该层（最多 3 条，超出记「+N」），虚线子端不再加点，宿主端加环；折叠钮在层名列最右独立槽（收起后「+N」为全部后代数）；层头折叠用 200ms 宽度过渡（同上下文侧栏），折叠后层名列留 16px 竖条作展开钮（通高、右侧细分隔线），标尺刻度、波形与轨道从竖条右侧起，不被遮挡；悬停／聚焦／已收起时显示；单层可收为 28px 窄条（展开／层名／段数），层名列收起层名，但通往该层的节点与连线保留；层头可整体折叠为 0 宽，波形、标尺与轨道左缘始终对齐。 | 树由显式 `layer_links` 的首选宿主构建，深度优先、子树紧随宿主，不被同级隔断；非首选宿主画虚线侧轨，不改变位置；节点不弹出依附说明；折叠是按稿件存本机的视图偏好（`localStorage`），不写项目、不入撤销；折叠的层若含焦点或正在编辑，先保存草稿再把焦点交给宿主；对齐只靠 `.desktop-tx-workspace` 上的 `--lane-label-width`（148px／折叠 16px）。 |
| `01 转写 · 交互 · 多选`（`19:12433`）                                              | 命中段的拖动表现为多选，选中摘要和批量菜单出现；已有段不能因从波形跨过而误建新段。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | 无命中空白拖动才创建；拖过既有卡片转入选择；保留现有多选入口，不以创建覆盖选择。                                                                                                                                                                                                                                                                                              |
| `01 转写 · 交互 · 拖建预览`（`81:1`，说明 `81:481`）                               | 波形选中段为透明主题色底、无描边；同时间范围的波形与目标轨拖建预览使用蚂蚁线；转写与翻译只保留一张焦点卡。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | 按 [ADR-0133](../../../adr/0133-desktop-transcription-range-and-create-preview.md) 区分已有选区、焦点和未提交预览。当前 Electron 尚未实现选区波峰分段着色、文本轨发起拖建时同步显示波形预览。                                                                                                                                                                                 |
| 关联层行边缘与菜单（#611：`81:1076`、`81:4726`、`81:5192`、`81:5615`、`19:15922`） | 选中卡左右缘出把手；右键只列联动共用边界（当前段没有相接邻段时不显示）、清空「层名」文本（即只删该层该句段，无删除整段项），合并与选区、备注、确定度、说话人留给 #564／#566，不画灰项；父段边界向内拖时子段起止随动（拖动提示，外观同设计系统 Tooltip；拖动中实时预览）；「词」等细分卡右键只列联动共用边界、清空「层名」文本、删除本子段；点细分卡只把它设为边界目标（不改选中句段），方向键、时间码框与草稿作用于该子段并限在父段内；子段拖出父段被拒（红色提示「不能超出上级语段」）。                                                                                                                                                                                                              | 关联文本层与宿主共用 unit，拖把手即移宿主段边界、两层同移；时间细分子段由 `units.moveEdge` 限在父段内、父段内推时子段被夹并同事务记入撤销（一步撤销全部）；清空只写本层空正文（可撤销）；主行删除句段的确认框列出关联层文本数等；删除本子段只删该子段，不动宿主与其他层（可撤销）；父段仍有子段时拒删，先删子段。                                                             |
| 波形区语段把手（#614 补，沿用旧版把手外观并按当前风格适配；暂无独立 Pixso 画板）   | 选中主行的段在波形上左右缘各一条 6px 把手（悬停／选中显示品牌浅底，`col-resize`），顶部 14px 抓条（`grab`）整段平移；提示与文本行一致（吸附、Shift 联动、Alt 关吸附）。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | 把手只出现在主行已定时语段；拖动预览复用虚线预览卡，平移时文本行卡片同步跟随；松手写库，非法回退。                                                                                                                                                                                                                                                                            |
| `01 转写 · 交互 · 依附关系`（`88:471`；可保存 `88:472`，拆宿主被拒 `88:518`） | 标题「依附关系」。说明带层名。宿主行是复选框加层名，右侧「首选」单选，未勾选的单选禁用。拆掉仍有正文的宿主时，行尾红色「有 N 条正文」，底部红色原因，保存变灰。换首选时底部是灰色提示。链接类型是下拉，稿中示例为「意译」。取消白底，保存黑底。精稿控件是 Checkbox `11:29670`、Radio `11:29701`、Select `11:29586`、Button。 | 只给 `symbolic-association` 层。原生复选框、单选和 `select`，按钮用现有 `btn`。类型名沿用已有枚举：直译／意译／逐字／教学（`direct`／`free`／`literal`／`pedagogical`）。有正文或草稿的宿主整次拒绝。不改层类型，不改 `layers.parent_id`。 |
| `01 转写 · 交互 · 拖层`（`90:1`；层名列对齐 `81:2020`） | 落点六块和拖动中三块都用层名列的树（点、折线、12px 层名），不用旧的类型标行。拖动中活动层边缘是品牌色蚂蚁线：单行只描该行，整组只描外沿。被拖层上的语段用当前语段同一套高亮（`--brand-tint`、1px `--fg-2`、3px `--focus-ring`）。改归属仍是目标转写行 2px 墨色内框；缝是 2px 墨色插入线。译文菜单没有「回到顶层」。 | 已审。蚂蚁线不铺底，减少动态时停在虚线。页面已按该稿接上。 |
| `01 转写 · 上下文栏`（`40:1407`）                                              | 栏底 #f5f5f5。区头 36px（稿件 49px），名称 13/20 半粗，右侧摘要 12/18 #5c5c5c。层行 36px：类型 12px #3a3a3a，层名 13px，子层缩进 16px；选中行 #ececec 底、2px 墨色内描边。每行右侧竖排三点，菜单在点下方右对齐：上移、下移、改名、分隔、红色删除（白底、8px 圆角、1px #eee、轻阴影）。片段行 36px：时间 12px、正文 13px；列表超过 240px 在区内滚动；折叠区整行可展开。 | 三点打开既有层操作，不在行内铺按钮；平时隐藏，悬停、聚焦或菜单打开时才显示。选中用深一档灰底、左侧 2px 品牌靛短标，层名半粗；悬停用浅一档灰。键盘焦点仍用石墨环（ADR-0110）。2026-11-23：新建层不放在侧栏列表末行。新建转写层、新建翻译层、新建口译，以及每行的上移、下移、改名、删除，改到时间轴层头右键菜单的「新建层」和「层」。侧栏列表只保留层名和选中。片段行只排已有的时间和正文。区头和本区列表之间留 8px，下一区区头和上一区列表之间同样留白，不加线。区头在折叠箭头和名称之间放 16px 图标。对照「侧栏配色 · 四案」的丁。 |
| 提示条（对照设计系统 14「反馈」与 09「反馈组件」，2026-11 放大版；ADR-0116）       | 全应用同一提示条：墨色壳（`--toast-bg/fg/border`）、8px 圆角、`--shadow-popover`、宽 360–480px、最低 52px、内边距 12/12/12/16、间距 12px；正文 15px 半粗，前置 10px 色点，可选一个细边动作钮，右侧 24×24 关闭钮；底部居中，`--z-toast`（不压对话框：压上去会挡住对话框按钮）。同屏最多 3 条，新的在下，超出先收掉最早的结果类；同一件事（保存状态）原位更新。                                                                                                                                                                                                                                                                                                                                          | 结果 4 秒自动关闭；错误、核实中和常驻状态不自动关闭；悬停、键盘焦点、窗口失焦暂停计时。拒绝原因只走提示条；底栏只保留状态、时间码框、草稿冲突与「撤销遇后续修改」条。「带动作 12 秒」暂无调用路径，待有带动作的结果类提示再接。                                                                                                                                               |

### 拖层改归属视觉

精稿 `01 转写 · 交互 · 拖层`（`90:1`）。侧栏层行对齐 `81:2020` 的层名列：12px 层名、6px 节点、灰色折线；当前层的节点和层名用品牌色。不用旧的类型标行。已审，页面已按该稿接上。颜色按 DESIGN.md，不用 `--state-info-*`，侧栏和轨道不加投影。两个面各拖各的，不跨面落下。

起拖的是层名，不是三点、改名框或波形轨道。层名悬停 `grab`。不另加 `grip-vertical`。按住层名才开始：侧栏 200ms，时间轴 500ms；时限内松开仍是选中。层头列收成窄条、层已收成窄条、或正在改名时，不起拖。开始后指针为 `grabbing`，直到松开。

拖独立的转写根时，这一根和当前看得见的从属行一起平移，只在动手的那一面。另一面留在原位，只给对应层一条静态品牌色内框。拖从属层时只有自己那一行。源块有不透明的纸色底，避免和让开的文字叠在一起。行跟着指针 `translateY`，不放大、不加投影、不改饱和度。让出空位的行按被拖那一块的高度平移，220ms，缓动与旧时间轴层拖动相同（`cubic-bezier(0.22, 1, 0.36, 1)`）。往下移时，原位和缝之间的行上移；往上移时，这些行下移。挂到转写层时，缝开在该层最后一个看得见的下级之后。同宿主翻译层的上半是“之前”、下半是“之后”，最后一项下方另有一块可放到末尾。不能放时一行都不让。命中按各行原来的布局位置，减去当前的平移，免得缝一开落点跟着跳。系统要求减少动态时直接到位。

按住尚未开始时，指针明显移开（超过 6 CSS px）、松开、Esc、指针取消、窗口失焦或组件卸下，都取消这次长按，不进入拖动、不写库。开始时用最新的指针位置。层名悬停和键盘聚焦都能看到“按住可拖动”。

活动层的边缘用蚂蚁线，和拖建预览同一套线：`--brand-solid`、1.5px、4px 线段／4px 间隔，0.4s 线性循环把虚线偏移从 0 移到 −8px。不铺 6% 底，只描边。整组一起动时只描外沿一圈，不逐行再描。系统要求减少动态时停在虚线。松开、取消或失败后撤掉。

被拖层上的语段在拖动中用当前语段同一套高亮：`--brand-tint` 底、1px `--fg-2`、3px `--focus-ring`。整组一起动时，组里每一层的语段都这样；没被拖的层保持原样。这只在拖动中出现，不表示进入编辑。松开、取消或失败后语段回到原来的底色和边。

落点只画一种：

- 缝（同宿主翻译层改顺序）：目标行上半是“放到「层名」之前”，插入线贴上沿；下半是“放到「层名」之后”，插入线贴下沿。2px 实色 `var(--text-primary)`，通栏，不画端点圆。这是分隔线，不是新的容器边框。列表末尾另有一块，可把当前翻译层放到该宿主最后。
- 顶层接收区（转写层解除挂靠）：时间对齐转写层开始拖动后（包括已经独立的根层），列表顶部临时出现一行高、带“移到顶层”的接收区；独立根投放到这里是移到根列表首位，不新增宿主，也不改变其他层的宿主。普通状态不占位。翻译层拖动时不出现可用接收态。
- 转写层头（改归属，排到该宿主最后）：目标行 `box-shadow: inset 0 0 0 2px var(--text-primary)`，旁注“挂到「层名」末尾”。不改当前层已有的灰底和左侧品牌条，避免和「当前层」混成一种。被拖的翻译层已有多个宿主时，这个内框不表示可落下，按不能放画。
- 不能放（翻译层但不同宿主、翻译层落顶层、已有多个宿主的翻译层落转写层头、自己、后代、收起组的内部）：指针 `not-allowed`。原因贴在指针旁，最宽 240px、可换行，靠近窗口边缘时翻到指针另一侧。12/18 墨色字、纸色底、1px `--border`、4px 圆角，portal 到 `--z-popover`，不参与命中。文案说原因：不能挂到这一层、不能挂到自己的下级、只能在同一宿主下调整顺序、翻译层必须挂在转写层上、关联多个宿主，请用依附关系修改。
- 被拆宿主上还有正文或草稿：拖动中看不出来。松开后整次不写，走现有提示条，说明这一层上还有正文、数据没改。

松开时落点不合法、指针已离开该列表、按 Esc，或指针被取消：撤掉线、高亮、蚂蚁线和位移，行回到原位，不写库。成功后树按重新读到的数据重排，不另弹成功提示；移动层保持选中，新位置不在视口内时只滚最小距离，并给读屏一条短状态（已挂到某层末尾、已放到某层之前或之后、已移到顶层）。精稿 `91:141` 画的是松开前：层名列按 `81:2020` 的树，被拖的行跟着指针，其他层按整块高度让开，活动层外沿是品牌色蚂蚁线。时间轴上该层的层名和语段一起动，波形留在原处。译文菜单没有「回到顶层」。

层菜单在上移、下移旁加项，样式与这两项相同，做不到时置灰不隐藏，`title` 写原因。打开后焦点进第一项；上下方向键移动，Home／End 到首尾；Esc 关闭并把焦点还给该行的“更多”。置灰项用 `aria-disabled`，点击和键盘都不执行。

- 挂到「当前转写层名」。当前层不是转写层、是自己、或是自己的后代时置灰。
- 回到顶层只出现在转写层菜单。已经没有宿主时置灰。翻译层菜单不放这项。菜单和顶部接收区都把这一层排到根列表最前。成功后选中被移动的层；若它落在收起的宿主组里，先展开那一层直到它可见。

两点都不打开类型选择。拒绝仍只走提示条。

波形拖选阈值与正文拖建按本次 ADR 为 50ms；截图只用于精稿对照，不提交运行态图像。

## 4. ADR

- 既有 1b-0 格式决定由 ADR-0126／0128／0129 管理；本次新增 ADR-0132 将 v31 升至 v32，新增 layer-scoped 正文、显式多宿主链接与 50ms 创建拖选规则。仅新格式合成项目；旧格式严格拒绝、不写迁移。

必须遵守的既有规范（开工清单第 0 步逐条写遵守方式；冲突回用户定）。队列 2–7 的归属在[工程索引 §7](../desktop-engineering-contract/design.md)，不在本文件重复：

| 条款                                                                                                                                                             | 管哪片                 | 约束                                                                                                                                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ADR-0100](../../../adr/0100-desktop-engineering-contract.md) E01                                                                                                | 全部含写操作的小片     | 自动保存节奏、失败重试、离开守卫；操作标识与回执同事务                                                                                                                       |
| ADR-0100 E02                                                                                                                                                     | 1b-2、#601             | 时间码框与行内正文半成品可存草稿；拖动非法才按 E06 回退                                                                                                                      |
| ADR-0100 E03                                                                                                                                                     | 1b-2～1b-4、1b-6       | 时间／说话人变化只使依赖项待复核                                                                                                                                             |
| ADR-0100 E04                                                                                                                                                     | 1b-2～1b-6、#601、#604 | 撤销分组、各稿件独立、跨对象无后续修改才可撤；拆合形成完整分析版本；VAD 批量分段同一步可撤                                                                                   |
| ADR-0100 E06、EF-018                                                                                                                                             | 全部                   | 时间、句段、点、层（含 90 天软删）；同层仅同说话人禁重叠；合并保留下级。E06 映射条款以 [ADR-0122](../../../adr/0122-integer-milliseconds-and-optional-media.md) 第 12 条为准 |
| ADR-0100 E11、[ADR-0099](../../../adr/0099-desktop-product-design-and-release-contract.md) R08                                                                   | #603                   | 口译 STT 本机优先，云端须项目级授权不静默回退，识别文本作候选待确认后写入                                                                                                    |
| ADR-0100 E13                                                                                                                                                     | 全部交互片             | 快捷键双平台固定可查、优先级明确、有非快捷键入口                                                                                                                             |
| ADR-0099 R02／R04／R11                                                                                                                                           | 全部                   | 破坏性操作预览确认、整步提交；合法跨轨重叠；全键盘与焦点返回                                                                                                                 |
| [ADR-0095](../../../adr/0095-attachment-file-publish-and-cleanup.md)                                                                                             | 1b-0、#603             | 口译短录音走 `attachments/objects/<sha256>` 原子发布与引用清理，不混入项目主 `media` 表                                                                                      |
| [ADR-0107](../../../adr/0107-motion-compact-height-selection-and-shortcuts.md)                                                                                   | 1b-1、1b-4             | ⌘M 合并下一个；选中底色比悬停深一档                                                                                                                                          |
| [ADR-0115](../../../adr/0115-timeline-waveform-and-segment-highlights.md)／[0117](../../../adr/0117-active-segment-uses-input-focus-chrome.md)                   | 1b-1                   | 波形与语段高亮、当前语段用输入焦点样式                                                                                                                                       |
| [ADR-0116](../../../adr/0116-page-notices-as-toasts-with-durable-carriers.md)                                                                                    | 全部含写操作的小片     | 拒绝原因与失败提示用 toast 加持久承载，不用页顶横幅                                                                                                                          |
| [ADR-0086](../../../adr/0086-desktop-release-scope-and-format-freeze.md)、[0097](../../../adr/0097-desktop-write-entry-initialization-and-reference-identity.md) | 1b-0、#600、1b-3、1b-4 | 严格拒绝旧格式不迁移；分轨锁定建表不塞 `settings_json`；写入入口与引用身份                                                                                                   |
| `src/services/KeybindingService.ts`                                                                                                                              | 全部交互片             | 新按键注册到这里，不在组件里单独监听                                                                                                                                         |

## 5. Flag

- 沿用 `desktopTranscriptionWorkspaceEnabled`。本地直接使用，默认开。`VITE_DESKTOP_TRANSCRIPTION_WORKSPACE_ENABLED=false` 仍回到旧读页。

## 6. 失败模式 / 兼容性

- 旧库（非 v32）打开即拒绝、不改字节；只重建合成项目。
- 非法边界：拒绝并保留最后有效时间；拖动预览不落库。
- 撤销遇后续修改：提示先处理后续修改，不部分撤回（E06／ADR-0100 撤销条款）。

## 7. 验证矩阵

| 验证类型  | 命令                                                                                                                            | 期望结果                                  |
| --------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| typecheck | `npm run typecheck`                                                                                                             | 0 errors                                  |
| 单库      | `npx vitest run src/db/desktop`                                                                                                 | all pass，含写→关→重开读回                |
| 页面      | `npx vitest run src/pages/DesktopTranscriptionWorkspacePage.test.tsx src/pages/useDesktopTranscription*`                        | all pass                                  |
| 创建路由  | `npx vitest run src/pages/desktopTranscriptionCreateRouting.test.ts src/pages/useDesktopTranscriptionCreateController.test.tsx` | 旧版路由、父段和 speaker overlap 结果通过 |
| 多层正文  | `npx vitest run src/db/desktop/units.test.ts src/db/desktop/textSave.test.ts src/db/desktop/projectRead.test.ts`                | 层间正文／草稿隔离，关闭重开后读回        |
| 结构守卫  | `npm run check:architecture-guard`                                                                                              | OK，无桌面例外新增                        |
| 文档守卫  | `npm run check:docs-governance`                                                                                                 | OK，含 Research 与 spec frontmatter 检查  |
| 桌面流程  | `npm run test:e2e:desktop-project`                                                                                              | green（CI `desktop-flow`）                |
| 旧页回归  | `npm run test:e2e:chromium`                                                                                                     | green（改旧组件 props 时）                |

## 2026-11-22 调研备忘（非实施决定）：#599 层显示样式

本附录只记录 #599 开工前的读码与外部手册，不修改上文已接受的选择，不升 `user_version`，不改表，不实施。外部页面读取日期为 2026-11-22。

### 已有列与写入口

现行开发格式是 `user_version` 33（`DESKTOP_PROJECT_USER_VERSION`，`src/db/desktop/schema.ts`）。冻结记录 `src/db/desktop/formatFreeze.record.json` 的 `userVersion` 同为 33，且 `formatFreeze.ts` 的 `checkDesktopFormatFreeze` 用整份 `DESKTOP_PROJECT_SCHEMA_SQL` 的 sha256 对照。加列会改这份哈希，须新决定；本片不改表。

`layers` 上与本片相关的列（`schema.ts` 的 `CREATE TABLE layers`）：

| 列 | 约束 | 谁加的 |
| --- | --- | --- |
| `orthography_id` | 可空，`REFERENCES orthographies(id)` | [ADR-0085](../../../adr/0085-desktop-project-one-sqlite.md) 的层表；[ADR-0088](../../../adr/0088-desktop-sqlite-domain-landings.md) 第 15 条：只外键指向项目目录行，可空 |
| `lane_height` | 可空，或正整数 | [ADR-0126](../../../adr/0126-v29-lane-locks-oral-audio-and-layer-retention.md) 第 3 条，与 v29 一次写入 |
| `display_font` | 可空，或 `length(display_font) > 0` | 同上，ADR-0126 第 3 条 |

ADR-0127 至 ADR-0137 没有再改这两列。`orthographies.font_preferences_json` 在同一份 DDL 里，默认 `'{}'`。桌面 `readOrthography`（`catalog.ts`）只读 `id`、`language_id`、`name_json`、`script_tag`、`catalog_metadata_json`；`createOrthography` / `updateOrthography` 不写字体 JSON。

已有写入口：

- `createLayer`（`layers.ts`）插入时可带 `orthographyId`，不写 `display_font`。`layers.create` 的校验接受 `orthographyId`（`operationContract.ts` 的 `checkLayerCreate`）。`catalog.test.ts`、`desktopCall.test.ts` 已覆盖：建层时写入合法正字法 id，关库重开仍能读回；不存在的 `languageId` 被外键拒绝。
- 改已有层：`layerStructure.ts` 只有 `renameLayer`、`setLayerHeight`、`moveLayer`、`deleteLayer`、`restoreLayer`。对应 `layers.rename` / `layers.setHeight` / `layers.move` / `layers.delete` / `layers.restore`（`desktopCall.ts`，撤销策略均为 `clear`）。没有 `setFont`、`setOrthography` 或合并的样式写入。
- `listLayers` / `getLayer` 的 SELECT 含 `orthography_id` 与 `lane_height`，映射为 `orthographyId`、`laneHeight`。SELECT 不含 `display_font`，`Layer` 上也没有该字段。就算直接改列，现有读路径也带不回页面。
- 转写页新建层（`useDesktopTranscriptionLayerController` 的 `create`）不传 `languageId` 或 `orthographyId`。该 controller 的注释写明页面只透传创建、改名、排序、层高、删除。

正字法目录已有，不要另做一套。挑选调用 `listOrthographies(db, languageId)`，桌面方法是 `orthographies.list`（`catalog.ts`、`desktopCall.ts`）。语言不存在时它抛 `language is missing`。建立项目行用已有 `orthographies.create` / `catalog.ensureProjectDefinition`，与 ADR-0088 第 15 条一致：内置模板先落成项目行，层再引用。

### 桌面页今天怎么画字

`DesktopTranscriptionLayerRows` 把语段交给 `TimelineAnnotationItem`，不传 `layerStyle`。`laneHeight` 只进 `laneHeightStyle`，写成 `--lane-height`。`.timeline-annotation`（`src/styles/pages/timeline/timeline-annotation.css`）设字号，不设 `font-family`。同文件里 `font-family: system-ui, sans-serif` 只用于确定度图标。桌面转写 CSS 里的 `font-family` 只出现在等宽时间码等处（`desktop-transcription-workspace.css`），没有按层的字体或正字法。`src/pages/DesktopTranscription*.tsx` 不引用 `TimelineLaneHeader` 或 `LayerStyleSubmenu`。

### 不要搬回来的旧层头

旧壳是 `src/components/TimelineLaneHeader.tsx`。右键菜单同时装：层操作、视图（折叠、连接线）、可选的轨道模式与说话人快操作，以及 `buildLayerStyleMenuItems`（`LayerStyleSubmenu.ts`）。样式子菜单写的是 Dexie 层文档上的 `displaySettings`：`fontFamily`、`fontSize`、`bold`、`italic`、`color`（`src/db/schemas.ts` 的 `layerDisplaySettingsSchema`；往返见 `src/db/adapter.layerFields.test.ts`）。渲染走 `layerDisplaySettingsToStyle`（`src/utils/layerDisplayStyle.ts`），并带脚本方向、行高缩放、本地字体枚举和覆盖检测。旧轨高拖动会反推字号再写回 `displaySettings`（`useTimelineLaneDisplayStyleResizePreview.ts`）。

#599 的任务行写明不放回旧层头这个壳（`tasks.md`）。2026-11-22 用户决定把壳和功能拆开：不挂 `TimelineLaneHeader`，外观另做；旧功能除字体颜色外都复用。上文若把「不放回旧层头」读成「字号、粗体、斜体、本地字体和层高互算也不做」，以本节「用户决定」为准。

### 外部手册里改变落点的事实

ELAN 把字体放在层上，不放在层类型上。添加层时，层类型只决定 stereotype；输入法与内容语言按层选择；字体在 More Options 里，作为层属性，并可一次套到同类型的多个层（[Adding new tiers](https://www.mpi.nl/tools/elan/docs/manual/Sec_Adding_new_tiers.html)）。新建层类型的字段是类型名、stereotype、受控词表、词库连接、ISO 数据类，没有字体（[Adding new tier types](https://www.mpi.nl/tools/elan/docs/manual/Sec_Adding_new_tier_types.html)）。没有单层字体时，用首选项里的「Default font for tiers, annotations and CV entries」；时间轴层高是查看器首选项 `Reduced Tier Height`，一份文档一个开关。这些首选项在 `.pfsx`，默认与 `.eaf` 同目录（[Editing preferences](https://www.mpi.nl/tools/elan/docs/manual/Sec_Editing_preferences.html)）。字符集在 ELAN 里是输入法（GUK、RTR、拼音等），在录入时选用（[Entering annotations in different character sets](https://www.mpi.nl/tools/elan/docs/manual/Sec_Entering_annotations_in_different_character_sets.html)），不是层上再存一列编码。

FLEx 把默认字体放在书写系统上。`WritingSystemDefinition.DefaultFont` 的注释是 “The font used to display data encoded in this writing system”（[libpalaso `WritingSystemDefinition.cs`](https://github.com/sillsdev/libpalaso/blob/master/SIL.WritingSystems/WritingSystemDefinition.cs)）。官方发行说明要求到 Format / Set Up Writing Systems / Fonts 重设字体特性（[FieldWorks 8.0.10](https://software.sil.org/fieldworks/fw8010/)）。SIL 技术说明同样要求为每个书写系统准备字体和键盘，字段通过书写系统显示（[Technical Notes on SFM Database Import](https://software.sil.org/fieldworks/wp-content/uploads/sites/38/2016/10/Technical-Notes-on-SFM-Database-Import.pdf)、[ICU and writing systems](https://software.sil.org/fieldworks/wp-content/uploads/sites/38/2016/10/ICU-and-writing-systems.pdf)）。

合在一起：正字法 id 是「这一层用哪个书写系统」；`display_font` 是 ELAN 那种按层的字体覆盖，不是再做一套字体目录，也不要只用书写系统上的一把字体代替层覆盖。层高继续按层，不改回 ELAN 的全局开关。不新增编码列。

MDN：`font-family` 是已安装字体或已用 `@font-face` 提供的字体族名列表；只写族名不会带上字体文件。需要一份用户机器上没有的字体时，才要 `@font-face` 的 `src`（[`font-family`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/font-family)、[`@font-face`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@font-face)）。本片存族名字符串，不引入字体选择库，不打包字体文件。字号、粗体、斜体另存列，见下方用户决定。

### 用户决定（2026-11-22）：新层头，复用旧功能，不做字体颜色

时间轴层头另做外观，不挂 `TimelineLaneHeader`。侧栏层行保持已审的 `40:1407` / `81:2020`。样式从新的时间轴层头进入。外观帧是精稿页 `01 转写 · 层头 · 显示样式（待审）`（`94:1`）。层头与白底分不开，另有 `层头底色 · 四案（待审）`（`95:54`）：甲层名成栏、乙整层是槽、丙当前层加深、丁墨底白字。甲的层头和语段同为 `#F5F5F5`。ELAN 把层名色和注释高亮分成两个设置（[Tier attributes](https://www.mpi.nl/corpus/html/elan/ch05s04.html)），这里不按层变色，只借用「两块面不能同色」。错开三案在 `层头和语段错开 · 三案（待审）`（`95:116`）：戊层头深一档、己用线切开、庚三档错开。整页待审：`戊 · 层头深一档（待审）`（`95:166`）、`庚 · 三档错开（待审）`（`95:635`）。灰块加层名太单调，结构三案在 `层头结构 · 三案（待审）`（`95:1106`）。2026-11-22 曾选辛（`95:1110`）。同日改用「1 · 同纸一条线」（`101:5899`），随后落地「1 · 层头用字重」（`101:6967`）：层头和文本区都是纸，不铺灰底，不保留名牌，不加墨色索引。一条分界线从波形顶纵贯到文本区底，落在层名列右缘。层名与所在行对齐。选中层名 14px 半粗墨色，其余层名 13px 中黑墨色；转写正文仍 16px 常规，译文正文仍 14px 常规。没有下级、也没有宿主的独立层不画圆点。同日再落地「1 · 层头悬停与行缝」（`101:7498`）：层名格底边一条 1px `--border-subtle`，不穿过语段。悬停铺 6% 墨色，按下铺 8%，字号和字重不动。键盘焦点用 1.5px `--focus-color` 环。折叠钮仍只在悬停或焦点时出现。没导入音频时不画这条分界线，导入后从波形顶通到舞台底。层头折叠时不画。同一组的层之间不画层名格底缝。文本行上下各留 4px。写界面只按这一帧。未采用的层头待审帧已从精稿页删除。

复用的是功能，不是旧壳：

- 正字法：`layers.orthography_id`，选项只来自该层语言的 `orthographies.list`。旧样式菜单没有这项，#599 原文有，新层头要有。
- 字体族：已有 `display_font`。预设、本地字体搜索、覆盖检测用 `layerDisplayStyle.ts` 与 `useLocalFonts` 里的纯函数，不新做字体库，不打包字体文件。不把 `ProjectOrthography` 断言成 `OrthographyDocType`，也不直接调用 `buildLayerStyleMenuItems`（它要求非空 `languageId: string` 和 `OrthographyDocType[]`）。
- 字号、粗体、斜体：旧 `displaySettings` 有，桌面 `layers` 没有列。新增 `display_font_size`（整数 8–36 或 NULL，NULL 表示默认 13）、`display_bold`、`display_italic`（NULL 或 1）。拖层高得到的四分之一像素字号收成整数，与字号菜单一致。
- 层高与字号互算：拖层高仍写 `lane_height`，并按 `computeFontSizeFromRenderPolicy` 写字号。改字号按 `computeLaneHeightFromRenderPolicy` 写层高。这两函数要的 `lineHeightScale` 用脚本已有的行高系数，没有则 1；桌面正字法行没有 `fontPreferences.lineHeightScale`，不从缺字段另造系数。重置清空样式字段，层高回到默认。两次写入各自一个事务。
- 正文样式用 `layerDisplaySettingsToStyle` 的结果，不传 `color`。字号、粗体、斜体、重置和本地字体搜索装到新层头上。脚本、方向和覆盖用下面的回退，不靠强制转换。

字体菜单的适配（审查 P1，开工前照此写，不直接接入旧菜单）：

- `ProjectOrthography` 只有 `id`、`languageId`、`name`、`scriptTag`、`sourceType`。没有 `direction`、`exemplarCharacters`、`type`、`fontPreferences`。
- 层没有 `language_id`：不填假语言 id。正字法选项为空，不能写入正字法。字体预设按 `Latn`。方向 `ltr`。没有字例时覆盖检测跳过字例，不把缺字例当成字体覆盖失败。
- 层有语言、并选了属于该语言的正字法：脚本用该行 `scriptTag`，空则 `Latn`。方向用这个脚本已有的默认方向，没有则 `ltr`。不读缺失的 `direction`。字例为空则跳过字例覆盖。没有 `type` 则不用 IPA 预设。
- 无语言层和指定书写体系各验一次菜单：预设、方向和覆盖回退符合上两行，且没有类型断言。

字体颜色不复用：不新增列，不写入，不画，菜单里不提供。旧数据里的 `displaySettings.color` 不迁。

存储决定：不把这些字段塞进 `font_preferences_json` 或 `project.settings_json`。加列会改变 `DESKTOP_PROJECT_SCHEMA_SQL` 的哈希，须新 ADR 并把 `user_version` 从 33 升一档，重写格式冻结记录。不改 ADR-0126 正文。旧库按现有桌面格式政策拒绝，本片不做迁移。

坑：`layers.language_id` 与 `layers.orthography_id` 是各自的外键。外键只拒绝不存在的 id；一个存在但属于另一语言的书写体系仍能写入。`setLayerStyle` 在写入前核对：正字法行的 `language_id` 必须等于该层的 `language_id`。层没有语言，或两边语言不同，整次拒绝，关库重开后原值不变。层没有语言时 `orthographies.list` 也不能列出正字法，字体仍可写。`display_font` 空串违反 CHECK，清空用 NULL。本机没有该字体族时按 `font-family` 回退。`queryLocalFonts` 在当前 Electron 里不可用时，保留「无法加载本地字体」的状态，不改走另一套枚举。样式写入的撤销策略沿用 `layers.setHeight` 的 `clear`。

已知不做：不挂旧层头壳；不做字体颜色；不把分轨锁放进 `project.settings_json`；不开说话人分轨（#600）、拆分（#563）或录音转写。

### 最小施工顺序

1. 时间轴层头外观用「1 · 层头悬停与行缝」（`101:7498`）。写界面只按这一帧。
2. 新 ADR：三列与 `user_version`。`schema.ts`、`formatFreeze.record.json` 一起改。
3. `layers.ts` 读出 `displayFont`、`displayFontSize`、`displayBold`、`displayItalic`。`orthographyId` 已在。
4. `layerStructure.ts`：`setLayerStyle` 一次写入正字法、字体族、字号、粗体、斜体。写入前核对正字法属于该层语言；不属于或层没有语言则整次拒绝，原值不变。改字号的那次调用同时写 `lane_height`。拖层高的现有 `setLayerHeight` 同时写字号。重置把四个样式字段写成 NULL，并把层高写成默认。不写颜色。
5. `operationContract.ts` 增加 `layers.setStyle`（`clear`），`desktopCall.ts` 与 `client.ts` 接上。`operationContract.test.ts` 的 `addedAfterSnapshot` 列入新方法。不改 `operationCatalog.baseline.ts` 的冻结快照。
6. 新的时间轴层头只绑定 controller，外观按「1 · 层头悬停与行缝」。右键菜单外壳与行高沿用已审层菜单（`81:1550`，`.desktop-tx-menu`）：32px 行、14/22。正字法和字体向右展开二级列表，项样式同播放速率下拉（`64:3290`）：32px 行，超出后滚动，不把行压矮。查找框同为 32px、14/22。收起时行尾有向右三角。粗体、斜体各占一行，圆形单选（`4:1310`）12px，与字号数字同一列。字体列表打开时读取本机字体，顶部按字体名过滤预设和本机字体，不单列本机字体。字体菜单按上面的适配接，不把 `ProjectOrthography` 断言成 `OrthographyDocType`。正文样式交给已有的 `TimelineAnnotationItem` `layerStyle`。页面不挂 `TimelineLaneHeader`。
7. 验证：`layerStructure.test.ts` 写后关库重开，读回正字法、字体族、字号、粗体、斜体和层高；拖层高改变字号；改字号改变层高；重置后样式为空且层高为默认；颜色没有列也没有写入。另两组：属于另一语言的正字法 id 被拒绝，关库重开后原值未变；无语言层不能写入正字法，字体仍可写。菜单用无语言层和一条指定书写体系各走一次，预设与方向走回退，覆盖检测不把缺字例当成失败。再跑 `operationContract.test.ts`。不新增依赖。

### #600 分轨与说话人（2026-11-22 画在精稿页 `19:6184`）

从「01 转写 · 样态 · 标准」（`19:6187`）和「01 转写 · 交互 · 句段菜单」（`19:11830`）复制。不改旧的「01 转写 · 样态 · 分轨锁定」（`67:2855`），那张是单行卡片上的锁定，不是说话人分轨。卡片左缘用 A／B 标说话人。层名列仍是标准帧的 64px。

| 画板 | 画了什么 |
| --- | --- |
| `01 转写 · 样态 · 自动分轨`（`103:1`） | 这一层加高。重叠处 A 在上、B 在下，其余仍在上一行。层名下写「锁」 |
| `01 转写 · 样态 · 一人一轨`（`103:469`） | 同样加高。A 始终在上，B 始终在下；右侧只有 B 的 `o le`，上面空着 |
| `01 转写 · 样态 · 单轨重叠`（`103:937`） | 仍是一行。B 叠在 A 上，卡片写「1/2」，层名下写「2 处」 |
| `01 转写 · 交互 · 分轨冲突`（`103:1405`） | B 没有落在锁住的下一行。工作区底部一条失败提示：「B 的锁定行已被占用」。层上不写字 |
| `01 转写 · 交互 · 说话人菜单`（`103:1873`） | 句段菜单「说话人」旁列出 A（当前）、B、C，再按名字列达瓦、格桑，最后是清除。没有新建 |

### 本次未验证

样式列、格式冻结和 typecheck 这一轮没有重跑。层头悬停与行缝：`DesktopTranscriptionWorkspacePage.test.tsx` 与 `selection.test.tsx` 共 29 项通过；桌面转写页上悬停只给层名格铺浅墨，不铺到语段，选中层仍是半粗。未按住层名，未走键盘焦点。未打开真实 `.eaf` / `.pfsx`。未读 FieldWorks 样式表里按样式覆盖字号的实现，只核了书写系统上的 `DefaultFont` 与官方发行说明。未读取任何木雅、EAF 或 FlexText 语料。
