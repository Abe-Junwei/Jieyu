---
title: ADR 0058 - 一张卡片是一个 SQLite 文件
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-10-15
source_of_truth: decision-record
depends_on:
  - ./0046-desktop-sqlite-project-folder.md
  - ./0048-storage-port.md
---

# ADR 0058：一张卡片是一个 SQLite 文件

## 状态

accepted。记录 2026-10-15 访谈已定的桌面卡片语义。取代 [ADR-0046](./0046-desktop-sqlite-project-folder.md) 第 1、5 条里「项目内容真源是 `project.sqlite` + `media/`」的部分。ADR-0046 正文不改。浏览器 Dexie、JYM/JYT 交换包、用户偏好放在 `userData`，仍按 ADR-0046 其余条款。

第 1 条和第 2 条里的文件名、声文稿 id 由 [ADR-0061](./0061-jyd-manuscript-file-audio-stays-plain.md) 取代；下面的决策正文不改。

## 背景

看板上一张卡片要和项目文件夹里的一个文件对应。导入只复制，不删除项目外的原件。隐藏是把文件移进项目内的「已隐藏」。删除把本机文件或整个项目文件夹送进系统垃圾箱。声文稿最多一条音频、可有多份文稿，语段属于其中一份文稿。这些规则要求卡片内容有一个可搬走的真源。项目级数据库再存一份音频、文稿或语段，就会和文件夹各说各话。

SQLite 的 WAL 模式会写出 `-wal`、`-shm`。数据库仍打开时只复制主文件，副本可以缺刚写入的内容。一致性备份并在关闭前做 `wal_checkpoint(TRUNCATE)` 之后，主文件可以单独复制并读回。检查是 `node --experimental-sqlite --test scripts/card-file-portability-check.mjs`。这个检查用 Node 自带的 `node:sqlite`，不改 [ADR-0048](./0048-storage-port.md) 已定的桌面驱动 better-sqlite3。

## 决策

1. 桌面项目文件夹是容器。一张卡片是其中一份 SQLite 文件，音频字节、文稿和语段都在这个文件里。项目索引只记卡片的 id、路径和显示名，丢了可以扫文件夹重建，不保存第二份卡片内容。
2. 卡片、音频、文稿、语段各有稳定 id。磁盘文件名是可读名称加这个卡片 id，界面显示用户原名。声文稿沿用音频卡的 id，文稿 id 留在文件内。
3. 一次用户动作在卡片文件内部是一次事务，并按 ADR-0048 读回。文件移动、复制和系统垃圾箱不在这个事务里。先记下可重试的文件任务，再改索引；失败时不把还在的文件说成已删除。
4. 卡片要搬走时，必须先做出一致性备份并关闭，使主文件单独可读。做不到这一点，就不能把带 `-wal`、`-shm` 的半截文件当成一张卡片。
5. 本机删除使用操作系统垃圾箱。应用不提供从垃圾箱按句柄拉回的操作；用户把文件还原到项目里之后，应用按文件内的原卡片 id 再决定合回或留成独立卡片。协作项目的本机删除不删云端。云端删除和浏览器在文件夹落地前的隐藏，本决定不规定。
6. 隐藏是把卡片文件移到项目内的「已隐藏」，不是只改界面标记。删掉没有音频的卡片上的最后一份文稿时，整张卡片进垃圾箱，不留空文件。

## 影响

- 新存储操作仍走 ADR-0048 的业务方法。better-sqlite3 的桌面实现还没写；本决定不授权在浏览器 Dexie 上模拟这套文件规则。
- 旧的 `media_items`、`source_records`、`annotation_documents`、`layer_units` 要在迁移时进入卡片文件。迁移完成前，现有 `removeEmptyRecording` 不继续扩展。
- 采纳本决定的计划页在实施完毕后删除。计划本身不是第二份规范。
