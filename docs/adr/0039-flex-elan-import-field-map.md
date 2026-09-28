---
title: ADR 0039 - FLEx 与 ELAN 按说明文档映射到已有字段
doc_type: adr
status: active
owner: transcription
last_reviewed: 2026-09-28
source_of_truth: decision
---

# ADR 0039 — FLEx 与 ELAN 按说明文档映射到已有字段

## 背景

[ADR 0038](./0038-eaf-tier-pick-by-content.md) 把能拆开的 FLEx 层名收成「任意元素上的 `gls`、`lit` 都是翻译」。多续语因此把 `word-gls`、`morph-gls`、`word-pos` 写成了转写页的翻译行。`A_phrase-segnum-en` 在没有短语 `txt` 时被退回成转写正文，时间轴上是段号。

说明文档把条目类型绑在元素上，不绑在语言类型 id 上。核对过的原文是：

- ELAN 现行手册《Fieldworks Language Explorer (FLEx) file》：层名是 `<Speaker>_<element>-<item-type>-<language>`。说话人前缀默认是 A、B、C。短语父层默认是 `item type="txt"`，可以改成 `segnum`。时间在短语上，单位是毫秒。`interlinear-text` 里的标题和其他信息可以变成层。另有选项把含说话人代码的 `note` 写入 `PARTICIPANT`。
- ELAN《EAF Annotation Format 3.0》：`TIME_UNITS` 默认毫秒，ELAN 只认毫秒。`PARTICIPANT` 是参与者 id。语言是 `LANG_REF` 指向的 `LANGUAGE`。`DEFAULT_LOCALE` 用来选输入法。`LINGUISTIC_TYPE` 的 `CONSTRAINTS` 只说明依附方式：无约束的顶层、`Time_Subdivision`、`Included_In`、`Symbolic_Subdivision`、`Symbolic_Association`。
- Ken Zook《Technical Notes on FLEx Text Interlinear》（2026-05-04），以及 FieldWorks 的 `FlexInterlinear.xsd`。

XSD 的已知 `item` 类型是 `txt`、`cf`、`hn`、`variantTypes`、`gls`、`msa`、`pos`、`title`、`title-abbreviation`、`source`、`comment`、`text-is-translation`、`description`、`punct`。`item@type` 还允许任意字符串。Ken Zook 把短语上的 `gls`、`lit`、`note`、`segnum` 写成自由翻译、直译、备注和段号。词性是 `pos`。XSD 里没有 `ps`。

官方容器是 `interlinear-text`、`paragraph`、`phrase`、`word`、`morph`。开放语料里还有写在同一槽位上的别名，本决定把它们列成闭集，不做子串猜测。

DoReCo 的 `tx`、`ft`、`ref`、`wd`、`mb`、`gl`、`ps` 不在上述文档里。拆不开层名时仍用 ADR 0038 的记号表。

## 决策

1. 两条导入路径共用这一张表。`.eaf` 读层名槽位。`.flextext` 读 `item@type` 和它所在的元素。语言类型 id 不参与。已保存的 `eafTierRoles` 仍优先。
2. 只写入解语已有字段。没有对应字段的已知类型不建层。转写页只接收短语级转写和短语级翻译。词、语素、词性进 `unit_tokens` 和 `unit_morphemes`。

| 文档中的位置 | 解语字段 |
| --- | --- |
| `phrase` 的 `txt` | 句子正文。每种书写系统里，优先 `languages/language@vernacular="true"` 的那一条 |
| 没有短语 `txt`，但有 `word` 的 `txt` | 句子正文是这些词形按 `PREVIOUS_ANNOTATION` 顺序拼成的基线。不改用 `gls` 或段号 |
| 短语 `txt` 和词层都没有 | 句子正文留空。短语 `gls` 仍是翻译行 |
| `phrase` 的 `gls`、`lit` | 翻译行。每种书写系统一行。`lit` 不并进 `gls` |
| `phrase` 的 `note` | 该句 `user_notes`，类别 `comment`。ELAN 已把这条写进 `PARTICIPANT` 时，不再把同一字符串建成第二个人 |
| `phrase` 的 `segnum` | 段号写入该句 `user_notes`。这一层是短语父层时，时间取自它 |
| `phrase@speaker`，或 EAF 的 `TIER@PARTICIPANT` | 一个 `speakers.name`。短语句子的 `speakerId` 指向它。词层和语素层不另建说话人。前缀 A、B、C 不是名字 |
| `PARTICIPANT` 为空或为 `***` | 不建说话人，`speakerId` 留空。`***` 是语料里的空说话人记号，说明文档没有这个字面量 |
| `word` 的 `txt`、`gls`、`pos` | `unit_tokens` 的 `form`、`gloss`、`pos`。语言键用 `item@lang` 或层的 `LANG_REF` |
| `word` 的 `punct` | 跟在相邻词形后，不单开一层 |
| `morph` 的 `txt`、`gls`、`msa` | `unit_morphemes` 的 `form`、`gloss`、`pos` |
| `morph` 的 `cf`、`hn`，`morph@type` | 不写。flextext 不带词库 guid，`cf` 不能变成 `lexemeId` |
| `interlinear-text` 的 `title` | 文档标题仍空时写入 `texts.title`，每种书写系统一个键。已有标题时写成文本级 `user_notes` |
| `interlinear-text` 的 `source` | 文本级 `user_notes`，类别 `fieldwork` |
| `interlinear-text` 的 `comment`、`description`、`title-abbreviation` | 文本级 `user_notes`，类别 `comment` |
| `paragraph` | 只给短语分组 |
| `media-files/media@location`，EAF 的 `MEDIA_DESCRIPTOR` | 按文件名绑定已有媒体。不新建 0 时长音频 |
| `variantTypes`、`text-is-translation` | 不写，计入丢失清单。说明文档没有把 `text-is-translation` 定成自由翻译 |

3. 元素槽位的闭集别名，大小写不敏感：`句子`、`Transcription`、`Transcribe` 视同 `phrase`；`Translation`、`翻译` 视同短语级翻译的元素，只和 `gls`、`lit` 一起用；`单词` 视同 `word`；`语素` 视同 `morph`；`Interlinear` 视同 `interlinear-text`。名单以外的元素不靠子串升成转写或翻译。
4. 归类先看槽位，再按 `PARENT_REF` 把子层挂到父层。文档顺序不能把尚未登记的词层子层掉进翻译行。`word` 或 `morph` 上的 `gls`、`pos`、`msa` 不是翻译。
5. ADR 0038 第 3 条的最后退回不用于 `segnum` 父层。两个及以上短语级 `txt` 仍走现有角色对话框。对话框不含词层、语素层、段号层和行文本信息。判断唯一时不弹窗。`proposeEafTierRoles` 保持先到先得，不在这里改。
6. flextext 的 `begin-time-offset`、`end-time-offset` 按毫秒读，写入解语时除以 1000。导出时把解语的秒乘 1000。不按数值大小猜测单位。短语级 `gls` 的条数按书写系统保留，不把词级 `gls` 拼进短语译文。
7. 语言优先用 `LANG_REF` 或 `item@lang`。`DEFAULT_LOCALE` 只在 `LANG_REF` 为空时沿用 [ADR 0036](./0036-eaf-import-is-interchange.md) 第 6 条的退回。flextext 的词注释和语素注释不再写死 `eng`。
8. 不新增 Dexie 版本，不新增 controller，不新增 feature flag。`useImportExport.importHandlers.ts` 不增加选层判断。解析结果里已经分开的翻译行、词项、备注和说话人，由现有写入循环落库。分类放在 `EafService` 旁边的纯函数，避免把 `EafService.ts` 再堆过架构热点。

## 影响

- 多续语一类文件：转写页不再出现词注释、语素注释和词性行。段号进备注。没有短语 `txt` 时，句子正文是词形基线。
- 帕劳语、沃莱艾语的 `Transcription` + `txt` 与 `Translation` + `gls` 仍是转写和翻译。
- DoReCo 的 `tx`、`ft`、`wd`、`mb`、`gl`、`ps` 归类不变。`ps` 仍是 DoReCo 的词性层名，不是 flextext 的 `pos`。
- 解语自己导出的 flextext 时间单位改为毫秒。旧的「属性里的数字就是秒」不再成立。

切片见 [FLEx 与 ELAN 导入字段映射](../execution/plans/FLEx与ELAN导入字段映射-2026-09-28.md)。

## 不采纳

- 把任意 `gls` 收成转写页翻译行。
- 用语言类型 id、或层名子串，判断项目类型。
- 为 `cf`、`hn`、`morph@type`、`variantTypes`、`text-is-translation` 新增字段。
- 把 `segnum` 或短语 `gls` 升成句子正文。
- 按数值大小区分 flextext 的秒和毫秒。
- 改 TextGrid、Toolbox、TRS、LIFT 的默认归类。ADR 0037 第 4 条对这三种标注格式仍然有效。
- 把 DoReCo 记号表改成 FLEx 的元素表。

## 回顾

本决定取代 ADR 0038 里「项目类型 `gls`、`lit` 不论元素都是翻译」，以及「只有 `phrase`、`句子`、`transcription` 加 `txt` 才是转写」这两句。ADR 0038 的内容锚点、DoReCo 记号、一句对一句的细分、没有媒体时的翻译挂接和 `guessed-tier` 继续有效。
