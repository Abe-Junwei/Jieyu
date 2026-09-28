---
title: lexicon DMLex baseline tasks
doc_type: execution-spec-tasks
status: active
owner: lexicon
last_reviewed: 2026-09-27
source_of_truth: lexicon-dmlex-baseline-spec
depends_on:
  - ./requirements.md
  - ./design.md
---

# Tasks — lexicon-dmlex-baseline

## Implementation tasks

- [x] `LexemeDocType` 改为 entry/resource 联合，Zod 与嵌套 id 跟着改 → `npm run typecheck`
- [x] 编辑表单、列表、搜索改为词头与对译 → `npx vitest run src/pages/LexiconPage.test.tsx`
- [x] `subsense` / `homograph` 写在资源行 → `npx vitest run src/utils/dmlexEntry.test.ts`
- [x] 例句语段引用、自由注释、链接 `senseId` → 同上，加标注链接测试
- [x] LIFT 投影与诊断 → `npx vitest run src/utils/lexiconLiftImport.test.ts`

## Pre-merge gates

- [x] `npm run typecheck`
- [x] 触及域 vitest
- [x] `npm run test:e2e:chromium` — 39 passed
- [x] `npm run check:architecture-guard`
- [x] `npm run check:docs-governance`
- [x] `npm run check:dev-agent-workflow-verify`
