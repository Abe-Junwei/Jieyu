---
title: collaboration-durable-outbox tasks
doc_type: execution-spec-tasks
status: draft
owner: repo
last_reviewed: 2026-10-12
source_of_truth: collaboration-durable-outbox-spec
depends_on:
  - ./requirements.md
  - ./design.md
---

# Tasks — collaboration-durable-outbox

每条任务拆到半天左右；当前是**未入库草案**，须先完成评审/入库。B1a 仅解决已入队操作耐久，B1b 才解决本机业务写与入队的原子性；不可把 B1a 标为 B1 总修复。主计划：[整库审查发现统一修复方案](../../plans/整库审查发现统一修复方案-2026-10-12.md)。

## Implementation tasks

- [ ] C0a 前置：确认 `fix/p1-2-undo-collab` 已合并并回归；逐条列出合并后 `createCloudSyncedWriteActions.ts` 的动作、实际 service、Dexie 写事务与失败行为 → 验证：新 main 的调用链表与现有测试逐项对应。
- [ ] C0b 前置：评审/入库本 SDD，写并批准 ADR，确认主库 schema 与追加 SQL 的发布顺序 → 验证：规格/ADR 无待定数据安全决策。
- [ ] C1（B1a）：为两个标签页交错保存、500 ms 内关闭、配额恢复旧镜像倒退分别补修前失败测试 → 验证：`npx vitest run src/collaboration/cloud/CollaborationClientStateStore.test.ts src/collaboration/cloud/CollaborationSyncBridge.persistence.test.ts`。
- [ ] C2（B1a）：在主库新增操作级 outbox schema / v1→v2 迁移与按键写入/ACK API；旧 v1 开库和迁移失败保留原始数据 → 验证：`npx vitest run src/db src/collaboration/cloud`。
- [ ] C3（B1a）：迁入旧 localStorage 与独立 IDB 状态，迁移标记防重入；游标只前进，已 ACK 操作不复活 → 验证：`npx vitest run src/collaboration/cloud/CollaborationClientStateStore.test.ts`。
- [ ] C4a（B1a）：队列/桥接改成按键持久化、发送、ACK，不再保存整数组 → 验证：`npx vitest run src/collaboration/cloud`。
- [ ] C4b（B1a）：`enqueueMutation` 改为可等待的 Promise，包装动作等待落盘；失败显示本地已保存但云同步未保证 → 验证：`npx vitest run src/hooks/transcription`。
- [ ] C4c（B1a）：补双标签页、500 ms 内关闭与重开 E2E；报告明确仍有本地写→入队崩溃窗口 → 验证：`npm run test:e2e:chromium -- tests/e2e/collaborationDualTabIndexedDb.spec.ts`。
- [ ] C5a（B1b）：先选一组高频写动作，在领域 service 的同一 Dexie 事务内提交业务行与 outbox；证明不需跨事务外 await → 验证：定向 Vitest 故障注入读回。
- [ ] C5b（B1b）：按 C0a 清单迁完其余可协作动作；不可同事务动作阻止假成功并记录原因 → 验证：`npx vitest run src/hooks/transcription`，各动作故障注入读回。
- [ ] C6（B1b）：重做 C4c 浏览器场景，在本地提交到入队的旧窗口注入崩溃；验证业务行/outbox 同生共死后才关闭 B1 → 验证：`npm run test:e2e:chromium -- tests/e2e/collaborationDualTabIndexedDb.spec.ts`。
- [ ] C7（独立 B2）：为 ACK 丢失、同 ID 异内容、服务端 revision 不空跳、权限/协议/墓碑补 PGlite 修前测试 → 验证：`npx vitest run src/collaboration/cloud/supabaseBaseline.pglite.test.ts`。
- [ ] C8（独立 B2）：追加 `supabase/sql/002_*.sql` 幂等 append RPC，客户端改走 RPC；保留身份闸门和稳定操作 ID → 验证：C7 测试全绿；真实双账号未提供时仍标 blocked。

## Pre-merge gates

- [ ] `npm run typecheck` + 触及域 Vitest + `npm run test:e2e:chromium`，无重试或条件跳过冒充通过。
- [ ] `npm run check:architecture-guard` + `npm run check:docs-governance` + `npm run check:dev-agent-workflow-verify` + `npm run check:plans-frontmatter`。
- [ ] `npm run check:all`、干净构建、`git diff --check`；将既有失败与本批新增失败分开。
- [ ] 无不安全旧云写分支；如加 flag，false 为安全停写且在 `src/ai/config/featureFlags.ts` 登记。

## Commit 与后续

- 每个提交正文含实际跑过的 `Verified:` 命令、数量/结果、所处 Node 版本和未验项目；不得把 PGlite 或 mock 说成真实 Supabase 验收。
- [ ] 真实双账号/RLS、过期令牌、成员撤销、ACK 丢失及生产迁移演练后，方可把 V21/V22 标为运行验收通过。
- [ ] 发布后检查重复发送率、待发队列年龄与 revision 连续性；完成后一周期清理迁移兼容分支，更新规格状态与发现台账。
