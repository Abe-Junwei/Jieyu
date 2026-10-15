---
title: corpus-external-evidence tasks
doc_type: execution-spec-tasks
status: active
owner: repo
last_reviewed: 2026-10-15
source_of_truth: corpus-external-evidence-spec
depends_on:
  - ./requirements.md
  - ./design.md
---

# Tasks — corpus-external-evidence

## Implementation tasks

- [x] EvidencePacket 加 title / page / url
- [x] 文献与网页命中映射、A9 扫描、拒绝第二模型工具
- [x] stdio 客户端（flag 关零调用；无宿主 not_desktop）
- [x] turn bridge 路由 stdio；B16b 可引用证据包 id

## Pre-merge gates

- [x] `npm run typecheck`
- [x] 定向 vitest
- [x] 不适用：不改页面布局，不跑 e2e
- [ ] `npm run check:agent-evals:smoke`
- [x] `npm run check:docs-governance`

## Post-merge

- [ ] 自用后再考虑把 flag 默认打开
- [ ] 删除 `docs/execution/specs/corpus-external-evidence/`
