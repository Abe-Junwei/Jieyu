---
title: agent-runtime-security-semantic-guard tasks
doc_type: execution-spec-tasks
status: active
owner: ai-governance
last_reviewed: 2026-09-03
source_of_truth: agent-runtime-security-semantic-guard-spec
depends_on:
  - ./requirements.md
  - ./design.md
---

# Tasks — Agent Runtime Semantic Guard (A9)

## Implementation tasks

- [ ] A9.1 `semanticGuard.ts`：`inspectInbound` / `inspectOutbound` + `SemanticGuardBlockedError` + 单测 → `npx vitest run src/ai/security/semanticGuard.test.ts`
- [ ] A9.2 flag `aiSemanticGuardEnabled` 默认 false + env 覆盖 → `npx vitest run src/ai/config/featureFlags.environmentMatrix.test.ts`
- [ ] A9.3 `CorpusSourceSet.trustTier` + citation pdf/note → `untrusted`
- [ ] A9.4 `installSemanticGuardCallbacks` 注册 `before_model` / `before_client`；persist 在 `createAssistantStream` 前 `runInboundSemanticGuard`
- [ ] A9.5 finalize / stream fallback `applyOutboundSemanticGuard`；catch 识别 block 错误 + 字典文案
- [ ] A9.6 i18n `ai.semanticGuard.blocked` + `semanticGuardFeedback.ts`
- [ ] A9.7 eval JSON `adversarial-semantic-guard-*` + `semantic_guard` verifier
- [ ] 路线图 A9 🟡；安全策略 / Runner 模型记落地

## Pre-merge gates

- [ ] `npm run typecheck`
- [ ] 触及域 vitest（上列路径 + `semantic-cases.test.ts`）
- [ ] `npm run check:architecture-guard`
- [ ] `npm run check:agent-evals:smoke`
- [ ] `npm run check:docs-governance` + `check:plans-frontmatter` + `check:dev-agent-workflow-verify`
- [ ] Feature flag 已注册且默认 `false`
- [ ] E2E：flag 默认关，不改现网 Chat DOM；本切片以单元 + eval 验收

## Commit 阶段证据模板

```
feat(ai): add A9 local semantic guard (flag off)

Verified:
- npm run typecheck
- npx vitest run <touched>
- spec: docs/execution/specs/agent-runtime-security-semantic-guard/
```

## Post-merge

- [ ] 自用 1 周后考虑 dogfood 默认 true
- [ ] spec `status: completed` + `closed_at`
- [ ] 下一刀 A14（非本 PR）
