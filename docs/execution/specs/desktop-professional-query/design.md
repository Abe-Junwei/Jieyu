---
title: Jieyu Query v1 技术审阅稿
doc_type: execution-spec-design
status: draft
owner: repo
last_reviewed: 2026-11-01
source_of_truth: desktop-professional-query-spec
depends_on:
  - ../../../adr/0100-desktop-engineering-contract.md
---

# Jieyu Query v1（JQ1）

这是供实现与审阅的具体语法提案，不是已经实现或另行确认的外部兼容标准。产品语义以 ADR-0100 E09–E10 为准；不实现 SQL、AQL 或 ELAN 查询文件兼容。

## 1. 成熟方案扫描 / Research

适配[AQL对象与关系](https://korpling.github.io/ANNIS/4/user-guide/aql/operators.html)和[ELAN多层时间查询](https://www.mpi.nl/tools/elan/docs/manual/Sec_Multiple_Layer_Search_Tab.html)，复用corpusQuery定位而非其子串语义。不兼容AQL文件；token覆盖不是毫秒重叠，拒绝整串文本替换或静默删条件。类型化自定义字段与局部复核是解语自身语义；正则/资源与跨窗执行另见[执行规格](../desktop-query-execution/design.md)。

## 文法与词法

```ebnf
query = "JQ1", "FROM", binding, { ",", binding }, "WHERE", expr, ";" ;
binding = kind, ident ;
kind = "segment" | "token" | "morpheme" | "point" ;
expr = disjunction ;
disjunction = conjunction, { "OR", conjunction } ;
conjunction = unary, { "AND", unary } ;
unary = [ "NOT" ], ( "(", expr, ")" | predicate ) ;
predicate = field, comparison, literal, [ "CASEFOLD" ] | call | quantified ;
quantified = ( "ANY" | "ALL" ), ident, "IN", field, "SATISFIES", "(", expr, ")" ;
comparison = "=" | "!=" | "<" | "<=" | ">" | ">=" | "CONTAINS" | "MATCHES" ;
call = ident, "(", [ argument, { ",", argument } ], ")" ;
argument = field | literal | ident ;
field = ident, accessor, { accessor } ;
accessor = ".", ident | "[", string, "]" ;
literal = string | number | "true" | "false" ;
ident = letter, { letter | digit | "_" } ;
```

关键字大小写不敏感，别名、字段键和内置函数名区分大小写（内置函数名限下表小写）；ident仅ASCII，研究文本用JSON双引号字符串（含标准转义），数字为JSON有限数，无隐式字符串转数字。注释为行首或空白后的`//`到行末，字符串内不解释。保留原文本、注释、源位置，不靠AST重新打印覆盖手写文本。诊断同时给UTF-16 start/end与行列，界面按字素簇高亮，不切断附标。

执行文档保存`{languageVersion:1,text,scope,options,bindings}`；scope包含项目会话内稿件/层/说话人/时间筛选、状态可见性；options为timeoutMs/resultLimit，沿ADR上限。bindings是字符串常量使用的项目引用表，仅带身份类型的AST节点进入bindings，普通词形字符串不进入；字段/目录引用必须以稳定id表示，不把显示名变成身份。scope默认全项目未删除稿件。文本不携带任意项目路径或SQL。

## 字段与算子

| 对象／字段 | 类型／默认文字方式 |
| --- | --- |
| segment.text / translation / note | 文本／包含；translation需在执行文档绑定语言，省略时明确任意语言并返回命中语言 |
| token.form / morpheme.form | 文本／完整值，文字版本由formKey明确；不把显示回退当查询回退 |
| token.gloss / morpheme.gloss | 多语言文本／完整值；语法标签用has_tag，不按子串猜 |
| token.pos / morpheme.pos | 项目目录身份／完整值，传id；无值状态另查 |
| segment.start_ms/end_ms / point.time_ms | 文献轴为毫秒整数；scope.timeAxis默认document。media轴返回映射后的毫秒有限数，可含小数，不为查询再次量化；point只有time_ms |
| point.text | 文本／包含；没有end或duration，访问即类型错误 |
| a.cf["definition-id"] | 定义决定类型；第二下标可选语言标签，仅多语言值合法 |
| a.speaker / a.manuscript / a.layer / a.sense / a.lexeme / a.project | 封闭的上下文路径，可读其已注册字段及cf；无关联则缺失，不按同名猜目标 |

`=`显式完整值、`CONTAINS`显式包含、`MATCHES`显式正则；构建器为未选择方式的字段填入表中默认方式，文本本身没有隐含比较符。封闭字段注册表校验每层accessor，禁止任意JSON路径、对象prototype访问或未知调用；数值/布尔/日期不允许CONTAINS/MATCHES，日期字面量按字段类型严格解析，select仅按optionId等值；ref不接受裸字符串比较，使用下表ref_equals解析bindings中的完整复合身份，范围调用逐项检查类型与min≤max。CASEFOLD只用于文字，标签始终不区分大小写。普通比较前仅对比较副本NFC，不改原文；正则输入NFC，模式保持原样，不盲目规范化字符类，组合形式差异在编辑器说明。大小写采用锁定运行时Unicode的simple case folding（不使用地域规则，不做完整字符串展开折叠），不去附标。

| 调用 | 精确含义 |
| --- | --- |
| missing(a.field), pending(a.field), unregistered(a.field) | 分别检索缺值、待复核、未登记；不把三者并为一个空值 |
| has_tag(a.gloss,"tag-id") | 识别标签身份，别名／大小写按项目标签表；gloss原文不变 |
| ref_equals(a.field,"binding-id") | 引用字段与执行文档bindings中的完整ObjectRef比较；缺绑定/类型不合报错，绝不仅比targetId |
| same(a,b), different(a,b) | 同实例／不同实例；same要求兼容类型 |
| same_segment(a,b), same_manuscript(a,b) | 明确共同范围，不暗含先后或结构对应 |
| part_of(child,parent), aligned(a,b,"role-id"), bound_to(a,"lexeme-id","sense-id") | part_of仅直接父子，不隐含递归；bound_to用词条＋义项复合身份；当前有效显式关系，aligned必须显式给关系角色，非时间推断 |
| word_gap(a,b,min,max), morph_gap(a,b,min,max) | 有方向、同序列；中间隔N个词／语素，相邻0；min/max为非负整数、有限max |
| segment_gap(a,b,min,max) | 同层相邻序列，有方向；直接下一段0，跨稿拒绝，max有限 |
| start_delta(a,b,min,max), end_delta(a,b,min,max) | 区间用start/end，点用唯一time；t(b)-t(a)，毫秒、有符号、两端包含 |
| interval_gap(a,b,min,max), overlap_ms(a,b,min,max) | 仅两个区间：start(b)-end(a)可负；overlap_ms必须有正时长交集且位于给定范围，接触/分离均false，零重叠用NOT overlap_ms或touches明确表达 |
| point_in(p,s), touches(a,b) | 点归属左闭右开、媒体终端点例外；共边接触不等于重叠 |
| any_value(a.field,"op",value), all_values(a.field,"op",value) | 重复值显式量词；all要求至少一个有效值，缺值不空真 |

普通NOT/!=在其实际依赖缺失、待复核或所用标签条件依赖的缩写未登记时产生unknown（直接gloss文本比较不依赖标签登记）；三值AND/OR/NOT，最终只收true。状态调用可显式命中待复核对象，但不会据此让旧内容具有有效分析资格。重复字段正向比较默认ANY；`f != x`严格定义为`NOT(f = x)`，不是“存在另一值不等于x”。要找不同值用ANY显式表达；集合里有未知值且不能证明否定为真则unknown。`ANY v IN a.cf["id"] SATISFIES (v.value >= 1 AND v.value <= 3)`约束同一个值，两个独立ANY可匹配不同值。v仅在子表达式内可见、不得遮蔽外层别名；v.value／v.lang／v.ref按定义类型开放。ALL要求至少一个值且所有值均有效满足，不以空集合或被过滤的待复核值制造真。

## 对象、关系与结果

每个AND分支内声明对象须由显式关系连成图；OR各分支分别验证，不能用别分支的关系给当前分支背书。NOT内关系不建立正向绑定；编译器用分支约束分析而非无限展开DNF，分析预算耗尽准确拒绝，不猜连通。不同别名默认不同实例，same显式放宽。词距不能跨顺序待复核范围，gloss待复核不废有效词序。跨段时间关系必须同稿且每条上界有限；整查询不能凭关系链跨稿；same_manuscript本身不是有界关系，跨段对象还须由正向的segment_gap或有限时间窗约束连通，仅共同稿件条件拒绝执行。

结果锚点由匹配对象的最小句段范围确定；point独立结果锚点为点身份及时间，有结构所属句段则同时返回，不凭时间伪造结构归属。记录`queryId,snapshotRevision,scope,range,bindings,hits,completion,freshness`。同段合并全部命中；跨段只并相同起止身份范围；不同层同时间不能只按时间戳误并。一个保留范围未枚举完整即不算完成，预算耗尽回未完成，不假装完整截断。

## 例子与构建器

```text
JQ1 FROM token a, token b WHERE a.form = "pa" AND has_tag(b.gloss,"tag-pst") AND word_gap(a,b,0,0);
JQ1 FROM segment a, segment b WHERE a.text CONTAINS "山" AND b.text CONTAINS "路" AND segment_gap(a,b,0,1);
```

构建器条件卡一张对象卡对应一个别名；同卡字段AND，跨卡显式连关系；OR保留分组。全部v1基本算子可编辑，复杂嵌套NOT/OR可只读展示；合法文本从不被丢弃。解析失败停留文本并定位，不执行上次AST冒充当前输入。编辑构建器时生成候选文本，用户确认简化才覆盖无法表达的文本。保存含语法错误的查询草稿允许，执行必须重新通过解析、绑定、类型、依赖和资源校验。

审查例：多值[PST,PRS]的`!=PST`为false，ANY值不等于PST为true；同稿两段仅same_manuscript报无有界关系；点访问end_ms报类型错误；scale=1.5时媒体轴333ms文献点为499.5ms，不在查询中舍入。
