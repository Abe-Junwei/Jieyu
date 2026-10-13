---
title: 盘点：8 个 IndexedDB 库与 localStorage 键按两层归属
label: wayfinder:task
mode: AFK
status: open
assignee:
blocked_by: []
issue: https://github.com/Abe-Junwei/Jieyu/issues/279
---

# 盘点：8 个 IndexedDB 库与 localStorage 键按两层归属

## Question

按 [ADR-0046](https://github.com/Abe-Junwei/Jieyu/blob/docs/wayfinder-trial-map/docs/adr/0046-desktop-sqlite-project-folder.md) 第 4 条，把 jieyudb_v2、jieyu_pre_migration_backups、jieyu-project-memory、jieyu-voice-sessions、jieyu-user-behavior、jieyu_recovery、jieyu-acoustic-analysis、jieyu_collab_client_state 逐库、逐表归到「项目文件夹」「userData」或「桌面版不要」，并列出 ADR-0044 里沿用全局 ID 的覆盖行。localStorage 键同样归层。只读盘点。
