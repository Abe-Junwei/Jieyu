---
title: sqlite-storage-port tasks
doc_type: execution-spec-tasks
status: draft
owner: repo
last_reviewed: 2026-10-22
source_of_truth: sqlite-storage-port-spec
depends_on:
  - ./requirements.md
  - ./design.md
---

# Tasks — sqlite-storage-port

## Implementation tasks

- [x] userData 里的回合和审计：better-sqlite3 一次事务，提交后读回，关掉再打开仍在 → 验证：`npx vitest run src/db/sqliteStoragePort.test.ts`
- [x] 跨文件说话人分配：项目库里的说话人行和名单，`.jyd` 里的 `speaker_id` 和说话人定义副本，各自一次事务，提交后读回；关掉再打开仍在 → 验证：`describeStoragePortContract`，种子是项目文件夹
- [x] 正则拆分：一份 `.jyd` 里的锚点、语段和正文一次事务，提交后读回；关掉再打开仍在 → 验证：`npx vitest run src/db/sqliteStoragePort.test.ts`
- [x] 轨道行：一份 `.jyd` 里的 `track_entities` 一次事务，提交后读回；关掉再打开仍在 → 验证：`npx vitest run src/db/sqliteStoragePort.test.ts`
- [x] 来源记录：项目库里登记、改名、解开关联各一次事务，提交后读回；关掉再打开仍在 → 验证：`npx vitest run src/db/sqliteStoragePort.test.ts`
- [x] 录音行：项目库里保存并按项目列出，提交后读回；关掉再打开仍在。音频字节不进这一行 → 验证：`npx vitest run src/db/sqliteStoragePort.test.ts`
- [x] 另一项目的录音：按已有的 `text_id` 列出，缺行跳过，空的项目编号拒绝。关掉再打开仍在 → 验证：`npx vitest run src/db/sqliteStoragePort.test.ts`
- [x] 去掉一条空录音：先改碰到的 `.jyd`，再改项目库，提交后读回；关掉再打开仍在。不删音频文件，不改 `meta.audio_id` → 验证：`npx vitest run src/db/sqliteStoragePort.test.ts`
- [x] 文稿改挂录音：一份 `.jyd` 里替换 `meta.audio_id`，语段改成同一条，提交后读回；关掉再打开仍是一条 → 验证：`npx vitest run src/db/sqliteStoragePort.test.ts`
- [x] 跨文稿关系：同一份 `.jyd` 里的语段关系和父子链接提交后读回；两端不在同一份文稿就不写 → 验证：`npx vitest run src/db/sqliteStoragePort.test.ts`
- [x] 会话和消息：项目库里改标题、改消息正文、清空一个会话的消息，各一次事务，提交后读回；关掉再打开仍在。引用和推理正文不进消息行 → 验证：`npx vitest run src/db/sqliteAiConversations.test.ts`
- [ ] 其余项目库和 `.jyd` 上的业务操作 → 验证：这些方法不再拒绝
- [x] 桌面壳 `installStoragePort` 换上这个实现，默认仍不在浏览器里启用 → 验证：`npm run desktop:smoke` 写入一条回合，关掉再打开读回
- [x] 不适用：界面、E2E、`src/ai/**`

## Pre-merge gates

- [x] `npm run typecheck`（提交钩子）
- [x] 触及域的 vitest：`npx vitest run src/db/sqliteStoragePort.test.ts`
- [x] 不适用：E2E。未改界面
- [x] 不适用：`npm run check:architecture-guard`。未改编排层
- [x] 不适用：`src/ai/**`
- [x] `npm run check:docs-governance`
- [x] feature flag `sqliteStoragePortEnabled` 默认关。冒烟设置 `JIEYU_SQLITE_STORAGE_PORT=1`
