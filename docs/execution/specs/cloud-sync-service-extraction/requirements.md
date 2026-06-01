---
title: cloud-sync-service-extraction requirements
doc_type: execution-spec-requirements
status: draft
owner: repo
last_reviewed: 2026-06-01
source_of_truth: cloud-sync-service-extraction-spec
---

# Requirements — cloud-sync-service-extraction

## 1. What & Why

- **要做什么**：从 `useTranscriptionCloudSyncActions` 抽出远端 mutation 与 conflict record 构建逻辑到 `src/collaboration/cloud/` 服务层。
- **为什么现在做**：Wave 5 降复杂度；hook 仍保留 React 状态与 refs，业务写路径可单测。
- **不做什么**：本轮不强制 hook 压到 150 行；不改 outbound enqueue / presence / hydration 流程。

## 2. 用户场景

1. 远端 change 回放时，mutation 经 service 应用本地 DB 写并可选 reload snapshot。
2. 冲突治理需比较 local/remote record，builder 从当前 units/layers/links 与 shadow map 组装字段。

## 3. 验收标准

- [ ] `applyCollaborationRemoteMutation(change, options, deps)` 覆盖原 `applyRemoteMutation` 行为
- [ ] `buildRemoteConflictRecord` / `buildLocalSnapshotFields` / `buildLocalConflictRecord` 行为不变
- [ ] Hook 通过 thin useCallback 注入 deps（refs 当前值）
- [ ] `npm run typecheck` 通过
- [ ] 既有 cloud sync vitest 通过

## 4. 受影响代码地图

| 类别 | 文件 | 改动性质 |
| --- | --- | --- |
| Service | `src/collaboration/cloud/CollaborationProjectRemoteMutationService.ts` | 新增 |
| Service | `src/collaboration/cloud/collaborationConflictRecordBuilders.ts` | 新增 |
| Hook | `src/hooks/transcription/useTranscriptionCloudSyncActions.ts` | 修改（委托） |

## 5. 已知风险

- `CloudSyncRawActions` 接口在 service 与 hook 间需保持同步；后续可抽到共享 types 文件。
