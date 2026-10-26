---
title: desktop-domain-write-boundaries requirements
doc_type: execution-spec-requirements
status: draft
owner: repo
last_reviewed: 2026-10-26
source_of_truth: desktop-domain-write-boundaries-spec
depends_on:
  - ../../../adr/0085-desktop-project-one-sqlite.md
  - ../../../adr/0088-desktop-sqlite-domain-landings.md
  - ../../../adr/0089-analysis-generation-accept-and-restore.md
  - ../../../adr/0091-field-revisions-diagnostic-delivery-and-later-milestones.md
---

# Requirements — 领域接替的事务与外部副作用边界

## 1. 目标与状态

本片落实 2026-10-25 审查的遗漏项：正文原子写入、审计失败语义、备注目标、附件文件阶段和宿主探针隔离。本文是设计与验收载体，不是新接受的架构决定；不实现存储，不扩大 M1，不重跑已停评审。

## 2. 已核对事实与缺口

- `sqliteAgentArtifacts.ts` 用两个连接先提交项目产物，再写 userData 审计。ADR-0085 要求新路径审计失败整次回滚，ADR 索引又称审计在 userData，二者尚未收口。
- `noteTextId.ts` 解析九类备注目标；`useNoteHandlers.ts` 有单元格备注入口，导入有 text 备注。枚举/解析支持不等于每类都已证明存在用户入口。
- `unlinkLexemeAttachment` 删除最后引用时删的是行内 Blob。文件化后的收尾协议仍待 R5，不因本片有设计文字而变成已实现。
- `skeleton:write-probe` 只写系统临时目录里的探针库，不写已打开项目的 `project.sqlite`。`probeStore.ts` 仍不能当作新格式打开器。
- 首次声学绑定重写语段时间的旧行为由 `LinguisticService.test.ts` 明确断言；新时间映射片不能继承它。

## 3. 行为合同与待定决定

- `units.updateText`：正文改变、完整旧分析快照、清空当前图、卸下投影及关联、语段分析代际推进在同一次主进程事务内完成；与 analysis.apply 共用内部事务逻辑，不串联两次 IPC。
- 代际当前值分别落在 manuscripts 和 units，建议/快照/任务保存生成时值；这是 ADR-0089 的结构落位，不是候选自己维护当前计数。
- 审计分类与失败语义见 design §2 草案。涉及改变 ADR-0085 承诺，必须另行确认并记录新 ADR 后才实施，不靠索引覆盖它。
- 备注目标按 design §3 逐类收口；未映射不代表取消。译文正文与对译文的备注分开，不能用一个 role 混写。
- R5 需保证提交后仍有足够文件身份和操作依据可收尾；本片不指定新表，不套用录音 90 天周期。

## 4. 验收（未来实现，当前不预填通过）

- [ ] 正文已写入、快照/投影处理中途失败，重开后正文、图、关联、快照及代际全部保持操作前；成功则全部一致。
- [ ] 解释写入所必需的项目内记录失败时整体回滚。诊断库失败时内容保持已提交并显示日志待补交，不重复内容；全部完成只在诊断库已接收后显示。IPC 丢失不自动重试写入。规则见 ADR-0091。
- [ ] 九类旧备注按 ADR-0091 和后续里程碑规格落位；评论不覆盖译文，恢复不覆盖后来编辑的备注。没有生产构造点的类仍能被导入和恢复核对。
- [ ] 解除最后附件链接后发生文件失败/崩溃，重开仍能发现需处理的文件，且不会误删新关联或替换文件。
- [ ] 新格式打开后调用旧 probe 不改变项目文件或结构；探针仅写独立临时夹具。首次声学绑定及改映射均不改文献秒。

## 5. 排期与退出

M1 原样推进；M2/M3 验证格式与探针隔离；M4 时间片核对首次声学绑定；M5 对应写路径前确认审计/备注，分析入口只等其 R1 合同及已接受 R2/R3/R4；R5 随附件片、R6 随逐领域列清单。M6 集成，不把以上打成一组前置来阻塞 M1。
