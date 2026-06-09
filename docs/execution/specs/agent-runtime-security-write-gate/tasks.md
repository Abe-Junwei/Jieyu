---
title: agent-runtime-security-write-gate tasks
doc_type: execution-spec-tasks
status: draft
owner: ai-governance
last_reviewed: 2026-06-09
source_of_truth: agent-runtime-security-write-gate-spec
depends_on:
  - ./requirements.md
  - ./design.md
---

# Tasks — Agent Runtime Security Write Gate (A7)

> Implement 前须 A6 Batch B 写 executor 登记就绪。阻塞：B4 新写工具、A10 `commitToolEffects`。

## Phase 1: Policy 矩阵 v1

| # | 任务 | 文件 | 验证 |
|---|------|------|------|
| 1.1 | 扩展 `aiToolPolicyMatrix`：`effect`（read/write/destructive）、`scopeBinding` | `aiToolPolicyMatrix.ts` | vitest |
| 1.2 | 只读工具登记 parity（localContextTools 全集） | catalog shadow / matrix | grep + test |

## Phase 2: Last Mile gate

| # | 任务 | 文件 | 验证 |
|---|------|------|------|
| 2.1 | ✅ `assertLocalContextToolAllowed` / `assertAiChatToolWriteAllowed` | `toolWriteGate.ts` | `toolWriteGate.test.ts` |
| 2.2 | ✅ local executor + `toolDecisionPipeline` 接入 | `localContextToolExecutors.ts`, `toolDecisionPipeline.ts` | vitest |
| 2.3 | ✅ flag `aiToolWriteGateEnabled` 默认 false | `featureFlags.ts` | typecheck |

## Phase 3: Pipeline 只读自动放行

| # | 任务 | 文件 | 验证 |
|---|------|------|------|
| 3.1 | ✅ `resolveLocalContextToolPolicyDecision`（readonly 绕过 ask_first） | `resolveExecutionPolicy.ts`, `useAiChat.streamCompletion.ts` | `resolveExecutionPolicy.test.ts` |
| 3.2 | ✅ block 文案 i18n + explainability | `toolWriteGateFeedback.ts`, dictKeys | vitest |
| 3.3 | ✅ dogfood/staging 默认开启 write gate | `featureFlags.ts` | env matrix test |

## Phase 4: A11 衔接（可与 A11 并行）

| # | 任务 | 文件 | 验证 |
|---|------|------|------|
| 4.1 | ✅ `supportsPreview` + write-gate preview routing | `aiToolPolicyMatrix.ts`, `toolDecisionPipeline.ts` | `toolDecisionPipeline.writeGate.test.ts` |

## Pre-merge gates

- [ ] `npm run typecheck`
- [ ] `npx vitest run src/ai/policy/` + gate tests
- [ ] `npm run check:agent-evals:smoke`
- [ ] `npm run check:architecture-guard`
- [ ] `npm run check:docs-governance`

## 关联（非本 spec）

- **B11 MCP schema 隔离**：trust 前 schema 不进 LLM — 见架构补强 §9，另 spec Implement 前定稿
