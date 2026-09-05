---
title: lexicon-attachments tasks
doc_type: execution-spec-tasks
status: active
owner: lexicon
last_reviewed: 2026-09-05
source_of_truth: lexicon-attachments-spec
depends_on:
  - ./requirements.md
  - ./design.md
---

# Tasks — Lexicon Attachments (B8)

## Implementation tasks

- [x] Dexie v53：`lexeme_assets` / `lexeme_asset_links` + Zod + io 剥 blob → `engine.lexemeAssets.test.ts`
- [x] `linguisticServiceLexemeAssetOps` 挂到 `LinguisticService.lexemes` → ops vitest（含 refcount）
- [x] Flag `lexiconAttachmentsEnabled` 默认 false + i18n
- [x] `useLexiconAttachmentController` + `LexiconAttachmentSection` 装配进 `LexiconPage` → page vitest
- [x] 代码地图 / 主路线图 B8 / CHANGELOG / a2a schema 断言

## Pre-merge gates（与拍板 2A 一致）

- [x] `npm run typecheck`
- [x] `npx vitest run src/db/engine.lexemeAssets.test.ts src/services/linguisticServiceLexemeAssetOps.test.ts src/pages/LexiconPage.test.tsx src/db/engine.agentArtifacts.test.ts src/db/engine.aiSessionMemories.test.ts src/db/migrations/jieyuDexieOpenReplay.test.ts`
- [x] `npx playwright test --project=chromium tests/e2e/criticalPaths.spec.ts`
- [x] `npm run check:architecture-guard`
- [x] `npm run check:docs-governance` + `npm run check:plans-frontmatter` + `npm run check:dev-agent-workflow-verify`
- [x] `npm run check:i18n-hardcoded:guard`
- [x] Feature flag 已注册并默认 `false`

## Commit 阶段证据模板

```
feat(lexicon): add B8 referenced attachments

Verified:
- npm run typecheck
- npx vitest run <touched>
- spec: docs/execution/specs/lexicon-attachments/
```

## Post-merge

- [ ] 自用 1 周后考虑 `lexiconAttachmentsEnabled` 默认 true
- [ ] 不在本切片做 FLEx/LIFT 附件包
- [ ] spec `status: completed` 待合入并 dogfood 后再改
