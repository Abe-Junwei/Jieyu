---
title: annotation-graph-rebuild requirements
doc_type: execution-spec-requirements
status: draft
owner: repo
last_reviewed: 2026-10-25
source_of_truth: annotation-graph-rebuild-spec
depends_on:
  - ../desktop-sqlite-domain-landings/requirements.md
---

# Requirements — R1 图与词项无损重建

## 1. 目标与范围

证明“图是真值、词项是投影”有可执行的完整字段合同。交付路径核对、字段归属、合成往返实验及架构草案。本片不改变生产图 schema、写入器、UI、IPC 或 SQLite，不扩大 M1。

## 2. 已读事实（当前代码，不等于已接受目标）

| 路径 | 可达写入与读回 | 当前缺口 |
| --- | --- | --- |
| 人工词项 | `useAnnotationWorkspaceController` → `saveAnnotationIgtRowTokens` → `storagePortServiceUnitTokenOps`，按 unit 重查 | 分次改 pos/gloss，未同步 analysisGraph；不能把此路径叫“图优先提交” |
| 人工词素／关系 | `useAnnotationMorphologyController` → `saveAnnotationMorphemes` 保存完整行；关系编辑经 `buildAnnotationUtteranceGraph` → `saveAnnotationUnitAnalysisGraph` → `saveUnitsBatch` → `storagePortServiceLayerSegmentGraph`，再读回 | IGT 行已选成单字符串；build 丢弃未显示的映射，词素 POS 也未传给 projector |
| 导入 | `createImportedTokenGraphWriter` → `replaceHostTokenGraph` → saveTokens/saveMorphemes/putTokenLexemeLinks | 保留映射但重建 id，未在此操作写 accepted graph；不满足 ADR-0088 新路径目标 |
| 图候选 | `annotationStructuralPreviewController` → `analysisGraphConfirmation` → `storagePortAiAnalysisGraph` | submit 保存 graph；accept 只改 status，不写当前 graph/词项，不能当新接受事务复用 |
| 强制重分词快照 | `annotationRetokenize` 将 forms/glosses 等藏在 word.features.retokenizeSnapshot | 已有局部保留机制；未完整保留词素来源、链接来源/时间、备注，不能直接升格为新合同 |

## 3. 验收

- [x] 现有 IGT builder 输入两份只在隐藏正字法/语言不同的词项，产生相同图；形成可复现的信息丢失证据。
- [x] 草案图经 JSON 序列化后，仅从图重建 token/morpheme 和词义索引，与输入完整行相等；备注独立序列化且目标 id 仍有效。
- [x] 双正字法、双 gloss 语言、词素来源、非连续跨度、两个词条使用相同 sense 字符串均保留。
- [x] MWE、zero、process 仍在图中，不产生对应线性行；普通编辑保留 id、链接和备注。
- [x] 错误映射、缺父关系、词义身份矛盾被拒绝；跨语段同名节点不能直接用作项目表主键。
- [ ] 草案获确认并实现真实领域校验、共同提交入口和 SQLite 持久验收；本轮实验通过不勾此项。

## 4. 依赖与边界

字段合同与待确认决定文本见[本片设计](./design.md)第 7 节。接替目标见该设计第 5 节：三条路径共用一份完整状态、一套校验和一个提交入口；调用方交业务操作和预期版本，主进程读取并合并。本片实验没有验证该入口。R2/R3/R4 的合同是 [ADR-0089](../../../adr/0089-analysis-generation-accept-and-restore.md)。确认本片第 7 节字段合同后再实现入口。本片不读取真实语料或导入旧库。
