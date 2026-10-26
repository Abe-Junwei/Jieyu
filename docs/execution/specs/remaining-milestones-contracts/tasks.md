---
title: remaining-milestones-contracts tasks
doc_type: execution-spec-tasks
status: draft
owner: repo
last_reviewed: 2026-10-26
source_of_truth: remaining-milestones-contracts-spec
depends_on:
  - ./requirements.md
  - ./design.md
  - ../../../adr/0091-field-revisions-diagnostic-delivery-and-later-milestones.md
---

# Tasks — 后续里程碑合同

## 设计收口（本轮）

- [x] 对照 `UserNoteDocType`、`noteTextId.ts` 和生产调用，写下九类锚点。translation、annotation、lexeme、sense 没有生产构造点。
- [x] 对照说话人、书目、对话、消息和当前桌面表，写下还没有列的字段。
- [x] 核对 userData `audit_logs` 的覆盖写入，决定复用文件、不复用这张表。
- [x] 核对 `trashItem` 没有还原句柄，Linux 失败不能当成已清除。未跑三平台。
- [x] 已确认规则写入 ADR-0091。旧草案里的诊断可丢和备注待定句改指向本篇。

## 实施

- [x] 来源单域的字段修订和诊断补交。不同字段合并，改回原值拒绝，诊断库失败后只补日志。user_version 13。备注未开始。
- [ ] 备注载体与九类定位。当前 `notes.body` 和 `JieyuNote` 都不是最终形状。
- [ ] 说话人、对话、设置、查询和 AI 写入按 design 第 3 节继续接替。不要求先于备注全部完成。
- [ ] 转写预览凭据、接受事实和崩溃计数。
- [ ] 删除准入、文件阶段、备份快照和恢复执行隔离。
- [ ] 全部实施任务完成后按 ADR-0051 删除本规格。未跑的平台和未做的产品验收保持未勾。
