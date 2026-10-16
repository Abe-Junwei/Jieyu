---
title: card-sqlite-file tasks
doc_type: execution-spec-tasks
status: draft
owner: repo
last_reviewed: 2026-10-16
source_of_truth: card-sqlite-file-spec
depends_on:
  - ./requirements.md
  - ./design.md
---

# Tasks — card-sqlite-file

每一步以关闭后重开、逐 id 与逐字节读回验收。前一步没过，不做下一步。

## Implementation tasks

- [x] ADR-0058、ADR-0060、ADR-0061，加上 ADR 目录里的有效条款对照。认回在多个同哈希时必须问用户，这一条还没有新 ADR → 验证：`npm run check:docs-governance`
- [x] 前期证据：`node:sqlite` 下的单文件复制 → 验证：`node --experimental-sqlite --test scripts/card-file-portability-check.mjs`
- [x] 非破坏性原型：回滚日志写入时有 `-journal`、关闭后消失；相同哈希的两条录音不会被自动认成同一条 → 验证：`node --experimental-sqlite --test scripts/card-file-portability-check.mjs`（3 项通过；仍不是 better-sqlite3 验收）
- [x] 一份文稿不能同时关联两条音频；父子链接不能跨文稿 → 验证：`npx vitest run src/db/projectFiles/manuscriptAudio.test.ts src/db/projectFiles/manuscriptParents.test.ts`
- [x] 把 design §6 里还没写成 ADR 的方向（备份含音频、隐藏参加唯一性检查、关系和备注按行归属、接口拆分）写成决定 → 验证：ADR-0062 第 1、2、3、7 条；`npm run check:docs-governance`
- [x] better-sqlite3 原型：回滚日志写入速度、强制退出、满盘、关闭后复制 → 验证：2026-10-16 临时目录 `/tmp/jieyu-sqlite-proto/proto.mjs`，用本机已有的 better-sqlite3 12.11.1（未写入本仓库 package.json；npm 安装超时）。5 项通过：2 万行事务 8.8ms；关闭后无 `-wal`/`-shm`，复制重开 20000 行且 integrity ok；事务中有 `-journal`、关闭后消失；SIGKILL 后未提交行丢失、重开 integrity ok，但杀死当下 `-journal` 还在，要等下次打开才回滚清掉；满盘用 `max_page_count` 触发 `SQLITE_FULL`，已提交行还在（不是把真磁盘写满）
- [x] `.jyd` 与项目库读写、卡片清单重建 → 验证：`node --experimental-sqlite --experimental-strip-types --test scripts/jyd-folder-roundtrip.mjs`（1 项通过）和 `npx vitest run src/db/projectFiles/deriveCards.test.ts`（4 项通过）。库里目前只有 `meta` 和 `audio` 两张表
- [x] 旧 Dexie 行迁成音频文件加 `.jyd`，失败时保留旧库 → 验证：`npx vitest run src/db/projectFiles/planLegacyMigration.test.ts`（规划结果会写成文件再读回）和 `node --experimental-sqlite --test scripts/legacy-library-migrate.mjs`。这是合成快照，不读 IndexedDB；未确认的多录音文稿不写文件；失败时旧库文件字节不变，已写出的项目文件删掉。层、词和词素会写进 `.jyd`。项目行和说话人进项目库。定义副本和其他项目级表还没迁
- [x] 导入、配对、拆开、改名、隐藏、删除的操作入口 → 验证：`npx vitest run src/db/projectFiles/fileOps.test.ts`（7 项通过）和 `node --experimental-sqlite --experimental-strip-types --test scripts/operation-log-roundtrip.mjs`（关掉再打开，同一个删除操作续完）。还没接系统垃圾箱和存储端口
- [x] 不适用：浏览器「已隐藏」和云端删除。访谈定为后面再定。

## Pre-merge gates

- [x] 本步文档：`npm run check:docs-governance`
- [x] `npm run typecheck`（改存储时补）→ 2026-10-16 `npx tsc --noEmit` 通过
- [x] 不适用：E2E。尚未改界面。
- [x] 不适用：`src/ai/**`。
