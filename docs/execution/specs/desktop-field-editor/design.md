---
title: 工程字段与完整词典编辑规格
doc_type: execution-spec-design
status: draft
owner: repo
last_reviewed: 2026-11-01
source_of_truth: desktop-field-editor-spec
depends_on:
  - ../../../adr/0100-desktop-engineering-contract.md
---

# 字段、宿主和词典编辑（技术审阅稿）

代码锚点：`src/db/dmlexEntrySchema.ts`、`src/db/dmlexTypes.ts`、`src/db/desktop/customFieldValidation.ts`、`customFields.ts`与已接受的分析图字段规格。以下为目标编码，不是当前schema已支持。沿用[既有17宿主及唯一载体](../annotation-graph-rebuild/design.md#133-对象注册与唯一载体)，不平行复制到另一份通用值表。

## 宿主和身份

| 分组 | targetType／稳定定位 | 唯一值载体 |
| --- | --- | --- |
| 项目与语料 | project/manuscript/layer/unit/media/source/speaker | 既有custom_field_values，定义id＋宿主类型＋对象id |
| 备注与对话 | note/conversation/message | 既有custom_field_values；密钥和运行时私有对象不是宿主 |
| 语言目录 | language | languages.custom_fields_json |
| 正字法目录 | orthography/orthography-bridge | 既有custom_field_values，不改规则正文 |
| 词条与义项 | lexeme；lexeme-sense（lexemeId+senseId） | jieyu_json.customFields／senseCustomFields，DMLex entry_json不放应用扩展 |
| 词／语素及图 | analysis-node/relation（unitId+nodeId/relationId） | 图JSON customFields，不另挂在线性词项投影 |
| 词典例句 | lexeme-example（lexemeId+senseId+exampleKey，新增宿主提案） | jieyu_json.exampleCustomFields；exampleKey由应用维护稳定映射，不把数组下标当身份或往标准DMLex乱加属性 |

例句稳定key映射随复制／排序保存；导入无法证明相同例句身份则新分配，不凭同文猜。自定义引用ObjectRef增加例句复合身份；所有身份由授权项目会话限定，不接受跨项目路径。字段定义名改动不改id，同名不合并。词典资源记录沿用lexeme既有种类，不额外造并行字典库。

## 定义与值编码

定义沿用id/targetType/name/description/helpText/sortOrder/revision/options，加`schemaVersion:2`、`valueType`与`repeated`。name等为语言映射；option保稳定id，显示名非查询身份。旧number映射decimal、text等保持语义，旧url约束保留，不撤已有URL字段。

| valueType | JSON值（repeated=false）／查询 | 校验 |
| --- | --- | --- |
| text | string／完整或包含／正则 | 不自动trim；空字符串与缺失不同，必填不接受空或纯空白 |
| multilingual-text | `{langTag:string}`／明确语言或ANY | 语言标签规范化以防重复，文本保原样；必填至少一种非空，显式要求的语言均须满足 |
| integer | JSON安全整数／数值比较 | 无NaN/Infinity，越JS安全整数拒绝而非舍入 |
| decimal | 有限JSON number／数值比较 | IEEE754 double，说明精度；不冒充任意精度财务数；min/max同类型 |
| boolean | true/false／等值 | false是有效值，不等于缺失 |
| date | `YYYY-MM-DD`／日历日期比较 | 有效公历日期、不带时区，不把采集日期变成UTC时间戳 |
| select | optionId／稳定身份比较 | 必须属于定义；label改名不改值 |
| multiselect | 有序无重复optionId[]／集合ANY/ALL | 空集与缺失不同，必填至少一项；repeated必须false，避免数组套数组 |
| ref | ObjectRef／身份、目标有效性与目标字段 | 必须同项目、允许targetTypes；新绑定有效，失效旧引用按ADR处理 |
| url（既有） | string／文字比较 | 校验协议格式，保存不授权网络访问；保留旧pattern能力并改用可控匹配 |

repeated=true时值为有序`[{itemId,value}]`，itemId稳定，删除/排序不导致其他项失去身份；不允许任意嵌套对象。定义明确repeated/minItems/maxItems，约束作用于外层重复项；multiselect/ref-many的基数作用于其既有集合，两者不得同用。旧ref many、multiselect沿用集合值，不额外再重复一层。JSON中未出现字段表示missing；`null`不是研究值，空数组／空文本不是自动缺失；required另外检查非空有效值，必填重复字段至少一个满足必填的项，不能用[{value:""}]绕过。多语言值的语言键采用BCP47规范化匹配，旧正字法formKey不是语言标签，不能当langTag强制改写。操作remove明确移除，不能用undefined混作删除。值的valid/pending/deleted-target由主进程派生，不信客户端布尔声明。

必填表示当前值满足该类型、基数与有效目标；非法新输入持久草稿，不破坏正式值。批量填值须用户明确选值与范围，不以defaultValue自动编造旧研究结论。当前代码类型表未包含多语、整数、日期、通用重复值；需要未来载荷/格式版本决策，禁止补旧文件列。

## 全模型词典控件与校验表

`[]`均提供增/删/重排、稳定焦点返回；条目原有未知附带数据不因表单保存丢失。模型可选性沿实际schema，不擅加“每义项必须有释义”等研究规则。

| 路径 | 编辑控件／校验 |
| --- | --- |
| headword/homographNumber | 文字／同形号；headword正式版非空，同形不强制合并 |
| partsOfSpeech[]/labels[] | 项目受控值多选，可新建定义；保持全部值和顺序 |
| pronunciations[].soundFile | 媒体/附件选择，存合法引用；缺媒体有明确状态，非任意本机路径 |
| pronunciations[].transcriptions[].text/scheme；pronunciations[].labels[] | 成组重复文字与方案；有转写数组则至少一项，text非空 |
| inflectedForms[].text/tag/labels[] | 重复屈折形式、类型、标签；text非空，不只显示第一项 |
| senses[].id/indicator/labels[] | 稳定义项id只读、指示文字、标签；移/删走影响预览 |
| senses[].definitions[].text/definitionType | 重复释义；text非空，类型选择；不把长释义充当专用gloss |
| senses[].examples[].text/sourceIdentity/sourceElaboration/soundFile/labels[] | 例句重复组，text非空；来源文字与应用片段绑定分别编辑，快照差异不静默覆盖 |
| examples[].exampleTranslations[].text/langCode/labels[] | 逐语言重复译文；text非空，显示语言，保持所有译文 |
| senses[].headwordExplanations[].text/langCode | 词头说明重复组、语言选择，text非空 |
| senses[].headwordTranslations[].text/langCode/partsOfSpeech[]/labels[] | 多语词头译法与词类标签，不压成一字符串 |
| etymologies[].description/etymons[] | 重复词源与说明；etymonUnits若提供至少一项 |
| etymons[].etymonUnits[].langCode/text；when/type/note | 来源语言、形式、时间说明、类型与备注；沿schema类型，不擅把when当日期 |
| resource/title/langCode/translationLanguages/relations/relationTypes/受控表 | 资源设置页维护；标准字段以vendored DMLex schema枚举（当前dmlexTypes仅有子集），已有schema未覆盖项不能自动删掉 |
| jieyu notes/anchoredNotes/category、tags/accessRights/attachments | 备注正文、分类、权限与附件专用入口；身份/来源/时间只读，删除仍走业务操作 |
| 专用义项gloss（应用扩展） | `jieyu_json.senseGlosses[senseId]`多语映射提案，绑定填空须显式选择项目gloss语言；无该语言值不猜回退 |
| resource.uri／definitionTypeTags/inflectedFormTags/labelTags/labelTypeTags/partOfSpeechTags/sourceIdentityTags/transcriptionSchemeTags | URI、受控表编辑；各tag及description/for/sameAs/typeTag按vendored schema，不丢顶层表 |
| resource.etymonLanguages/etymonTypes | langCode/displayName/sameAs与type/description/sameAs；由选择器引用 |
| relations[].type/description/members[].ref/role/obverseListingOrder | 显式关系、成员选择和次序；ref存在，基数/角色按relationType校验 |
| relationTypes[].type/scopeRestriction/description/memberTypes/sameAs | 类型与范围；memberTypes的role/type/min/max/hint/description/sameAs逐项维护，不任意改内部id |
| entry.placeholderMarkers；definition/example/exampleTranslation的headwordMarkers/collocateMarkers | 范围选择控件而非手写偏移；collocate的lemma/labels/id可维护，标记范围随对应文本版本核对 |
| inflectedForms[].pronunciations；headwordTranslations[].pronunciations/inflectedForms/placeholderMarkers | 复用上述成组控件，递归层次按标准schema，不新造用户嵌套类型 |
| etymonUnits[].reconstructed/partsOfSpeech/translation | 布尔、词类与翻译文字，不因当前精简Zod缺字段丢标准原数据 |
| 自定义字段／例句来源快照 | 按上表类型渲染，分别显示未生效草稿和正式值；关联选择非可改id文本框 |

nested ids由既有dmlexNestedIds路径复用；例句exampleKey只用于应用扩展，不改变DMLex标准字段。需要完整标准字段补齐时在原DMLex schema/类型模块上补齐，不新造第二套词典模型。全字段保存用声明字段patch和修订，不能重新构造一个只含可见字段的entry覆盖其余内容。

## 迁移和引用

定义变更草稿`{draftId,baseDefinitionRevision,newDefinition,scopeDigest,conversions,baseFieldRevisions}`，转换为封闭确定性操作，不执行JS脚本。commit事务重算完整影响集合与版本、校验所有现有适用对象；新增/修改、删除/恢复导致适用集合变化均冲突。不能只检查原预览中的对象而漏掉后来新增的必填宿主。关闭重开可续准备草稿，正式查询继续用旧定义。

历史保留旧定义和值，恢复重新转换校验；字段定义永久清除沿ADR-0090专用范围，不能和普通历史清理混淆。引用目标永久清除先预览：非必填明确解除也须删除当前有效关系、留下显示快照；必填无替代则阻止目标清除。无关值不改。验证逐宿主×类型×重复×缺失×引用状态，必须写后重开查询/导出，不以表存在结案。
