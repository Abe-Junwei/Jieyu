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
- [ ] 其余项目库和 `.jyd` 上的业务操作（录音、来源等）→ 验证：这些方法不再拒绝
- [ ] 桌面壳 `installStoragePort` 换上这个实现，默认仍不在浏览器里启用 → 验证：Electron 冒烟能打开本机库
- [x] 不适用：界面、E2E、`src/ai/**`

## Pre-merge gates

- [x] `npm run typecheck`（提交钩子）
- [x] 触及域的 vitest：`npx vitest run src/db/sqliteStoragePort.test.ts`
- [x] 不适用：E2E。未改界面
- [x] 不适用：`npm run check:architecture-guard`。未改编排层
- [x] 不适用：`src/ai/**`
- [x] `npm run check:docs-governance`
- [x] 不适用：feature flag。还没换成默认实现
