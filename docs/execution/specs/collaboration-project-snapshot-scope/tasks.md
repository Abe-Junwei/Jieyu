---
title: collaboration-project-snapshot-scope tasks
doc_type: execution-spec-tasks
status: active
owner: collaboration
last_reviewed: 2026-09-20
source_of_truth: collaboration-project-snapshot-scope-spec
depends_on:
  - ./requirements.md
  - ./design.md
---

# Tasks — Collaboration Project Snapshot Scope

## Implementation tasks

- [x] SDD 三件套 + ADR-0034 → 验证：`npm run check:docs-governance`
- [x] `filterCollectionsForProject` + export/import/prune → 验证：`npx vitest run src/db/projectScopedSnapshot.test.ts`
- [x] 接线 auto snapshot / hydration / restore → 验证：`npx vitest run src/collaboration/cloud/collaborationCloudHydration.test.ts`
- [x] inbound cursor 在 apply 成功之后 → 验证：`npx vitest run src/hooks/transcription/useTranscriptionCollaborationBridge.test.tsx`
- [x] `navigator.storage.persist` 特性检测 → 验证：`npx vitest run src/utils/requestPersistentStorage.test.ts`
- [x] 架构文档 / CHANGELOG / 路线图 C4 口径 → 验证：`check:docs-governance`

## Pre-merge gates（与拍板 2A 一致）

- [x] `npm run typecheck`
- [x] 触及域的 `vitest`（`src/db/projectScopedSnapshot.test.ts`、`src/collaboration/cloud/collaborationCloudHydration.test.ts`、`src/hooks/transcription/useTranscriptionCollaborationBridge.test.tsx`、`src/utils/requestPersistentStorage.test.ts`）
- [x] 触及交互 / ReadyWorkspace / 侧栏 / 时间轴：N/A（无 UI 行为变更）
- [x] `npm run check:architecture-guard`
- [x] 触及 `src/ai/**`：N/A
- [x] `npm run check:docs-governance` + `check:plans-frontmatter`
- [x] Feature flag：无新 flag

## Commit 阶段证据模板

```
fix(collab): scope project snapshots to textId and apply before cursor

Verified:
- npm run typecheck
- npx vitest run <paths>
- spec: docs/execution/specs/collaboration-project-snapshot-scope/
```

## Post-merge

- [ ] spec frontmatter 保持 `status: active` 直至 dogfood 确认 restore 路径
- [ ] 不接 `gate:collaboration-cloud` 到 PR
