---
title: ADR 0022 - 标注 analysisGraph 与 typed relation
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-04-25
source_of_truth: decision-record
---

# ADR 0022：标注 analysisGraph 与 typed relation

## 背景

标注页与词典页路线图已将 M2 扩展到非线性形态、MWE、零词素、词根模板、重叠、依存/共指、Leipzig structural parser 与形态学 process。继续把这些决策散落在执行计划中，会导致实现 PR 难以判断哪些是长期架构边界、哪些只是阶段性任务。

同时，Leipzig Glossing Rules 更适合作为展示、输入和出版约定，并不能完整表达形态学综述中常见的 allomorphy、suppletion、zero exponence、cumulative / multiple exponence、non-concatenative morphology、morphophonology、non-segmental morphology 等问题。Jieyu 需要一个内部结构化真值，避免把复杂关系塞进 gloss/POS/note 字符串。

## 决策

1. 标注页内部真值采用 **analysisGraph**：由 `annotation nodes`、`typed relations`、`projection diagnostics` 组成。线性 IGT 矩阵只是 UI projection，不是唯一数据模型。
2. `displayGloss` 与 `analysisGraph` 分离：
   - `displayGloss`：面向编辑与出版的 Leipzig 风格文本。
   - `analysisGraph`：结构化真值，表达 token、word、morpheme、exponent、process、featureBundle 等。
   - `exportProjection`：面向 FLEx/LIFT/CoNLL-U/ELAN/LaTeX 等格式的降级映射。
3. M2 的最小节点类型包括：
   - `token`、`word`、`morpheme`、`zero`、`mwe`、`root`、`pattern`
   - `gloss`、`pos`、`note`
   - `exponent`、`featureBundle`、`process`
   - `underlyingForm`、`surfaceForm`、`prosodicFeature`
4. M2 的最小 relation 类型包括：
   - 对齐与标注：`glosses`、`hasPos`、`linksLexeme`
   - 形态结构：`partOfMwe`、`discontinuousPartOf`、`reduplicates`、`alternativeAnalysis`
   - 形态理论抽象：`realizesFeature`、`hasUnderlyingForm`、`hasSurfaceForm`、`derivedByProcess`、`hasAllomorph`、`suppletes`
   - 非连接过程：`deletesSegment`、`substitutesSegment`、`overwritesTone`
   - 高层关系：`dependsOn`、`corefersTo`（M3+ 才开放编辑）
5. 节点可以持有 `surfaceParts`，用于一个分析节点对应多个 token 片段或 token 内 offset 片段。非连续词素、circumfix、root-pattern 等不得通过拼接字符串伪装。
6. 自动分词、二次自动分词、AI gloss、parser 只能产生 `alternativeAnalysis` 或 pending relation。覆盖人工确认结果必须走审核模式或强制模式，并生成快照与回滚点。
7. `token_lexeme_links` 保留为高频索引表；复杂链接、跨词链接、sense/allomorph/process 链接进入 analysisGraph。两者通过服务层同步或投影，禁止让专用表承担所有 relation 语义。
8. 导出必须通过 `exportProjection`，并生成 diagnostic：
   - 完整表达
   - 降级为 note/custom field
   - 无法表达
   - 需要用户确认

## Fixture-first 实施约束

实现 UI 前，先建立 analysisGraph fixture。每条 fixture 至少包含：原文、分词、内部 graph JSON、Leipzig 展示、至少一种导出 projection、diagnostic。

当前 fixture baseline：[`docs/execution/audits/标注-analysisGraph-fixture基线-2026-04-25.md`](../execution/audits/标注-analysisGraph-fixture基线-2026-04-25.md)。实现 PR 应先补齐或更新该 baseline，再修改 schema/parser/UI。

M2 必备 fixture：

1. clitic / contraction
2. multiword expression
3. zero morpheme / empty node
4. infix
5. circumfix / discontinuous morpheme
6. reduplication
7. root-pattern / templatic morphology
8. suppletion
9. mutation / ablaut / umlaut
10. truncation / subtraction
11. tonal morphology
12. cumulative / portmanteau exponence
13. multiple exponence
14. polysynthetic word / incorporation
15. ambiguity / multiple analyses

## UI 分期

1. **M1a**：线性矩阵，支持 token gloss/POS、保存、Leipzig 文本级提示；不承诺完整 analysisGraph 编辑。
2. **M1b**：morpheme、手动分词、词典链接编辑、Validator 模板；允许产生最小 graph 节点与 relation。
3. **M2a**：只读 relation 可视化：badges、links、diagnostic，不提供任意图编辑器。
4. **M2b**：有限编辑：`glosses`、`hasPos`、`linksLexeme`、`partOfMwe`、`alternativeAnalysis`。
5. **M2c**：高级编辑：`discontinuousPartOf`、`process`、`prosodicFeature`、`suppletes` 等。
6. **M3+**：依存、共指、RDF/Ligt 等高层关系或互操作扩展。

## 语言 profile 合同

每个语言或正字法 profile 至少应声明：

1. tokenization mode
2. morpheme boundary conventions
3. clitic convention
4. gloss template / Validator 模板
5. POS inventory
6. auto segmentation policy
7. 二次自动分词覆盖策略
8. export projection preferences

## 影响

- 标注页实现不得把 `gloss`、`pos`、`note` 字符串当成复杂形态关系的唯一真值。
- Leipzig structural parser 是 analysisGraph 的输入层之一，不是完整形态模型。
- FLEx/LIFT/CoNLL-U/ELAN/LaTeX 都是 projection target；任一导出格式表达力不足时必须出 diagnostic。
- M2 前置工作应优先做 fixture、schema/service 边界和只读 relation 可视化，再做复杂图编辑。

## 被放弃的备选方案

- **只保存线性 IGT 字符串**：无法可靠表达非连续、零形式、suppletion、tone、cumulative/multiple exponence；拒绝。
- **把所有复杂关系塞入 `note` 或 gloss 字符串**：不可查询、不可回放、不可安全导出；拒绝。
- **M2 一次性做完整图编辑器**：范围过大，容易阻塞标注 MVP；拒绝，改为只读可视化与有限 relation 编辑。
- **直接引入通用标注平台作为核心模型**：INCEpTION/WebAnno/brat 等可借鉴 relation/link-feature/standoff 思路，但架构和依赖成本不适合当前 Web 离线优先主线；拒绝。

## 后续回顾点

- M2 fixture 是否覆盖真实项目中的主要语言类型。
- analysisGraph 与 `token_lexeme_links` 的同步边界是否足够清晰。
- 导出 projection diagnostic 是否能被用户理解并用于修复。
- 若 RDF/Ligt 或更完整 linked-data 互操作进入产品目标，应新增专门 ADR。
