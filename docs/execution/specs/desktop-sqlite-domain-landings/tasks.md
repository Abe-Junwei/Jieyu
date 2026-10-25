---
title: desktop-sqlite-domain-landings tasks
doc_type: execution-spec-tasks
status: draft
owner: repo
last_reviewed: 2026-10-25
source_of_truth: desktop-sqlite-domain-landings-spec
depends_on:
  - ../../../adr/0088-desktop-sqlite-domain-landings.md
  - ../../../adr/0089-analysis-generation-accept-and-restore.md
---

# Tasks — 单库领域接替

## 实施前收口（当前均未实施）

- [x] R1 证据：逐字段归属、JSON 往返及跨语段 id 冲突实验，见 annotation-graph-rebuild 规格。
- [ ] R1 决定：确认字段合同。确认前不实现共同提交入口。显示镜像、完整校验和生产接替仍未交付。
- [ ] 标注接替：R1 字段合同确认后，按 ADR-0089 实现一个提交入口，并逐一接人工编辑、导入和候选接受。同一合成材料走三条入口，关闭重开后语言内容和关联一致。该入口不包含 R5 文件协议和 R6 逐列清单。现有往返实验不代替这项。
- [x] R2 证据：图指纹只比较图；接受候选不读指纹；代际未实现，合同按 ADR-0089。
- [x] R3 证据：另一条 accepted 被拒绝且不改写；同一条可再次接受；保存图不改候选状态。转换按 ADR-0089，尚未实现。
- [x] R4 证据：候选只存当前图夹具；接受不写回语段、词项、链接或备注。快照合同按 ADR-0089，尚未实现。
- [x] R2/R3/R4：合同已写入 ADR-0089。代码仍未实现。
- [x] R5 证据：最后引用解除删除行内 Blob；附件路径没有 90 天保留。文件协议仍待定义。
- [ ] R5：单独确定附件普通文件发布/清除意图、失败恢复、包备份范围。不套用录音删除周期，也不放进共同提交入口。
- [x] R6 证据：丢掉坏字段、留下行属于旧迁移规划的容错，不是现行 Dexie 的正常写入规则。新列的 NULL/空对象清单仍待写。
- [ ] R6：各领域切片逐列标明必填、可选、NULL/空对象、枚举和校验责任。新库承接严格写入，不把迁移容错带进写入器，也不放进共同提交入口。
- [ ] 按[边界规格](../desktop-domain-write-boundaries/tasks.md)逐片落实正文原子操作、审计/备注收口、附件收尾和 M2/M3 探针隔离；不追加 M1 前置。
- [ ] 各受影响切片开工前确认设计；新 ADR 只记新增取舍，不为普通字段逐列开 ADR。

## 分片交付（每项进一步拆为半天以内任务后实施）

- [ ] M4 时间片：映射字段、版本历史、播放器换算与正文边界业务接口 → A5；不扩 M1。
- [ ] M5 图切片：analysis.ts、稳定投影与正文失效路径；人工、导入、候选统一接入 → A1/A2。
- [x] M5 词典片：lexicon.ts、JSON 正文/扩展、正反向义项引用 → A3。不建附件表。user_version 4，旧文件只拒绝。不关 #275/#280。
- [x] M5 目录片：catalog.ts、语言/正字法/别名/历史/桥与模板项目实例 → A4。user_version 3，旧文件只拒绝。不关 #275/#280。
- [ ] M5 模型片：model_runs、来源和恢复任务分离，媒体秒转换、接受事务与任务保护 → A6。
- [ ] M5→M6 附件片：文件阶段、链接计数、失败恢复和完整包 → A7。
- [ ] M5/M6 交换语料片：external_ref 作用域重导入、语料查询与损失返回，备份恢复核对 → A5/A7。

## 每片退出

- [ ] 对应字段与精确约束只进入 schema.ts；业务类型就近，client.ts 同名有限接口。
- [ ] 测试覆盖真实写入→关库→重开→读取，以及中途失败与旧数据不变；A1–A7 对应项均有证据。
- [ ] npm run typecheck；npx vitest run src/db/desktop --maxWorkers=1。
- [ ] npm run check:architecture-guard；npm run check:dev-agent-workflow-verify。
- [ ] npm run check:docs-governance；按触及域跑 agent-evals 与交互/Electron 门槛。
- [ ] 记录 #275 子进度/#280 替代路径，以及相关转写/备份/删除 issue 的证据；不以本地通过代替远端关闭。
- [ ] M6 首发必要能力与删除/恢复验收齐后进入 M7/D14；不增加额外白名单功能的首发阻塞。
- [ ] 全部完成后按 ADR-0051 删除本规格；代码、测试与决定继续保留，不长期维护平行字段清单。
