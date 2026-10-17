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
- [x] 旧 Dexie 行迁成音频文件加 `.jyd`，失败时保留旧库 → 验证：`npx vitest run src/db/projectFiles/planLegacyMigration.test.ts`（规划结果会写成文件再读回）和 `node --experimental-sqlite --test scripts/legacy-library-migrate.mjs`。这是合成快照，不读 IndexedDB；未确认的多录音文稿不写文件；失败时旧库文件字节不变，已写出的项目文件删掉。层、词和词素会写进 `.jyd`。项目行、说话人、语言、显示名、别名和正字法进项目库。文稿引用到的语言（名称、显示名、别名）、正字法和说话人另存一份定义副本。来源登记进项目库，文稿只记下引用的来源 id。词条进项目库，只记 id、所属项目和词头；文稿只存指向词条 id 的链接。音位进项目库，只记 id、所属项目、语言、IPA 和类型，不进定义副本；特征、音位变体和例词还没写。缩写进项目库，只记 id、所属项目、缩写和可选类别，不进定义副本；多语名称还没写。标签定义进项目库，只记 id、所属项目、键、可选范围和颜色，不进定义副本；多语名称和说明还没写。文献来源进项目库，只记 id、所属项目、标题，以及可选的年份、类型、引用键和访问权限，不进定义副本；作者、出版方、DOI、链接和备注还没写。地点进项目库，只记 id、所属项目，以及可选的纬度、经度、地区和国家，不进定义副本；多语名称和备注还没写。语法文档进项目库，记 id、所属项目、标题和正文，以及可选的排序、访问权限和同一项目内的父级，不进定义副本；关联来源和例证还没写。正字法转换进项目库，只记 id、所属项目、两端正字法和转换方式，以及可选的状态和是否可逆，不进定义副本；规则正文、样例和多语名称还没写。自定义字段进项目库，只记 id、所属项目、类型和排序，以及可选的是否必填、上下限和校验式，不进定义副本；多语名称、说明和选项列表还没写。语言目录历史进项目库，只记 id、所属项目、语言、动作和摘要，以及可选的原因、原因码、操作者、来源类型和来源引用，不进定义副本；变更字段和修改前后的补丁还没写。锚点跟着录音进对应的 `.jyd`。层内容跟着语段进 `.jyd`，只记 id、语段、角色和文本。两端都在同一份文稿里的单元关系写进该 `.jyd`，跨文稿的不存。指语段、词、词素的备注随文稿，指语言、说话人、正字法、词条或项目行的备注进项目库。两端层都在同一份文稿里的层链接写进该 `.jyd`。轨道跟着录音进对应的 `.jyd`，车道锁定表还没写。层标注只在所在层只出现在一份文稿时写入该 `.jyd`，只记 id、层、文本、是否已核和可选起止时间；同一层被拆进多份文稿时不复制。语言记录的标量字段进项目库，不进定义副本；数组、行政区划、多语备注和自定义字段值还没写。词条另记种类、使用次数和访问权限。词条附件只记种类、媒体类型、显示名、字节数和引用次数，不写二进制；链接两端都留下才保留。DMLex 正文还没写。结构规则进项目库，只记 id、项目、范围、是否启用、优先级，以及可选的语言和来源模板；规则正文还没写。项目 AI 的会话、消息、任务、任务快照、项目记忆、产物和来源集进项目库。会话记忆载荷不写。`model_runs` 在 src 里没有这张表，不发明。写入中途失败会关掉数据库并删掉半份文件和日志。层对不上的语段、词和词素记入丢弃。显示名和别名按项目过滤，定义副本不带项目 id
- [x] 导入、配对、拆开、改名、隐藏、删除的操作入口 → 验证：`npx vitest run src/db/projectFiles/fileOps.test.ts`（7 项通过）和 `node --experimental-sqlite --experimental-strip-types --test scripts/operation-log-roundtrip.mjs`（关掉再打开，同一个删除操作续完）。还没接系统垃圾箱和存储端口
- [x] 不适用：浏览器「已隐藏」和云端删除。访谈定为后面再定。
- [ ] 仍不写：`model_runs`（src 里没有这张表）、会话记忆载荷、词条 DMLex 正文、语言记录上的数组和多语备注、结构规则正文。不读 IndexedDB，不放进定义副本。列形状在 [#275](https://github.com/Abe-Junwei/Jieyu/issues/275) 定 → 验证：还没写

## Pre-merge gates

- [x] 本步文档：`npm run check:docs-governance`
- [x] `npm run typecheck`（改存储时补）→ 2026-10-16 `npx tsc --noEmit` 通过
- [x] 不适用：E2E。尚未改界面。
- [x] 不适用：`src/ai/**`。
