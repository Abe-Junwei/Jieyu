---
title: <feature-slug> tasks
doc_type: execution-spec-tasks
status: draft
owner: <author>
last_reviewed: YYYY-MM-DD
source_of_truth: <feature-slug>-spec
depends_on:
  - ./requirements.md
  - ./design.md
---

# Tasks — <feature-slug>

> 上限：≤ 60 行。颗粒度：每条 task ≤ 半天工作量；超过即拆。

## Implementation tasks

- [ ] 任务 1（具体到落位文件） → 验证：`<command>`
- [ ] 任务 2 → 验证：`<command>`
- [ ] 任务 3 → 验证：`<command>`
- [ ] …

## Pre-merge gates（与拍板 2A 一致）

- [ ] `npm run typecheck`
- [ ] 触及域的 `vitest`（具体路径：`<path>`）
- [ ] 触及交互 / ReadyWorkspace / 侧栏 / 时间轴：`npm run test:e2e:chromium`
- [ ] 触及编排 / 复杂度：`npm run check:architecture-guard`
- [ ] 触及 `src/ai/**`：`npm run check:agent-evals:smoke`
- [ ] 触及 docs：`npm run check:docs-governance` + `npm run check:plans-frontmatter`
- [ ] Feature flag（如启用）已注册并默认 `false`

## Commit 阶段证据模板

```
<title imperative ≤ 72 chars>

<body：动机，1–3 段>

Verified:
- <command 1> → <result>
- <command 2> → <result>
- spec: docs/execution/specs/<feature-slug>/
```

## Post-merge

- [ ] 自用 N 周后切 feature flag 默认值（如启用）
- [ ] 稳定 1 cycle 后清理 flag 与所有分支
- [ ] spec frontmatter `status: completed` + `closed_at: YYYY-MM-DD`
