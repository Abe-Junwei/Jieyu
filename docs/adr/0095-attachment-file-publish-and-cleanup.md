---
title: ADR 0095 - 附件文件发布与最后引用收尾
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-10-27
source_of_truth: decision-record
depends_on:
  - ./0085-desktop-project-one-sqlite.md
  - ./0087-project-deletion-retention-and-media-cleanup.md
---

# ADR 0095：附件文件发布与最后引用收尾

## 状态

accepted。用户 2026-10-27 确认本篇为 M5-H 的 R5 状态机，并确认本域列的空值（R6）。`schema.ts` 尚未建这两张表。Dexie 的 `lexeme_assets` 仍是浏览器库里的行内 Blob，不作为桌面项目的附件存储。

## 背景

M5-B 明确不建附件表。写边界规格要求先有文件发布和收尾状态机：数据库事务包不住普通文件 I/O；最后一条链接解除后，即使登记行将来会删掉，在结果明确前也必须留着可恢复的文件身份。不能因为链接数为 0 就声称磁盘上的文件已经删除，也不套用录音的 90 天保留。

业界做法是内容寻址的文件加单独的元数据事务：先把完整字节写到临时文件再改名到哈希路径，然后提交登记；删除先提交“可以收尾”的元数据，提交成功之后才动文件。崩溃最多留下没有登记的孤儿文件，不能留下已提交、却没有字节的就绪行。SQLite 的原子提交只覆盖数据库页，不覆盖这些文件。

## 决策

1. **字节在项目文件夹里，按 SHA-256 寻址。** 相对路径落在 `attachments/objects/<sha256>`，不能逃出项目文件夹，符号链接同样拒绝。临时写入只用 `attachments/tmp/<操作编号>`，和最终路径在同一文件夹内，写完并核对哈希后再改名。不把字节写入 SQLite，也不写入 `settings_json`。
2. **两张表，不存引用计数。** `attachment_files` 一行是一个哈希。`attachment_links` 把该文件连到一个词条。链接数就是 `attachment_links` 的行数。不设 `ref_count` 列。同一哈希只有一行。同一词条对同一文件只有一条链接。
3. **这一刀只挂词条。** 链接的所有者是 `lexeme_id`。不挂语段、层或文稿。不存 `textId`。
4. **列的空值。** 文件行的 `id`、`sha256`、`relpath`、`byte_size`、`kind`、`mime_type`、`state`、`created_at` 都必填。`kind` 只取 `image`、`audio`、`document`。`byte_size` 大于等于 0。`state` 只取 `ready`、`cleanup_pending`、`cleanup_unknown`。链接行的 `id`、`file_id`、`lexeme_id`、`display_name`、`created_at` 都必填。没有可空的业务列。
5. **发布先落文件，再提交登记。** 临时文件改名到哈希路径并核对字节之后，一次事务插入或复用 `ready` 文件行，并插入链接。事务失败则登记回滚，哈希路径上的文件可以留下；下次发布同一字节时复用它。没有 `cleanup_pending` 行时，不得删掉 `attachments/objects/` 下的文件。启动时只可以删 `attachments/tmp/` 里没有改名成功的临时文件。
6. **解除最后一条链接先改状态，再动文件。** 一次事务删除链接。若该文件已经没有链接，把 `state` 改为 `cleanup_pending`，行和路径都留着。提交之后才在项目锁内重读：状态仍是 `cleanup_pending` 且链接数仍是 0，才核对哈希并送系统垃圾箱。期间若又加上链接，状态回到 `ready`，文件不动。
7. **结果未知就留下身份。** 垃圾箱调用失败、哈希对不上、或进程再次打开时文件已经不在，把 `state` 改为 `cleanup_unknown` 并保留该行。路径不存在不能单独当成成功。只有调用方亲眼确认移走的是该哈希，才在随后的事务里删除文件行。成功之前不删除这行。不自动重试 `cleanup_unknown`。
8. **不套录音保留期。** 最后一条链接提交为 `cleanup_pending` 后就可以收尾，不等 90 天，也不等提醒。录音清除仍只按 ADR-0087。

不兼容的旧项目文件在真正建表时只拒绝，不迁移。本篇不打开词典附件界面，也不改 Dexie 那条 flag。

## 被放弃的备选方案

1. 沿用 Dexie 的 `ref_count` 列，在解除链接时顺手减一并删 Blob。
2. 在数据库事务里删除磁盘文件。事务回滚不会把文件找回来。
3. 把未完成的发布写成 `publishing` 行来当身份。哈希路径本身已经能让同字节的下一次发布接上；临时文件没有改名成功就可以丢。
4. 给附件套用文稿和录音的 90 天与提醒。
