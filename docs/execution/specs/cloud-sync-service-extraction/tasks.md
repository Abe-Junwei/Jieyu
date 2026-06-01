---
title: cloud-sync-service-extraction tasks
doc_type: execution-spec-tasks
status: draft
owner: repo
last_reviewed: 2026-06-01
source_of_truth: cloud-sync-service-extraction-spec
depends_on:
  - ./requirements.md
  - ./design.md
---

# Tasks — cloud-sync-service-extraction

## Implementation tasks

- [x] 新增 `CollaborationProjectRemoteMutationService.ts` → 验证：`npm run typecheck`
- [x] 新增 `collaborationConflictRecordBuilders.ts` → 验证：`npm run typecheck`
- [x] Hook 委托 extracted 函数 → 验证：cloud sync vitest
- [x]  brief SDD 三件套 → 验证：`npm run check:docs-governance`

## Pre-merge gates

- [x] `npm run typecheck`
- [x] `vitest src/hooks/transcription/useTranscriptionCloudSyncActions*.test.tsx`
- [ ] `npm run check:architecture-guard`（若本轮触及 hotspot）

## Commit 阶段证据模板

```
refactor(cloud-sync): extract remote mutation + conflict builders

Wave 5: move applyRemoteMutation and conflict record builders from
useTranscriptionCloudSyncActions into collaboration/cloud services.

Verified: npm run typecheck; vitest useTranscriptionCloudSyncActions.*
```
