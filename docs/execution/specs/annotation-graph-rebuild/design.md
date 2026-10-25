---
title: annotation-graph-rebuild design
doc_type: execution-spec-design
status: draft
owner: repo
last_reviewed: 2026-10-25
source_of_truth: annotation-graph-rebuild-spec
depends_on:
  - ./requirements.md
---

# Design — R1 字段归属与重建合同草案

## 1. 成熟方案扫描 / Research

- [Xigt Data Model](https://github.com/xigt/xigt/wiki/Data-Model)：对齐引用可以选择多个目标或目标片段；复用已有 hasPart/surfaceParts，不用字符串拼接替代跨度。
- [W3C Web Annotation](https://www.w3.org/TR/annotation-model/)：正文和目标分离，适合核对备注关联；不引入 JSON-LD 或替换内部模型。
- 仓库 `annotationRetokenize.ts` 已把 forms/glosses 放入 features 快照，证明现有容器可表达这些数据；但快照编解码不完整，不直接复用为持久模型。
- 适配现有图和 zod：实验用保留的 features 键验证完整载荷，生产落地必须加严格校验。避免另建完整词项正文表、从 UI 单字符串逆推、把不透明 features 当成已验证领域数据。
- 代价：图体积增加；已有 projector/exporter 必须改为从完整真值生成显示层。无新增依赖。外部规范只核对表达，不宣称交换认证通过。

## 2. 逐字段归属（建议，待 R1 决定草案确认）

| 现有字段 | 真值／推导来源 | 线性投影与修改规则 |
| --- | --- | --- |
| token/morpheme.id | 项目内稳定的图节点 id | 作为行 id；新建/导入局部 id 先映射到项目 id，重排不换 id，不按词形猜同一节点 |
| textId | 当前项目库 | 不复制进新词项行；实验借用旧校验器时补合成 project-a，仅为现有类型适配 |
| unitId | 当前图所属 units 行 | 投影补回所属 unit；不得跨语段移动同一节点以“复用” id |
| tokenIndex / morphemeIndex | token/morpheme 节点完整载荷的非负 index | 原序号保留，包括合法间隔；next 由同级 index 排序生成，不反向从节点数组位置猜顺序 |
| morpheme.tokenId | 唯一 token→morpheme 的 hasPart | 重建时必须唯一；零节点等非线性 hasPart 不生成词素行 |
| form | 节点完整载荷的正字法→字符串映射 | 所有键和值原样保留，不 trim/大小写化，不用 label 补值；default 等现有键不假装为目录外键 |
| gloss | 节点完整载荷的语言→字符串映射 | 保留缺省与显式空对象的区别，编辑某语言不删其他语言；不得用 displayGloss 逆推 |
| pos | 节点完整载荷的词类值 | 与词条 entry.partsOfSpeech 分开；词条建议不自动变成已接受 POS |
| token.languageId | 节点完整载荷的语言引用 | 投影保留；目录存在性由后续业务事务核对，不把显示语言当对象语言 |
| token/morpheme.lexemeId | 节点完整载荷中的现有直接词条引用 | 保留原语义与值，不从第一条 sense 链接任意挑一条覆盖；与完整 links 一并核对，不静默合并冲突 |
| morpheme.surfaceParts | 图节点 surfaceParts 的 tokenId + offset | offset 与所指表层词形绑定；同一个 token 的多片段可重建，不从“a…a”拆跨度；换正字法后的跨度迁移不在本片决定 |
| provenance（词项） | 节点上的完整 ProvenanceEnvelope | actor、method、taskId、model/version、参数、审校和时间全部保留，重建不伪造新作者或审校状态 |
| createdAt / updatedAt（词项） | 节点的记录元数据 | 重建沿用；真实业务编辑才更新 updatedAt，不以重建时间覆盖历史 |
| 词义链接 id | linksLexeme relation 的稳定 id | 一条关系对应一条线性索引；同一目标可以有多条，不用 lexemeId/senseId 拼接替代 id |
| targetType / targetId | relation.source 指向的 token/morpheme | 类型与目标必须对应；非线性复杂链接继续留图，不伪造 token 索引 |
| lexemeId / senseId（链接） | relation 的 lexemeRef 目标及链接载荷 | 两者组合才识别义项；两个词条可有同名 sense；无 sense 的条目级链接也有效 |
| role / confidence（链接） | linksLexeme 的完整载荷 | 缺省保留；有值时校验既有枚举和有限 [0,1]，不从当前 UI 默认值补写 |
| provenance / createdAt / updatedAt（链接） | linksLexeme 的完整载荷 | 重建保留，不用词项来源代替链接来源；payload 与关系 id/目标矛盾时拒绝 |
| notes 的 id/目标/正文/category/provenance/时间及可选定位字段 | 独立 notes 行 | 不由 graph 的 note 节点覆盖；重建不删 notes。目标节点消失的卸下/待复核语义继续由 R4 决定 |
| graph.text / displayGloss / label | graph.text 是所分析正文快照；另两项是显示数据 | unit_texts 是正文真值；显示内容不反向覆盖完整映射。正文变更失效规则见 R2/R4 |
| 非线性节点、typed relations、projectionDiagnostics | 原图 | 保留零词素、MWE、形态过程及关系；线性行不是整个图的往返载体，不可从线性行重造全图 |

## 3. 实验编码与防止双真值

实验临时键为 token/morpheme.features.jieyuLinear（form/gloss/pos/lexemeId/token.languageId/index/createdAt/updatedAt）及 jieyuProvenance；linksLexeme.features.jieyuLexemeLink 保留链接其余完整字段。键名不是已冻结协议，生产不接此实验。
label、普通显示 gloss/POS 节点、next、displayGloss 是由完整载荷及显示上下文生成的投影；复杂语义 gloss/POS/feature 关系仍保留为图语义。实施时必须标识并只重建“显示镜像”节点，不能删除全部同类型节点。禁止完整载荷与显示镜像分别可编辑；旧消费者必须适配后才可接替。
实验只证明 JSON 容器能完整往返，不宣称已解决显示镜像标识、任意复杂图投影、全部外部格式互操作或生产校验。上述生产规则保留在任务中，不能因六个测试通过而放行。

## 4. 稳定身份与引用

当前图校验只限制图内节点/关系不重名，fixture 的 rel-1 等在不同图可重复。建议仅要求投影节点和词义索引 relation 的持久 id 在对应项目表作用域唯一；一般关系无需全项目改 id。新来源的局部 id 首次接收时分配 newId，并一次映射所有边/跨度/链接/备注；内部编辑不再重新分配。重导入如何复用已有节点另在交换片核对，不按相同词形或相同数组位置自动合并。
实验检测两个语段复用同一线性节点 id 的冲突，未实现 id 分配器，也不把检测通过当作导入稳定身份已交付。

## 5. 写入与重建顺序（接替目标）

人工编辑、导入和候选接受共用一份完整标注状态、一套校验和一个提交入口。调用方提交业务操作和预期版本，不提交整份快照。主进程读取完整现值、合并、校验。界面把旧快照整份送回会覆盖已经保存的其他内容。

| 路径 | 调用方提交 | 主进程如何使用完整状态 |
| --- | --- | --- |
| 人工编辑 | 某节点、某正字法词形或某语言 gloss 的修改 | 在完整现值上应用补丁，保留其余映射、关系和来源 |
| 导入 | 外部材料转换成的领域数据，以及本次覆盖范围 | 新建时组成完整状态；更新时保留该格式没有提供的内容。没提供不是删除 |
| 候选接受 | 候选内容、生成基线和接受动作 | 核对当前版本后形成新的已接受状态。待定候选只保存候选，不改当前状态 |

提交过程只有一套：读取完整当前状态 → 核对版本和写入资格 → 应用操作 → 完整校验 → 同步图、词项投影及词义索引 → 事务内读回 → 提交并返回。之后不再向调用方开放可以绕过图的独立词项写入。

完整状态包括全部正字法词形、全部语言 gloss、POS、跨度、非线性关系、稳定身份和来源。词条正文、语言目录、录音和备注仍是各自的记录，用引用关联。一次操作影响到这些关联时，在同一事务里检查和处理。不把整个项目塞进一份图 JSON。

候选在被接受前不执行实时投影。不能从 `AnnotationIgtRow` 回构持久真值。版本、曾经接受、正文失效快照和恢复按 [ADR-0089](../../../adr/0089-analysis-generation-accept-and-restore.md)。本片实验只证明完整载荷可以往返，没有验证这个提交入口。顺序是：确认第 7 节字段合同，然后实现入口并逐一接三条路径。R5 和 R6 不在这个入口里定。同一合成材料分别走三条入口，关闭重开后语言内容和关联一致，来源按实际入口保留。M1 范围不变。

正文修改另有 units.updateText，但正文、快照、清图、投影/关联卸下和代际推进必须同一事务；不能保存正文后第二次调用清图。详细边界见[规格](../desktop-domain-write-boundaries/design.md)。R1 的详细字段合同在规格确认，只有真值归属等新增取舍需要 ADR，不以取得编号作为实现前置。

## 6. 验证与落位

独立实验在 `scripts/experiments/annotation-graph-roundtrip.test.ts`，生产没有引用。运行 `npx vitest run scripts/experiments/annotation-graph-roundtrip.test.ts --maxWorkers=1`。
六项检查：现有路径信息丢失复现；完整图 JSON 往返及独立备注；局部编辑不改身份；非法映射拒绝；父关系/词义冲突拒绝；图内 id 与项目主键作用域冲突。
未来完整关闭重开、失败回滚和 UI 验收仍按上级 A1/A2；本轮没有 SQLite、事务或 Electron 验收证据。

## 7. 待确认的 ADR 文本（未分配编号）

拟题：图中的完整词项载荷与稳定身份。仓库 ADR 目录仅接受已接受记录，确认后再分配编号落档。

proposed，待用户确认，不覆盖任何已接受决定，也不开始生产实现。R1 核对表明现有图的单个 label 无法重建多正字法词形和多语 gloss；只复制当前 IGT 视图会丢失未显示数据。ADR-0088 已决定图为真值、词项为投影，需要补齐可执行的真值边界。

### 建议决定

在已有图的词项节点中保存经过严格校验的完整词形、gloss、词类及相关记录元数据；词义链接的完整身份和来源随 typed relation 保存，专用链接表作为可重建索引。显示字符串是从这些完整内容生成的视图，不允许与完整内容各自写入。非线性图语义不被线性重建替代；用户备注继续是独立记录，不混进词项载荷。

投影节点使用项目内稳定身份；来自不同来源或语段的局部同名 id 不能直接当项目表主键。首次接收新节点时分配项目 id 并一致映射引用；内部修改和重排沿用 id。一般不落表的图关系仍可使用图内身份，不要求所有 fixture id 全局化。

### 取舍与后果

- 相比保留词项表作为第二份正文，完整载荷使投影损坏或被卸下后仍可从图重建，代价是图更大、领域校验更严格，现有 UI/导入/导出读写必须适配。
- 相比只保存 label、或从旧投影补回缺值，完整载荷避免隐藏语言、来源和链接身份依赖旧缓存。不能在缺载荷时静默使用 label。
- 沿用 typed relations 和 surfaceParts，不引入第二套节点表或外部通用图模型。字段编码、显示镜像、接口与实验见本规格，不在此维护清单。
- 本草案不决定候选版本、历史 accepted 转换、正文失效后的快照保留，也不改变删除、交换或 M1 的范围。
