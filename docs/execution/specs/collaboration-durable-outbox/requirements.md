---
title: collaboration-durable-outbox requirements
doc_type: execution-spec-requirements
status: draft
owner: repo
last_reviewed: 2026-10-12
source_of_truth: collaboration-durable-outbox-spec
---

# Requirements — collaboration-durable-outbox

## 1. What & Why

- 要做什么：将协作本地变更与待发送操作可靠关联，并使同一项目的多标签页写入、ACK、重载和配额恢复不静默丢操作或倒退游标。
- 为什么现在做：在 `ef8c43d` 上已复现两标签页待发送队列相互覆盖、旧 IDB 镜像恢复覆盖较新状态；当前 500 ms 防抖与 `void` 入队还存在崩溃窗口。
- 不做什么：不改协作实体的业务含义、不实现自动冲突合并、不把云端成功等同于本机持久化成功、不在本规格中加入新同步服务商。

## 2. 用户场景

1. 同一协作项目的两个标签页离线编辑，再刷新/重连；两条已成功提交的本机修改都能被找到并各发送一次，服务端不因重试产生第二个变更。
2. 浏览器空间不足或在保存/入队之间崩溃；用户能看到明确的未同步状态，重开后可恢复待发操作，不把旧镜像中的已 ACK 操作复活。
3. 云端已写入但响应丢失；相同操作重试后取回原 revision，后续待发操作继续，异内容复用操作 ID 被拒绝并可诊断。

## 3. 验收标准

- [ ] **B1a 阶段验收**：唯一键为 `(projectId, clientId, clientOpId)`；已经落入操作级存储的变更重入不增加待发数，ACK 只移除该键，两标签页不互相覆盖。B1a 不宣称消除业务写到入队之间的崩溃窗口。
- [ ] **B1a 阶段验收**：重启/跨标签页/配额恢复后游标只前进；已 ACK 操作不会因旧 localStorage 或旧 IDB 镜像再次待发；旧用户队列单次迁移且原件在迁移确认前保留。
- [ ] **B1a 阶段验收**：入队调用返回时，对应操作已落盘；入队失败时本地写可保留，但 UI 明示“本地已保存、云同步未保证”，不能显示同步成功。业务写完成到入队开始之间的崩溃窗口留待 B1b。
- [ ] **B1b 最终验收**：所有 `createCloudSyncedWriteActions` 所包裹的可协作本地写入，成功路径都在同一 IndexedDB 事务内写业务行与操作级 outbox；未覆盖动作必须显式阻止“可同步成功”提示并列入待办。
- [ ] 本地写入、出站入队、云端 ACK、读回分开标记；无未落盘的“同步成功”，重载后状态与 UI 一致。
- [ ] 云端重复投递不产生新行或 revision 空跳；异内容同 ID 报协议冲突；现有身份、项目成员、版本、墓碑检查不得被绕过。
- [ ] 故障注入覆盖事务中断、关闭标签页、跨标签页交错、重复 ACK、网络响应丢失、旧数据库升级和配额不足；断网期间不丢本机已提交数据。

## 4. 受影响代码地图

| 类别 | 文件 / 目录 | 改动性质 |
| --- | --- | --- |
| 主库与迁移 | `src/db/engine.ts`、`src/db/schemas.ts`、`src/db/tableRegistry.ts`、`src/db/migration/` | 新增本机操作级 outbox 及升级/恢复约束 |
| 旧状态迁移 | `src/collaboration/cloud/CollaborationClientStateStore.ts`、`.idb.ts` | 单次导入旧队列/游标，禁止旧镜像回灌 |
| 队列与桥接 | `src/collaboration/cloud/CollaborationOutboundQueue.ts`、`CollaborationSyncBridge.ts` | 从持久化操作读取/ACK，不用整数组覆写 |
| 写入接线 | `src/hooks/transcription/createCloudSyncedWriteActions.ts`、`useTranscriptionCollaborationBridge.ts` 及其领域写 service | 同事务提交业务写与 outbox，失败可见 |
| 云端协议 | `supabase/sql/002_*.sql`、`src/collaboration/cloud/supabaseBaseline.pglite.test.ts` | 幂等 append、权限和 revision 测试 |
| 测试 | `src/collaboration/cloud/*.test.ts`、`src/hooks/transcription/*.test.tsx`、`tests/e2e/collaborationDualTabIndexedDb.spec.ts` | 修前红、修后绿及浏览器读回 |

## 5. 已知风险与依赖

- 本地写入可能由不同领域 service 持有独立事务；实施前逐项列 `createCloudSyncedWriteActions` 的真实写入调用链，无法共事务的动作不得伪装为已解决。触及主库 schema，必须遵守旧库升级失败恢复和 versionchange 约束。
- 先合入 `fix/p1-2-undo-collab` 并回归后才可实施 B1a/B1b；该分支改到 `useTranscriptionCloudSyncActions.ts` 等相邻写链。D-1 删除协作模拟虽不直接冲突，若先合入也要重建测试基线。本 SDD 是未入库草案，评审并入库之前不得按其直接迁移。
- 另立 ADR 固定本机 outbox 存储与云端 append 协议。生产 SQL 必须追加迁移，不直接改已部署的 `001`；真实 Supabase 双账号暂缺，代码阶段不能签署 RLS 验收。
- 不以新增 feature flag 让已知不可靠旧路径继续默认写云；若保留回退开关，只允许安全停写。主计划：[整库审查发现统一修复方案](../../plans/整库审查发现统一修复方案-2026-10-12.md)。
