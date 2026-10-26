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

- [x] 来源单域的字段修订和诊断补交。不同字段合并，改回原值拒绝，诊断库失败后只补日志。当时 user_version 13。
- [x] 备注载体先按九类旧目标落成排他列。该形状已由下一行的八类锚点取代。旧 `JieyuNote` 自由文本还在。旧页面未接。
- [x] 桌面会话入口 `notes.create`、`notes.list`、`notes.saveLexeme`、`notes.listLexeme`。关会话再开仍读回。未映射的 `annotation` 拒绝。译文评论不改正文。
- [x] 文件夹页选中语段后可以保存一条语段备注，关掉再打开仍读回，不改正文。旧标注页不在这条路径上。
- [x] 同一语段、同一层上的时间轴备注和波形备注在文件夹页分成两行，关掉再打开仍分开。不改正文。
- [x] 旁注改为八类本库对象。语段的时间轴和波形用 `view`。图节点按语段加节点 id 查询、脱离和恢复。已有行恢复不写正文和分类，也不补回缺失行。目标物理删除时同一事务脱离。旧文件只拒绝。
- [ ] 旧标注页的 `useNoteHandlers` 仍走旧库。那些语段 id 不在单库文件里，本片不改那一页。
- [x] 说话人按字段修订接上除旧 `textId` 外的列。不同字段合并，显式清空和缺省分开，诊断失败只补日志。不挂文稿。
- [x] 对话按字段修订接上 `mode`、`providerId`、`model`、`archived`、`clearedAt`。false 和空缺分开。旧 `textId` 和历史审批不进表。
- [ ] 设置、查询和 AI 写入按 design 第 3 节继续接替。不要求先于备注全部完成。
- [ ] 转写预览凭据、接受事实和崩溃计数。
- [ ] 删除准入、文件阶段、备份快照和恢复执行隔离。
- [ ] 全部实施任务完成后按 ADR-0051 删除本规格。未跑的平台和未做的产品验收保持未勾。
