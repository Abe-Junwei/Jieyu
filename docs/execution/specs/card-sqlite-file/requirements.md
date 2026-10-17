---
title: card-sqlite-file requirements
doc_type: execution-spec-requirements
status: draft
owner: repo
last_reviewed: 2026-10-16
source_of_truth: card-sqlite-file-spec
depends_on:
  - ../../../adr/0058-card-sqlite-file.md
  - ../../../adr/0060-card-file-ownership-and-operations.md
  - ../../../adr/0061-jyd-manuscript-file-audio-stays-plain.md
---

# Requirements — card-sqlite-file

## 1. What & Why

- **要做什么**：桌面项目文件夹里，音频保持原文件，每份文稿是一个 `.jyd` SQLite 文件，项目库存共用定义和音频登记。声文稿是看板上的组合。
- **为什么现在做**：ADR-0058、ADR-0060、ADR-0061 已定卡片、隐藏和删除作用在项目文件夹里的文件上。产品决定已接受；工程可发布性未通过。
- **不做什么**：不改浏览器 Dexie 的现有删除；不实现云端删除；不批量清理用户库里的同名录音；真实驱动原型不过，不进迁移。

## 2. 用户场景

1. 用户导入一个音频和同名 EAF，项目外的原件还在，项目文件夹里多出 `录音01.wav` 和 `录音01.jyd`，看板显示一张声文稿卡片。
2. 用户从这张卡片拿掉音频，WAV 进入系统垃圾箱，卡片变成文稿卡片；垃圾箱拒绝时，WAV 和卡片都还在。
3. 用户在 Finder 里把 WAV 从垃圾箱还原。只有一条登记对得上时，应用认回原来的音频；有两份内容相同的录音时，应用停下问用户，不自己选。

## 3. 验收标准

前期证据（`node:sqlite`、十几个字节，不算验收）：打开中的 WAL 库只复制主文件会缺行；一致性备份并 `wal_checkpoint(TRUNCATE)` 后只复制主文件能读回。

- [x] better-sqlite3、回滚日志模式下，`.jyd` 写入、关闭后只剩一个文件；复制到别处重开，逐 id 一致。 → 验证：`JIEYU_BETTER_SQLITE=<本机缓存的 better-sqlite3 12.11.1> node --experimental-sqlite --test scripts/jyd-failure-roundtrip.mjs`。未写入本仓库 `package.json`。`node:sqlite` 同样通过。
- [x] 万句级文稿的连续编辑速度在可接受范围内。阈值：一万句一次事务在 2 秒内。2026-10-16 本机 node:sqlite 16ms，better-sqlite3 19ms。 → 验证：同上。
- [x] 写到一半强制退出后重开，`.jyd` 要么是写入前的样子，要么是写入后的样子。 → 验证：同上。SIGKILL 后只留下已提交的那一行，完整性检查通过。
- [x] 满盘时导入失败，项目里不留半个文件，原件不变。 → 验证：同上。满盘用 `max_page_count` 触发 “database or disk is full”，不是把真磁盘写满。失败后删掉已复制的音频和半截 `.jyd`，项目外原件字节不变。
- [x] 卡片清单删掉后扫文件夹重建，id 和配对不变。同一文稿 id 出现两次时停下，不自己选。 → 验证：`npx vitest run src/db/projectFiles/deriveCards.test.ts` 与 `node --experimental-sqlite --experimental-strip-types --test scripts/jyd-folder-roundtrip.mjs`
- [x] 导入后音频 sha256 与原件一致。 → 验证：同上，合成字节。
- [x] 多文件操作中途退出，重开后按操作 id 续做或显示未完成，不多出第二份文件。 → 验证：`npx vitest run src/db/projectFiles/fileOps.test.ts` 与 `node --experimental-sqlite --experimental-strip-types --test scripts/operation-log-roundtrip.mjs`。关掉项目库再打开，同一个删除操作续完，不另造文件。还没接系统垃圾箱。
- [x] 从垃圾箱还原时，只有一条哈希或文稿 id 对得上才认回；有多条候选时停下问用户，不自动选。 → 验证：同上。
- [x] 看板上能区分主动删除、意外不见和字节不在本机。还原后回到「文件在」，不是另加一种状态。 → 验证：同上。
- [x] 写入过程中存在 `-journal`，关闭并提交后消失。 → 验证：`node --experimental-sqlite --test scripts/card-file-portability-check.mjs`
- [x] 一份文稿的语段同时出现两个 `mediaId` 时被拒绝；改挂音频后只剩新的那一条。父子链接跨到另一份文稿时被拒绝。同一份文稿内的父子链接允许。 → 验证：`npx vitest run src/db/projectFiles/manuscriptAudio.test.ts src/db/projectFiles/manuscriptParents.test.ts`

## 4. 受影响代码地图

| 类别 | 文件 / 目录 | 改动性质 |
| --- | --- | --- |
| 前期检查 | `scripts/card-file-portability-check.mjs` | 已有 |
| 决定 | `docs/adr/0058-card-sqlite-file.md`、`0060-…`、`0061-…` | 已有 |
| 桌面主进程 | Electron 工程（ADR-0059，尚未建） | 后续新增：`.jyd`、项目库、操作记录 |
| 存储 | `src/db/storagePort.ts` | 后续增加业务操作；不扩展 `removeEmptyRecording` |
