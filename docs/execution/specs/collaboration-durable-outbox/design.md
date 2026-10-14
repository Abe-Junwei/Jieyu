---
title: collaboration-durable-outbox design
doc_type: execution-spec-design
status: draft
owner: repo
last_reviewed: 2026-10-12
source_of_truth: collaboration-durable-outbox-spec
depends_on:
  - ./requirements.md
---

# Design — collaboration-durable-outbox

## 1. 成熟方案扫描 / Research

- 仓库既有模式：`src/db/withTransaction.ts` 和主库 Dexie 已有事务封装；`CollaborationClientStateStore.idb.ts` 只有 `singleton` JSON 镜像，`CollaborationSyncBridge` 以 500 ms 防抖保存整个数组，不能作为跨标签页操作日志。
- 标杆实现/规范：浏览器原生 [IndexedDB 读写事务](https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction)支持同库多对象仓写入；[Supabase upsert](https://supabase.com/docs/reference/javascript/upsert)提供冲突键/忽略重复接口；[PostgreSQL INSERT](https://www.postgresql.org/docs/current/sql-insert.html)与[触发器定义](https://www.postgresql.org/docs/current/trigger-definition.html)说明冲突处理前可能执行 BEFORE INSERT 触发器。
- 不采用：`localStorage` 整数组读—改—写（跨标签页会互相覆盖）、`unload` 时补写（关闭/崩溃不可靠）、简单 `upsert(ignoreDuplicates)`（当前 revision 分配位于 BEFORE INSERT，跳过插入不必然跳过其副作用）、“先改本机再异步入队但不报错”（崩溃窗口仍丢同步意图）。
- 坑：旧镜像已 ACK 操作复活；两个标签页迁移重复；Dexie 事务里等待网络/API 会使事务失活；云端重试同 ID 异内容不能视作成功；新 SQL 的 `SECURITY DEFINER` 需显式身份/RLS 检查。复用现有 Dexie/PostgreSQL/测试工具，不增依赖，因此无新增许可或包体成本。
- 结论：**适配既有实现**，而非另造队列框架。分 B1a/B1b：先在主库建立操作级 durable store 并修复去重/ACK/旧镜像，再把本地写与 outbox 纳入同库事务；两阶段复用一套 schema，避免双重迁移。云端幂等 append 属后续 B2，不把它算成 B1a/B1b 的验收。

## 2. 架构选择

- `state`：主库 `outbox` 每操作一行，键 `(projectId, clientId, clientOpId)`，状态只需 pending/in-flight 可恢复标识；项目游标使用单调 `max` 更新。B1a 的 `actions/effect`：替换整数组保存、按键持久化/ACK，让入队返回 Promise 并在包装动作内等待；入队失败展示“本地已保存、云同步未保证”。仍存在业务写成功到入队前的崩溃窗口，测试和发布说明必须显式列出。B1b 再把本地领域写及 outbox insert 纳入同一 Dexie 事务；网络发送事务外执行。`derived`：UI 由持久化待发数和最近错误派生；页面只装配。
- 云端写入：追加 `002_*.sql` 的 `append_project_change_idempotent` RPC。以项目行锁序列化同项目 append，复用项目/成员/协议/版本/墓碑闸门；操作键已存在时核对不可变内容并返回原 revision，只有新操作才 INSERT。调用方把“已存在且内容相同”视为 ACK；任何权限或内容冲突继续保留待发并报错。
- 必要性：当前 `createCloudSyncedWriteActions.ts` 先 `await wrappedActionsRef.current.*` 再调用返回 `void` 的 `enqueueMutation`；B1a 只解决已入队操作耐久，不能满足“本机写+同步意图同生共死”。B1b 逐动作下沉到已有领域 service 的事务层，不能在 React hook 中直接拼数据库写。开始两阶段前先合入并审阅 `fix/p1-2-undo-collab`，按合并后的调用链重定落位。
- 拒绝的替代方案：仅靠 BroadcastChannel 通知/ Web Locks 协调内存队列。通知不是耐久记录，锁也不修复本机写与入队的原子性。保留事件通知只作 UI 刷新优化，不作正确性依据。

## 3. 落位与拆分

| 文件 | 职责 | 复杂度边界 |
| --- | --- | --- |
| `src/db/engine.ts`、`schemas.ts`、`migration/` | B1a：主库 v2 outbox 声明与升级；旧 v1 可打开/失败可恢复 | schema/迁移不进页面 |
| `src/collaboration/cloud/CollaborationClientStateStore*` | B1a：旧 localStorage/独立 IDB 状态单次、安全迁移；游标与 ACK 不回退 | 删除整数组持久化写 API 的生产调用 |
| `src/collaboration/cloud/CollaborationOutboundQueue.ts`、`CollaborationSyncBridge.ts` | B1a：按持久化操作分页发送、ACK 指定键、失败重试；跨标签页重新查询 | 不长期复制权威内存数组 |
| `src/hooks/transcription/createCloudSyncedWriteActions.ts`、`useTranscriptionCloudSyncActions.ts` 与现有领域 service | B1b：各操作在同库事务内写业务行和 outbox；hook 只传参/显示结果 | 不新增 mega-hook；逐动作测试 |
| `src/hooks/transcription/useTranscriptionCollaborationBridge.ts`、`supabase/sql/002_*.sql` | B2：调用/实现云端幂等 append，不直接变更已部署 `001` | 显式鉴权与最小权限；独立验收 |

## 4. ADR、flag 与兼容性

- 需新 ADR：B1a 主库操作级存储和旧状态迁移、B1b 同事务写、B2 云端 RPC 与 revision 分配的 hard-to-reverse 边界。专项 SDD 当前未入库；评审/入库并批准 ADR 前不写主库迁移或部署 SQL。
- 高风险 bug 修复不保留会丢数据的旧云写路径作为 flag=false；迁移异常时降级到本地可用、协作停写和明确提示，绝不静默继续旧队列。若需要新 flag，只控制新 UI 或逐用户启用，默认 false、自用一周后再打开。
- 旧用户：在读取新 outbox 前，事务内导入旧队列并标记迁移完成；同键去重；若旧镜像与更新的本地状态冲突，不能以时间戳直接覆写游标/ACK，需以单调 revision 与已确认操作集合校验。迁移确认前保留旧数据，确认后禁止再次回灌。
- 回滚：前端回退到不识别 v2 时不得使用旧云写队列；保留可导出本机项目的入口与只读/停写提示。数据库/SQL 已迁移时禁止自动降版本或删除 outbox；按 ADR 的前向兼容发布顺序操作。

## 5. 验证矩阵

| 验证 | 命令 / 场景 | 通过条件 |
| --- | --- | --- |
| 静态/结构 | `npm run typecheck`、`npm run check:architecture-guard`、`npm run check:dev-agent-workflow-verify` | 0 错误；无新业务逻辑落入编排层 |
| 本机单元 | `npx vitest run src/collaboration/cloud src/hooks/transcription` | B1a 两标签页/已入队耐久；B1b 本地业务与 outbox 同事务，分别先红后绿 |
| SQL 合同 | `npx vitest run src/collaboration/cloud/supabaseBaseline.pglite.test.ts` | 相同操作重试无新 revision；异内容冲突及跨成员/旧协议/墓碑拒绝 |
| 浏览器 | `npm run test:e2e:chromium -- tests/e2e/collaborationDualTabIndexedDb.spec.ts` | UI 编辑→关闭/重载→待发读回→重连，两个标签页均不丢；配额失败错误可见 |
| 真实云验收 | 双账号测试环境（待提供） | RLS/过期令牌/成员撤销、ACK 丢失与重连；未提供时标 blocked |
