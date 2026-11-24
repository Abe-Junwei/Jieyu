---
title: 并行正字法层调研（2026-11-24）
doc_type: execution-plan
status: draft
owner: repo
last_reviewed: 2026-11-24
source_of_truth: execution-plan
depends_on:
  - ../../adr/0085-desktop-project-one-sqlite.md
  - ../../adr/0132-layer-scoped-transcription-and-legacy-create-routing.md
---

# 并行正字法层调研（2026-11-24）

这是一份 execution-plan。存储方向已确认：复用 `symbolic-association` + `transcription` + 宿主 unit 上的 `unit_texts`，不新增层类型，不复制 unit。合并草稿、删除一格、拆分切正式正文见规则 8、12 和 4。实施规格在 [parallel-orthography-tiers](../specs/parallel-orthography-tiers/requirements.md)。本页不改产品代码。

## 结论

| 判断 | 内容 |
| --- | --- |
| adapt | 时间依赖用 ELAN Symbolic Association 已有的 1:1、无自有时间。内容身份用解语已有的 `transcription`，正文落在宿主 unit 的 `(unit_id, layer_id)`。 |
| 不 reuse 成翻译 | 翻译创建路径是 `contentType: translation`，链接类型是直译／意译／逐字／教学。正字法转写是同一话语的另一种写法。 |
| 不 custom 新 stereotype | `tier_type` 已有四值。时间细分会让子层拥有自己的时间。`parent_id` 不负责正文匹配。 |

第 4、8、12 条补上了草稿和「删一格」。文末是这三处和现有代码的差距，实施时要改掉。

## 问题边界

同一句的 IPA、拼音、汉字共享一套 segment id。IPA 层是 `time-aligned` + `transcription`，拥有起止时间。拼音和汉字是各自可编辑、可导出的转写，时间只读地跟着这套 id。来源各自保存：改 IPA 不得静默改写另一种正字法。拆、并作用于这套语段；每种写法只按该层自己的规则处理正文。删一种正字法只删该层。删 IPA 锚层不得静默删掉其他转写正文。

翻译层是另一种语言的释义，挂在当前转写层上，类型是 `symbolic-association` + `translation`。独立的时间对齐转写层各有自己的 unit，拖到宿主上今天不共享语段。

## 必须遵守的规则

这些规则在写入和拖放处执行。不能只做界面约定。

1. **宿主必须是 `time-aligned` 的转写层。** `setHosts` 现在只检查宿主的 `content_type` 是不是 `transcription`，不看 `tier_type`（`src/db/desktop/layerHosts.ts` 第 323–330 行）。拖放落点同样只排除 `time-subdivision`（`src/pages/desktopTranscriptionLayerDrop.ts` 第 88 行）。于是翻译层可以挂到拼音层上，或拖到拼音层头上。拼音层没有自己的语段，翻译层就读不到任何语段。`layer_links` 的插入校验和拖放判断都要拒绝这种宿主。现有触发器只要求宿主是转写层（`src/db/desktop/schema.ts` 第 1148–1159 行），挡不住。
2. **内容类型是转写的符号关联层，最多一个宿主。** `setHosts` 接受一组宿主 id。第二个宿主在数据库写入处拒绝，不能只在界面上限制。拖放今天不会把这种层改挂到新宿主：被拖层不是翻译、也不是时间对齐转写时，落点直接拒绝（同文件第 93–95 行）。多宿主的缺口在写入，不在这一条拖放。
3. **没有旧录音文字层要兼容，也不加用途标记。** 新建配对已经不再建文字层（`src/db/desktop/recordingClips.ts` 第 100 行）。挂在录音层上的 `parent_id` 打开时会被清掉（`src/db/desktop/recordingTarget.ts` 的 `detachRecordingTextParents`），不做迁移。共享语段组就是：时间对齐的转写锚点，加上以它为唯一宿主、内容为转写、模态为文字的符号关联层。录音结果可以写入用户选定的正字法层，正文落在该层自己的 `unit_texts`，和手写同一格。已有正式正文时先落该层草稿，保存后才替换，不静默覆盖。来源只记这一层；之后手改清掉该行来源。
4. **拆分切的是正式正文。** 其他写法默认整段留在左半，确认框列出这组里的其他写法，每种可以另给一个切点，可以不填。不填就用这条默认。不按另一种正字法猜测切点。某一层有未保存草稿时，确认框把草稿标出来；确认后草稿仍整段留在左段，不提交，`raw_input` 和 `base_body` 保持原样。没给切点时，左段正式正文仍是原整段，草稿的 `base_body` 对得上。给了切点时，正式正文按切点切开，草稿仍是切分前的整段，所以 `base_body` 可以和左段正式正文不同。确认期间正式正文或草稿变了就拒绝。切开的正式正文按现有规则清掉该行来源；草稿自己的来源留在草稿上。
5. **第一版删除时间锚点层时，只要这组里还有其他正字法层，就拒绝。** 换时间主人不在第一版，所以要删这个层，先删掉这些正字法层。现在的 `descendantIds` 会沿着宿主链接把拼音层一起标删（`src/db/desktop/layerStructure.ts` 第 631–658 行），这条级联不能当作删除锚点层的结果。「删掉锚点、把时间主人换成另一种写法」是换主人：语段改归那一层，那一层改成时间对齐，其余层改挂过去，恢复时还要还原。不放进第一版。这一条只保护删层。删除语段见规则 12。
6. **第一版只手写。** 格子可以先空着，不预写 `unit_texts`。从 IPA 生成另一种正字法以后再做，而且只能写目标层。改 IPA 不覆盖其他层，也不重跑生成。
7. **录音结果进正字法层时先落该层草稿。** 保存后才替换正式正文。来源只记这一层，手改后清掉该行来源。这条不授权合并把未保存草稿写成正式正文。
8. **合并按现有分隔符拼接每一层自己的正文。** 两边都有字时清掉该行来源。不跨层猜测。某一层有未保存草稿时，确认框把草稿单独标出，和正式正文分开。用户确认后，才把草稿拼进该层正式正文并删掉草稿。不确认则正式正文和草稿都不变。
9. **界面把一组正字法画成平级写法，并标出谁持有时间。** 不按翻译层缩进。入口叫「添加正字法转写」。`link_type` 可以仍写成缺省的 `free`，界面不把它显示成意译。
10. **导出时，还没有正文行的语段写成一条空标注。** 和锚点语段一一对应。界面上缺行已经显示成空字符串。
11. **添加正字法转写只挂当前这套语段。** 当前层是时间对齐转写层就用它；已经挂在这样的层上就用那条。对不上就拒绝，不退到文稿里的第一条。正字法仍用层上已有的 `orthography_id`。
12. **正字法层不删除共享语段。** 那里的删除只清空当前层这一格的正式正文和草稿，语段和其他层保留。撤销只恢复这一格。批量清空也只作用于当前层。删除共享语段只在时间锚点层上做，仍走 `removeUnit` / `removeUnits`，撤销恢复整段。翻译层同样不能删除共享语段，只清空本层这一格。

## ELAN Symbolic Association 实际保证什么

手册把层分成独立层和引用层。独立层直接连到时间。引用层连到父层标注，通常不自己连时间轴；能连时间的，也只能落在父标注的区间里面。原文：

> Independent tiers, which contain annotations that are linked directly to a time interval, i.e., they are “time-alignable”.
>
> Referring tiers, which contain annotations that are linked to annotations on another tier (i.e., to annotations on their so-called “parent tier”). They are usually not linked directly to the time axis.

来源：<https://www.mpi.nl/tools/elan/docs/manual/Sec_Basic_Information_Annotations_tiers_and_linguistic_types.html>

五种 stereotype 里，Symbolic Association 的定义是：

> The annotation on the parent tier cannot be sub-divided further, i.e., there is a one-to-one correspondence between the parent annotation and its referring annotation on this tier. Tiers of this type are dependent tiers (must have a parent tier). E.g., one sentence on a parent tier has exactly one free translation. Or one word has exactly one gloss.

同一页。父层可以同时有多个引用层：手册的嵌套表里，`ref` 同时是 `tx` 和 `ft` 的 parent。层数不限（“You can define an unlimited number of tiers.”）。

EAF 格式说明把这条约束落到标注上，而不是「只能有一个子层」：

> Symbolic Association tier: linguistic type with constraint of stereotype Symbolic_Association, annotations are Ref Annotations, reference to a parent annotation is required, maximal one child annotation per parent

来源：<http://www.mpi.nl/tools/elan/EAF_Annotation_Format.pdf>（§2.7）。`REF_ANNOTATION` 不直接对齐媒体，用必需的 `ANNOTATION_REF` 指向父标注。`LINGUISTIC_TYPE` 在 `Symbolic_Association` 时 `TIME_ALIGNABLE` 应为 false。3.0 格式说明的例子把 `Translation` 写成 `CONSTRAINTS="Symbolic_Association"`。来源：<https://www.mpi.nl/tools/elan/EAF_Annotation_Format_3.0_and_ELAN.pdf>（schema URL 写为 `http://www.mpi.nl/tools/elan/EAFv3.0.xsd`）。本次未单独打开该 xsd 文件；上面两句以这两份 MPI 格式说明为准。

时间与删除，手册写的是单向的：

> If you delete a parent tier, all its child tiers are automatically deleted as well. Similarly, when you delete an annotation on a parent tier, all corresponding annotations on its child tiers are deleted as well.
>
> If you change the time interval of an annotation on a parent tier, the time interval of the corresponding annotation on all its child tiers are changed accordingly. The time interval of a child tier cannot be changed independently.

来源同上，Basic Information 页。删除层的操作页重复了这一点，并给出唯一的免级联办法：先把子层改挂到别的父层或改成独立层，再删父层。<https://www.mpi.nl/tools/elan/docs/manual/Sec_Deleting_tiers.html>

空标注是显式对象。`Tier > Create Annotations on Dependent Tiers…` 可以选择 `Empty Annotations`，或 `Annotation With Value of Parent`，并可用 `Overwrite the annotation values` 用父标注的值覆盖子标注。<https://www.mpi.nl/tools/elan/docs/manual/Sec_Creating_Annotation_Depending_Tiers.html>

拆分只允许发生在没有父层的顶层标注上，且该标注没有子标注，或只有符号关联子标注。居中拆分时「both the annotations will have the same values」。若只有符号关联的依赖标注，则「the annotation will be split together with its depending annotations」。手册没有写「按另一种正字法的光标位置切字符串」。<https://www.mpi.nl/tools/elan/docs/manual/Sec_Splitting_Annotations.html>

合并作用在独立层的两条相邻标注上。依赖层也参加：第一条父标注在依赖层上的最后一条标注会被拉长，终点改到第二条父标注的起点。<https://www.mpi.nl/tools/elan/docs/manual/Sec_Merging_annotations.html> 这段讲的是时间范围，没有给出按层拼接正文的规则。

改父层的旧命令已停用，改为复制向导。重新对齐时，引用层上对不上新父层的标注会被删掉。引用层可以变成独立的时间对齐层。<https://www.mpi.nl/tools/elan/docs/manual/Sec_Changing_the_parent_of_a_tier.html>

## ELAN 不把引用层当成对等正文

手册对 Symbolic Association 的内容举例是 free translation 和 gloss，并称这种层为 dependent tier / child tier，必须有 parent。正字法转写在同一章里是独立层的例子：「one tier containing the orthographic transcription of the speakers utterances」。层类型的名字可以叫 orthography 或 phonetic transcription，那只是类型名，不改变 stereotype 的父子约束。

因此 ELAN 能提供「同一父标注、一条引用标注、引用层没有自己的时间」。它不提供「几种正字法在内容上对等」：删父层会连带删子层，改父标注时间会改子标注时间，而子层不能单独改时间。手册也没有一条「编辑父层正文不得覆盖引用层正文」的保证；创建依赖标注时还可以选择用父值覆盖。

Time Subdivision 和 Included In 都会让子标注自己对齐时间，只是必须落在父区间内，且 Time Subdivision 不允许间隙。那是更细的时间切分，不是同一 segment 的另一种写法。Symbolic Subdivision 是无时间的有序链，一条父标注对应多条子标注。三者都不等于「一套 segment、多套对等正文」。

## 其他一手模型哪里对不上

### Praat TextGrid

Interval tier 是本层自己的一段连续标注区间，每层一份 `xmin` / `xmax` / `text`。官方例子里，`sentence` 是 1 个区间，`phonemes` 是 3 个区间，写在同一个 TextGrid 里，区间表互不引用。<https://www.fon.hum.uva.nl/praat/manual/TextGrid_file_formats.html>

同一层内的不变量是正时长和首尾相接，没有「两层必须同一套边界」的不变量。编辑器可以在所有层的当前时间加边界（Extra-Command-9：「Add a boundary on all tiers」），也可以只加在某一层（Extra-Command-1 到 8）。<https://www.fon.hum.uva.nl/praat/manual/Keyboard_shortcuts.html> 切开某层时，原文按该层文本光标分到两个新区间；删边界时，只拼接这一层的两段文字。<https://www.fon.hum.uva.nl/praat/manual/TextGridEditor.html>

Praat 能让几种写法在屏幕上并排，也能一次把同一时刻写进所有层。它没有共享 segment id，任何一层都可以再单独改边界，所以时间所有权不是定向的。删一整层只删该层（Remove entire tier），这一点和「删一种写法只删该层」一致，但那是因为各层本来就独立。

### EXMARaLDA

事件引用同一条时间线上的起点和终点，所以不同层可以共用时间点。事件自己选择跨度：说明文档里「no orders from」从时间点 2 到 3，非语言事件从 2 到 5。<https://www.exmaralda.org/pdf/Understanding_the_basics_of_exmaralda_EN.pdf>

类型是预定义的。`t` 是 transcription：「You should have one and only one tier of this type for each speaker」。`a` 是 annotation：「additional analytic information about events in tiers of type 't'」。例子包括德文翻译和 morphological transliteration。`a` 的事件必须对应同一说话人的 `t` 事件或事件序列；一条德文翻译可以盖住两条英文事件。做不到这种对应的结构「are not allowed」。

Schmidt 的 LREC 论文把 `v` 层写成其他实体的时间参照，并把 annotation 写成「not independent entities」；翻译、语音标注都在这一类。基本转写之后的 segmented transcription 还可以让时间线分叉。<https://www.exmaralda.org/files/Paper_LREC.pdf>

同一条时间线不等于同一套 segment。第二种正字法放不进「每个说话人唯一的 t 层」；放进 `a` 层则内容上从属于 t，而且一条标注可以覆盖多条 t 事件。

### FLEx

SIL 把一种语言的多种写法建成多个 vernacular writing system。Zook（2014）列举 standard orthography、IPA、Pinyin、phonemic、Romanized，并说明它们和 gloss、definition、translation 所用的 analysis writing system 分开。<https://software.sil.org/fieldworks/wp-content/uploads/sites/38/2016/10/ICU-and-writing-systems.pdf> 产品说明同样把汉字、拼音、IPA、注音符号列为一种语言的多个 writing system。<https://software.sil.org/fieldworks/features/how-to-create-a-dictionary-using-fieldworks/>

行间文本的 Baseline 是一份正文。Lockwood（2017）写明插入文本时选定 writing system 之后：「Once this is chosen the text must be written in that writing system and you cannot change to another writing system.」<https://software.sil.org/fieldworks/wp-content/uploads/sites/38/2017/01/Machine-Parsing-of-Gilaki-Verbs-with-Fieldworks-Language-Explorer.pdf> 现行介绍里，Baseline 负责录入，Gloss / Analyze 负责行间分析，显示哪些行由 Configure Interlinear 决定。<https://software.sil.org/fieldworks/features/orientation-to-fieldworks/interlinearize-texts/>

Zook 同时记录了当时的缺口：baseline 若混用多种方言写法，词形会都进 vernacular 词表；「We expect to improve the processing of interlinear text to allow the baseline text to be in a different writing system.」这是 2014 年的预期，本次没有打开一份更新的、把多种话语正字法做成对等时间层的 FieldWorks 说明。

FLEx 的多种写法是词条和文本的 writing system，不是共享时间 segment 的对等层。行间的 gloss 行是分析，不是原话语的另一种正字法。

### EMU-SDMS

手册把纯时间层（Praat 那种）和纯符号树分开，再用链接合在一起。`SEGMENT` / `EVENT` 自带时间，`ITEM` 无时间。每个标注项可以有多个 attribute，并用 id 跨层链接。层间允许 `ONE_TO_MANY`、`MANY_TO_MANY`、`ONE_TO_ONE`。<https://ips-lmu.github.io/The-EMU-SDMS-Manual/chap-annot-struct-mod.html>

旧系统用线性链接层减少重复，例子是同一 segment 层上的 SAMPA 和 IPA UTF-8。新系统仍可用 `ONE_TO_ONE` 表示这种层，但手册把它们定义成「describe, enrich or supplement another level」（词类、重音）。它更推荐多个 attribute 放在同一个标注项上，以减少层、项和链接。

这是本次读到的、最接近「同一项、多种标签、其中一层可以不带时间」的模型。它仍把第二种标签写成补充。手册没有写每种标签独立的来源，也没有写删掉一种正字法标签时保留该项和其他标签。把拼音做成同一 item 的 attribute，会和「删一层只删该层、来源独立」冲突。本次未打开 Bird & Liberman 2001 原文；EMU 手册把它和自己的图模型称为概念上的子集或超集，并引用 ISO CD 24612：「users will represent annotations using their own formats, which can then be transduced to the LAF pivot format」。

### ISO

<https://www.iso.org/standard/37338.html> 的公开摘要：ISO 24624:2016 规定用 TEI 指南把录音转写写成 XML，并希望与标注语料库标准相关联。全文未打开，不据此声称它定义了正字法层。

<https://www.iso.org/standard/37326.html> 的公开摘要：ISO 24612:2012 规定 LAF 的抽象模型和 XML 轴转格式，用于把一种标注表示映射到另一种。全文未打开。

## 解语里已经能承载的机制

`layers.tier_type` 只接受 `time-aligned`、`time-subdivision`、`symbolic-subdivision`、`symbolic-association`。`content_type` 另有 `transcription` 等值，其中包含 `point`。见 `src/db/desktop/schema.ts` 第 294–299 行。ADR-0085 把这两种字段分开列出，并写明 `parent_id` 只是同一文稿里的层；自指和成环当时没有收成领域规则（`docs/adr/0085-desktop-project-one-sqlite.md`）。

ADR-0132 已经决定：时间 unit 持有时间和说话人；关联文本用 `(unit_id, layer_id)` 各存正文；空正文不落记录；`layer_links` 表示文本层到宿主层，`parent_id` 不推导文本匹配（`docs/adr/0132-layer-scoped-transcription-and-legacy-create-routing.md`）。

`listUnits` 对 `symbolic-association` 读的是 `layer_links` 里的宿主 unit，正文用 `unit_texts.layer_id = 该层` 且 `role = content_type` 左连接。没有宿主则没有语段可读（`src/db/desktop/units.ts` 第 289–322 行）。触发器只允许把正文写到「unit 自己的层」或「经 `layer_links` 连到该 unit 所在层」的层上（`src/db/desktop/schema.ts` 第 1104–1124 行）。`resolveUnitTextContext` 对 `time-aligned` 且文本层不是 unit 所在层的写入直接拒绝，错误是 `unit text stays on its layer`（`src/db/desktop/unitTextLayers.ts` 第 69–77 行）。

创建校验只禁止一种组合：`time-aligned` + `transcription` 再带 hosts（`src/db/desktop/layers.ts` 第 94–100 行）。`symbolic-association` + `transcription` + hosts 已经能创建。跟读录音的 voice 对就是这条组合，只是 `modality = 'audio'`，内容类型是 `transcription`；oral 对的内容类型是 `translation`（`src/db/desktop/recordingClips.ts` 第 61–95、420–425 行）。口译控制器里的 `createTranslationLayer` 仍是 `symbolic-association` + `translation`（`src/pages/oralControllerApi.ts` 第 461–471 行）。录音目标里，同一宿主上的文本 `symbolic-association` 层会写回该 unit，而另一条独立的 `time-aligned` 转写层会去对它自己的时间区间（`src/db/desktop/recordingTarget.ts` 第 133–142、265–279 行）。

桌面转写页的创建入口只有两支（`src/pages/useDesktopTranscriptionLayerController.ts` 第 107–142 行）：

| 入口 | `tierType` | `contentType` | hosts |
| --- | --- | --- | --- |
| 转写 | `time-aligned` | `transcription` | 不传 |
| 翻译 | `symbolic-association` | `translation` | 当前时间对齐转写层，`preferred: true` |

翻译这条在没有时间对齐转写宿主时直接失败。宿主解析认的是 `contentType === 'transcription' && tierType === 'time-aligned'`（同文件第 260–275 行）。`insertHostLinks` 在调用方没给 `linkType` 时写入 `free`（`src/db/desktop/layerHosts.ts` 第 75–83 行）。

拖动不能把独立时间对齐转写层变成共享语段。`setHosts` 只接受 `symbolic-association`（`layerHosts.ts` 第 308–310 行）。宿主必须是未删除的 `transcription`（第 323–330 行）。`clearLayerHosts` 只放行 `time-aligned` 转写层（第 158–160 行）。规格写明：转写层上的链接只表示排列，`listUnits` 仍用该层自己的 unit；`time-subdivision` 不放开（`docs/execution/specs/desktop-4ws-slice1b-transcription-editing/design.md` 的拖层决定）。

### 创建路径差额

新入口相对翻译创建，只改三处事实，不改表：

1. `contentType` 用 `transcription`，不用 `translation`。
2. `tierType` 用 `symbolic-association`，不用新转写入口的 `time-aligned`。
3. `hosts` 只传当前这套语段的时间锚点，一条，`preferred: true`。当前层自己是 `time-aligned` 转写层就用它；当前层已经挂在这样的层上就用那条。否则拒绝。不要用 `transcriptionHost` 的最后退路，落到文稿里第一条时间对齐转写层。

`createLayer` 已接受这个组合。不要写 `parent_id` 来充当宿主。不要改翻译入口的参数。

## 拆分、合并、删层现在对 unit_texts 做什么

拆分只按本次的 `textLayerId` 和 `cutIndex` 切那一层的字符串。同一 unit 上其他 `layer_id` 的 `unit_texts` 整行改挂到左半 unit，不按那些层的正文猜切点（`src/db/desktop/unitSplit.ts` 第 406–418 行）。测试已经固定：在翻译层上切开时，宿主转写「原文句子」整段留在左 unit，翻译按该层的 `cutIndex` 切开（`src/db/desktop/unitSplit.test.ts` 第 86–124 行）。右半若没有被切开的正文，就不插入空行。

合并按每个 `(layer_id, role)` 各自拼接，分隔符默认空格（`src/db/desktop/unitMerge.ts` 第 534–578、890–893 行）。两边都有正文时，该行 `provenance_json` 清空。编辑器覆盖只作用于传入的那一层。它不会用 IPA 的切分去改拼音，但会用同一个分隔符把该层左右两段接起来。

软删除会把该层和 `descendantIds` 一起标删除。后代包括 `parent_id` 子层，也包括 `layer_links.host_layer_id` 指向该层的层（`src/db/desktop/layerStructure.ts` 第 201–203、631–658 行）。因此今天删除 IPA 锚层，会把挂在它上面的符号关联层一并标删除。软删除不删 `unit_texts` 行；`listUnits` 要求文本层 `deleted_at IS NULL`，所以这些正文从列表消失。清除走外键，会删掉这些层上的正文行（同文件第 570 行起的 `purgeLayers`）。只删一个没有后代的正字法层，软删除只标该层，宿主 unit 还在。

拆分、合并、删除锚点的规则见上面第 4、5、8 条。缺的是这些规则，不是第二套 unit。

## 陷阱

- 用 `parent_id` 表示「拼音属于 IPA」。ADR-0132 已经把文本匹配放在 `layer_links`。`parent_id` 只参与删除恢复时的父层检查。
- 给正字法层新建自己的 unit，再把正文写在那些 unit 上。共享 segment 要求 `unit_texts.unit_id` 是 IPA 层的 unit，`layer_id` 是拼音或汉字层。
- 允许多个宿主。已经收进必须遵守的规则第 2 条：转写内容的符号关联层在写入处拒绝第二个宿主。`listUnits` 会把每个宿主的 unit 都列出来。翻译层仍可以有多个宿主，那条对话框不要套到正字法层上。
- 用 `time-subdivision`。子层会有自己的时间，规格目前也不放开。
- 把 `link_type` 的 `direct` / `free` / `literal` / `pedagogical` 当成正字法关系。列是必填的，创建时缺省写成 `free`。界面若显示成「意译」，就把正字法说成了翻译。
- 沿用 ELAN 的删父层级联，或沿用现在的 `descendantIds`，作为「删 IPA」的默认结果。第一版改为拒绝，见必须遵守的规则第 5 条。
- 沿用 ELAN「用父标注的值覆盖依赖标注」，在生成或编辑 IPA 时写进其他正字法的 `unit_texts`。

## 操作合同和现有代码的差距

方向仍是 adapt。这三处只补操作合同，不新增层类型，不复制 unit。合同已定，现有写入还没跟上。2026-11-24 对照代码核对过，没有跑测试。

1. **合并草稿：已定。** 确认框把未保存草稿单独标出。用户确认后才拼进该层正式正文并删除草稿；不确认则正式正文和草稿都不变。见规则 8。现有 `textPlan` 仍会优先用 `draft.raw_input` 直接写成 `unit_texts`（`src/db/desktop/unitMerge.ts` 第 552–578、243 行），再由 `deleteUnitTree` 删掉旧语段上的草稿（第 274–275 行）。实施时改掉这条隐式提交。验收要有一层正式正文和草稿不同的合并，关掉再打开，两套都读回。
2. **删除一格：已定。** 正字法层和翻译层的删除只清空本层这一格的正式正文和草稿。删除共享语段只在时间锚点层，见规则 12。现有 `removeUnit` 仍只收 `unitId` 并 `deleteUnitTree`（`src/db/desktop/unitEdges.ts` 第 345–350 行），从正字法层调用会删掉整段。实施时这条入口不能再接到 `removeUnit`。验收从正字法层发起清空，检查其他层还在，关掉再打开，撤销后只恢复这一格。锚点层的删除仍删整段，撤销恢复整段。
3. **拆分数据来源：已定。** 预览和切点都针对正式正文。未保存草稿只展示，确认后整段留在左段，不提交。见规则 4。现有 `moveDrafts` 只消费当前层草稿，其他层草稿整段改挂左段（`src/db/desktop/unitSplit.ts` 第 303–312、470–486 行）。实施时其他层的正式正文按确认的切点切，草稿不要跟着切，也不要写成正式正文。验收至少有一层同时有正式正文和不同草稿，覆盖拆分、重开、保存和撤销。
