---
title: corpus-library-html-bundle tasks
doc_type: execution-spec-tasks
status: active
owner: corpus
last_reviewed: 2026-09-05
source_of_truth: corpus-library-html-bundle-spec
depends_on:
  - ./requirements.md
  - ./design.md
---

# Tasks — Corpus Library HTML / Bundle (P1 / B5c)

## Implementation tasks

- [x] HTML formatter + 长度门 + XSS 转义 golden
- [x] ClipboardItem 双 MIME Blob；无 API 回退 `writeText`
- [x] fflate zip 文件集 + 空选不下载
- [x] controller/UI 按钮与错误码 i18n；不破 12-hook / 双层边框
- [x] 更新路线图 / 代码地图 / CHANGELOG

## Pre-merge gates

- [x] `npm run typecheck`
- [x] 触及域 `vitest`（export / clipboard / bundle / CorpusLibraryPage / layoutGuard）
- [x] `npm run check:architecture-guard`
- [x] `npm run check:docs-governance` + `check:plans-frontmatter` + `check:dev-agent-workflow-verify`
- [x] Feature flag 仍默认 `false`
- [ ] `npm run test:e2e:chromium`（`/corpus` 占位不回归）

## Commit 阶段证据模板

```
feat(corpus): add P1 HTML clipboard and workset bundle

Verified:
- npm run typecheck
- npx vitest run src/pages/corpusWorksetExport.test.ts ...
- npm run check:architecture-guard
- npm run check:docs-governance
```

## Post-merge

- [ ] 自用后视放量再开页面 flag
- [ ] 不做 EAF 直到单独切片
- [ ] spec `status: completed` 待稳定一 cycle
