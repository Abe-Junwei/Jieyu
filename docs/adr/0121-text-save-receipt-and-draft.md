---
title: ADR 0121 - 正文保存回执与未生效草稿进项目库
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-11-17
source_of_truth: decision-record
depends_on:
  - ./0085-desktop-project-one-sqlite.md
  - ./0086-desktop-release-scope-and-format-freeze.md
  - ./0100-desktop-engineering-contract.md
---

# ADR 0121：正文保存回执与未生效草稿进项目库

## 背景

切片 1a 要让正文保存能查明「写过没有」，并让还没生效的输入关掉再开还在。项目库冻在 `user_version` 27，冻结记录写明没有迁移器。内存草稿关进程就没了。

## 调研

SQLite 用 `PRAGMA user_version` 标应用自己的库版本。本仓库已经用它，加上整段 DDL 的签名，打开时不一致就拒绝，并且不改文件字节。ADR-0086 允许开发期用新决定改表，然后重建受控合成项目，不为开发文件写迁移器，也不去改任意已有目录。

回执和草稿若放在库外的文件里，就和正文写入不是同一个事务。进程在两步之间停掉，会出现「正文已改、回执没有」或相反。所以这两样放在 `project.sqlite` 里。

## 决定

1. **开发格式改为 `user_version` 28。** 新增 `text_save_receipts` 和 `unit_text_drafts`。回执只存 operation id、摘要、语段 id 和提交时间，不另存正文。摘要是 `text`、语段 id、正文这三样的 SHA-256。草稿一行对应一个语段，存未生效原文和它基于的已存正文；两样相同就不存。
2. **不写迁移器。** `user_version` 不是 28 的 `project.sqlite` 仍以「不是解语项目库」拒绝，文件字节保持原样。受控合成项目的重建是删掉该测试文件夹再打开。不覆盖、不重置任意已有目录。
3. **同一 operation id 只提交一次。** 相同摘要再次到达只返回已提交结果。同一 id 换了正文则拒绝。回执和正文在同一个事务里写。草稿只在已提交正文与草稿原文相同时删掉。
4. **这一版不含**字段修订号、跨域草稿、撤销栈、单写者锁和自动保存计时。那些仍按保存恢复规格另做，不借这次加列。

## 未选方案

- **把 27 的库就地补两张表**：冻结规则是拒绝而不是改写，补列会改用户或测试文件。
- **草稿放项目文件夹旁的 JSON**：和正文写入不是一个事务。
- **回执里再存一份正文**：正文已在 `unit_texts`。回执再存一份，日志和交换包就会多一份研究文本。

## 影响

- DDL 在 `src/db/desktop/schema.ts`，冻结记录在 `src/db/desktop/formatFreeze.record.json`。
- 删语段、清文稿时同一事务删掉这两张表上的行。
- 界面上的 500ms／5s 队列、离开链和回执丢失后的重试仍接这条写入，不在本篇里算已经接通。
