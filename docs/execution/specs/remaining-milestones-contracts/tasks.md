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
  - ../../../adr/0093-ai-chat-message-evidence-and-export.md
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
- [x] 桌面 `/annotation` 从同次运行已打开的 `project.sqlite` 读取文稿、语段和旁注，并创建带分类的语段备注；同一会话读回，不改正文、不调用旧库。
- [ ] 浏览器开发/测试用的旧 `AnnotationWorkspace` 仍走 Dexie；词、词素和其余标注操作尚未改接桌面库。新库旁注改写、删除接口也尚未建立，不将旧库方法作为 fallback。
- [x] 说话人按字段修订接上除旧 `textId` 外的列。不同字段合并，显式清空和缺省分开，诊断失败只补日志。不挂文稿。
- [x] 对话按字段修订接上 `mode`、`providerId`、`model`、`archived`、`clearedAt`。false 和空缺分开。旧 `textId` 和历史审批不进表。
- [x] 书目单独成表，按字段修订接上除旧 `textId` 外的列。不进来源表，不随文稿清除。
- [x] 分开设置、保存查询、AI 写入和消息的开工条件，见 design §3.1。不以 #392–#395 先合并为共同前置。
- [ ] 项目设置：等实际功能需要时逐键确定名称、类型、默认和清空语义，再按字段修订接替并验证关闭重开读回。此前 `settings_json` 保持空对象；会话记忆和车道锁定排除。
- [ ] 保存的查询：等实际产品功能需要持久化查询后再定义合同并建表；当前不为 `AiSourceSetDoc` 建表，不阻塞 M5-G。
- [ ] AI 写入：随具体领域操作逐次接入，验证提案、审批、执行边界及失败回滚；不新建通用写入口。
- [x] 消息归属决定写入 ADR-0093：保存引用和推理正文，继续排除上下文快照；整段聊天导出 JSON 与 Markdown。
- [ ] 消息：接替状态、生成来源、模型、错误信息、引用和推理正文；验证追加幂等、字段修订、流式定期保存、停止/失败/崩溃读回、失效引用、清空及备份恢复。
- [ ] 聊天导出：新增用户入口，导出当前整段聊天的 JSON 或 Markdown；验证消息顺序、引用身份/标签/短摘录、推理正文、部分回复及失效引用。
- [ ] 转写预览凭据、接受事实和崩溃计数。
- [ ] 删除准入、文件阶段、备份快照和恢复执行隔离。
- [ ] 全部实施任务完成后按 ADR-0051 删除本规格。未跑的平台和未做的产品验收保持未勾。
