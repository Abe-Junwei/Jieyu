---
title: igt-latex-export tasks
doc_type: execution-spec-tasks
status: active
owner: transcription
last_reviewed: 2026-09-13
source_of_truth: igt-latex-export-spec
depends_on:
  - ./requirements.md
  - ./design.md
---

# Tasks — IGT LaTeX export (C3c)

## Implementation tasks

- [x] SDD 三件套 `docs/execution/specs/igt-latex-export/` → 验证：`npm run check:docs-governance`
- [ ] `transcriptionIgtLatexExport.ts` + golden / escape / empty / LeipzigValidator → `npx vitest run src/utils/transcriptionIgtLatexExport.test.ts`
- [ ] `TranscriptionOutboundExportFormat` + `handleExportLite('tex')` + 菜单 + i18n + `toolbarExportTex` → typecheck + hub/export tests
- [ ] 主路线图 C3c 标已落地；E2E criticalPaths 菜单可见 IGT

## Pre-merge gates（与拍板 2A 一致）

- [ ] `npm run typecheck`
- [ ] `npx vitest run src/utils/transcriptionIgtLatexExport.test.ts src/hooks/importExport/useImportExport.export.test.tsx src/components/transcription/LeftRailProjectHub.test.tsx`
- [ ] `npm run test:e2e:chromium -- tests/e2e/criticalPaths.spec.ts`
- [ ] `npm run check:architecture-guard`
- [ ] `npm run check:docs-governance` + `npm run check:dev-agent-workflow-verify`
- [ ] 无新 feature flag

## Commit 阶段证据模板

```
feat(transcription): export Leipzig IGT as gb4e LaTeX

C3c: serialize token text/gloss + translation to gb4e \\gll; menu item; no write-back.

Verified:
- npm run typecheck
- npx vitest run src/utils/transcriptionIgtLatexExport.test.ts …
- spec: docs/execution/specs/igt-latex-export/
```

## Post-merge

- [ ] spec `status: completed` + `closed_at`
- [ ] 不排 C3d Word，除非另开 Research
