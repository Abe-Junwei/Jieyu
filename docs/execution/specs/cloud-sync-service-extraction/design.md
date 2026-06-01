---
title: cloud-sync-service-extraction design
doc_type: execution-spec-design
status: draft
owner: repo
last_reviewed: 2026-06-01
source_of_truth: cloud-sync-service-extraction-spec
depends_on:
  - ./requirements.md
---

# Design — cloud-sync-service-extraction

## 1. Research

- 仓库既有模式：`CollaborationInboundApplier`（编排 apply 顺序）、`cloudSyncConflictHelpers`（纯函数 helpers）。
- 决定：**适配** — mutation 与 conflict builders 下沉为无 React 依赖的纯 async/同步函数，hook 保留 refs 与 state。

## 2. 架构选择

- 落位：`actions`（mutation service）+ `derived`（conflict record builders）。
- Hook 仅组装 deps：`runWithDbMutex`、`rawActionsRef.current`、`layersRef.current`、`layerLinksRef.current`、`loadSnapshot`、shadow/session refs。

## 3. 落位清单

| 文件 | 职责 |
| --- | --- |
| `CollaborationProjectRemoteMutationService.ts` | 按 `opType` 调用 rawActions / LinguisticService |
| `collaborationConflictRecordBuilders.ts` | remote/local conflict record 字段组装 |
| `collaborationInboundChangeApplier.ts` | inbound change + conflict governance |
| `collaborationCloudHydration.ts` | snapshot/timeline hydration |
| `useCollaborationPresence.ts` | presence connect/focus/visibility |
| `useCollaborationProjectHydration.ts` | auto snapshot/timeline hydration effect |
| `useCollaborationConflictReview.ts` | conflict tickets + inbound apply wiring |
| `useTranscriptionCloudSyncActions.ts` | 薄组合层 + outbound write wrappers |

## 4. 接口 sketch

```ts
applyCollaborationRemoteMutation(change, options?, deps) => Promise<boolean>
buildRemoteConflictRecord(change) => CollaborationRecord
buildLocalSnapshotFields(change, deps) => Record<string, FieldValue>
buildLocalConflictRecord(change, remoteRecord, deps) => CollaborationRecord
```

## 5. 验证

- `npm run typecheck`
- `vitest`：`useTranscriptionCloudSyncActions.*.test.tsx`、`collaboration/cloud/*.test.ts`
