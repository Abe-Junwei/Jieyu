# 协作「阶段 / 门控」可视化（ARCH-6）

> 与 `docs/remediation-plan-2026-04-24.md` §3.6 对账；不替代代码真值，**以源码为准**。

## 1. 同步状态徽章 `deriveCollaborationSyncBadge`（`collaborationSyncDerived`）

**判定规则**：`src/collaboration/cloud/collaborationSyncSurfaceGates.ts` 内命名谓词与 `deriveCollaborationSyncBadge` 使用**同序**的「先匹配先生效」；以下流程自上而下。

```mermaid
flowchart TD
  A[输入: supabase / project / bridge / 写门控 / 冲突 / 待发送 / 在线] --> B{无 Supabase 配置或无 projectId?}
  B -- 是 --> I[idle]
  B -- 否 --> C{桥未 ready?}
  C -- 是 --> CO[connecting]
  C -- 否 --> D{协议禁写?}
  D -- 是 --> R[read_only]
  D -- 否 --> E{有冲突单?}
  E -- 是 --> X[conflict]
  E -- 否 --> F{离线 且 待发送>0?}
  F -- 是 --> OQ[offline_queue]
  F -- 否 --> G{待发送>0?}
  G -- 是 --> SY[syncing]
  G -- 否 --> OK[synced, pending=0]
```

- **与发布门控 m10–m13 无硬耦合**：本图为 **UI 同步徽章**，见 `collaborationPromotionRuntime` 的 **PhaseId** 是另一套（推进/发版闸门）。

## 2. 协议写门控 `evaluateCollaborationProtocolGuard`

顺序评估 `projects` 行（见 `src/collaboration/cloud/collaborationProtocolGuard.ts`）：无行 → 允许；否则依次检查 `protocolVersion` 可解析、**不大于**且**严格等于**客户端所支持主版本、存在 `app_min_version`、客户端 semver ≥ min。任一步失败则 `cloudWritesDisabled` + `reasons[]`。

## 3. 发布/推进相位 `m10`–`m13`

门控与灰度/阻断汇总见 `src/collaboration/collaborationPromotionRuntime.ts`（`PHASE_ORDER`、`evaluatePromotionReadiness`）。此处不另画整表，避免与 `digest` 规则漂移。

## 4. Bridge 启动管道（`useTranscriptionCollaborationBridge`）

`src/hooks/useTranscriptionCollaborationBridge.ts` 已将启动/停机控制流拆成命名步骤：

1. `stopBridgeRuntime` / `resetBridgeRuntimeState`：统一停机与状态复位。
2. `loadProtocolGuardFromCloud`：单点拉取并评估 `projects.protocol_version + app_min_version`。
3. `applyProtocolGuard`：集中更新 `writeGuardRef` 与 React surface 状态。
4. 主 effect 仅保留编排：`hydrate` → `auth` → `revision` → `guard` → `bridge.start`。

该拆分不改变 Phase 语义与对外契约，仅降低长链路 effect 的理解与排障成本。

## 后续

- 协作事务合并管道（`collaborationTransactionSyncRuntime`）若继续拆，可补充对应 flowchart 与 phase 对账附录。
