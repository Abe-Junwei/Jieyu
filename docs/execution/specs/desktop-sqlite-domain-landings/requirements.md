---
title: desktop-sqlite-domain-landings requirements
doc_type: execution-spec-requirements
status: draft
owner: repo
last_reviewed: 2026-10-25
source_of_truth: desktop-sqlite-domain-landings-spec
depends_on:
  - ../../../adr/0088-desktop-sqlite-domain-landings.md
  - ../../../adr/0089-analysis-generation-accept-and-restore.md
---

# Requirements — 单库领域接替

## 1. 目标与范围

承接 ADR-0088 的领域决定，补齐实施所需的结构、业务操作和持久验收。本文是待实施规格，不是已建库事实，也不是首发表集冻结声明。M1 仍仅按 ADR-0085 交付。

- ADR 记录取舍；本规格设计详细合同；实施后 `src/db/desktop/schema.ts` 是唯一可执行 DDL，类型和校验复用既有领域模型。
- 不新增 ORM、迁移器、Dexie 对齐接口或第二套可执行 SQL。冻结前只重建合成项目。
- 已接受 ADR 正文不改；下列未解决问题不通过规格擅自变成决定，涉及语义变化时另写 ADR。

## 2. 场景

1. 编辑或导入分析后，关闭再开仍保留图、稳定节点身份、多语词形/gloss、词义链接和备注。
2. 修改正文、接受过期候选、删除被引用义项时，服务要么完成完整状态变化，要么整次拒绝。
3. 项目语言、时间映射、外部身份、词条附件及模型运行在重开、交换、备份恢复后仍能解释并使用。

## 3. 审查结论与实施门禁

| 编号 | 缺口及代码证据 | 风险／实施前必须确定 |
| --- | --- | --- |
| R1 | `analysisGraph.ts` 节点只有 label、surfaceParts、features；`types.ts` 的 token/morpheme 另有 form/gloss 映射、pos、provenance | ADR-0088 §5 尚无这些映射到图的无损编码合同。先证明投影删除后能仅从真值重建，不得只存 label 或依赖旧投影补数据。 |
| R2 | 图指纹只覆盖图对象。`null`、缺图和非对象都得到空字符串。保存时用调用方带来的预期图比较当前图。接受候选不读指纹，只改状态。词项 gloss 写入不经过这条比较。持久写入代际只出现在删除规格里，代码里还没有 | 合同见 [ADR-0089](../../../adr/0089-analysis-generation-accept-and-restore.md)。代码仍未实现 |
| R3 | `acceptAnalysisGraphCandidate` 在同语段已有另一条 `accepted` 时抛错，不改那一条。同一条候选再次接受能通过这道检查。保存图和改词项都不改候选状态 | 合同见 [ADR-0089](../../../adr/0089-analysis-generation-accept-and-restore.md)。代码仍未实现 |
| R4 | 候选行保存的是当前图夹具。接受不把候选写回语段，也不改词项、链接或备注。没有「改正文后留下旧投影」的写入。备注是独立记录 | 合同见 [ADR-0089](../../../adr/0089-analysis-generation-accept-and-restore.md)。代码仍未实现 |
| R5 | `unlinkLexemeAttachment` 在同一 Dexie 事务里减 `refCount`，到 0 就删除附件行。字节在行内的 Blob 上，没有单独的文件阶段。现有附件代码不使用 90 天保留 | 普通文件的发布、最后引用解除、崩溃后的结果未知和重试要单列协议。不套用录音删除周期。这个协议还没有实现 |
| R6 | 旧库迁移规划 `planLegacyMigration.ts` 对坏的桥字段、词条正文和规则正文是丢掉该字段并留下行。现行 Dexie 写入用整份校验，不合就拒绝。新库写入器还不存在 | 新业务写入非法字段必须整次拒绝，不能把迁移规划的丢字段带进 `schema.ts`。每一列的缺省、空对象和 `NULL` 仍要在切片里写明 |

上表左列是代码事实。R2、R3、R4 的规则已由 [ADR-0089](../../../adr/0089-analysis-generation-accept-and-restore.md) 记下，代码仍未实现，ADR-0088 正文不改。R5、R6 仍是待定规则。本篇没有新增实验，也没有生产行为变更。

R6 单独保留这个定位：丢掉坏字段、留下行，属于旧迁移规划的容错，不是现行 Dexie 的正常写入规则。新库承接严格写入校验，不把迁移容错带进写入器。缺省、空对象和 `NULL` 随各领域切片逐列写，不放进共同提交入口。R5 的附件文件操作协议也单独定，同样不放进该入口。

共同提交入口的合同已由 [ADR-0090](../../../adr/0090-analysis-payload-custom-fields-and-dangling-refs.md) 接受，代码未改。接替目标仍是人工编辑、导入和候选接受共用一份完整标注状态、一套校验和一个入口；调用方交操作和预期版本，主进程读取并合并。字段编码在[R1 设计第 13 节](../annotation-graph-rebuild/design.md)。往返实验没有验证该入口。R5、R6 继续是受影响切片的开工门禁，不阻塞无关 M1。

## 4. 验收要求

- [ ] 图与投影多语内容、非连续 surfaceParts、稳定 id、链接和备注关闭重开后可核对；失败无半次投影。
- [ ] 正文改变后的旧分析可复核，当前分析不再有效；过期候选及删除前任务迟到结果拒绝，恢复后仍拒绝。
- [ ] 词条两个义项及 Jieyu 扩展完整读回；非法义项链接、被引用义项删除整次回滚。
- [ ] 无 ISO 的 Glottocode 语言和项目正字法可被层引用；模板实例来源重开可追溯。
- [ ] 映射更新不改文献时间；回滚、非恒等映射的转写结果换算、不同层同名外部 id 均正确。
- [ ] 零产出/失败/取消有运行行；附件失败可恢复；语料查询不依赖独立语料表。

## 5. 范围与路线

审计分类、九类备注、正文原子写入与探针隔离见[边界规格](../desktop-domain-write-boundaries/requirements.md)。这些是分领域门禁，不合并为共同入口或 M1 的前置。

时间映射在 M4 首个时间编辑切片前收口；图/词典/目录/模型按 M5 对应片交付；交换、附件收尾、备份恢复在 M6 集成；全部首发必要存储稳定后才到 M7/D14。
#275 记录集成子进度，#280 记录生产路径接替，#303–#306 记录转写运行与结果；#258/#325 各验各自恢复/删除范围。本规格不增加 #311/#333/#299 的首发阻塞，不修改远端 issue。
