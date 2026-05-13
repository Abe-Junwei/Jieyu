---
title: AGENTS.md — Jieyu cross-tool agent baseline
status: active
owner: repo
last_reviewed: 2026-05-13
applies_to: ["cursor", "github-copilot", "kimi-cli"]
---

# Agent instructions (Jieyu)

> **每次会话先读 [AI_QUICKSTART.md](AI_QUICKSTART.md)（≤ 200 行路由文档）**，再继续本文。本文是 Cursor / GitHub Copilot / Kimi-cli 三工具共同自动加载的唯一权威基线；项目级长正文请按下文 Jieyu-specific 指针追读 [copilot-instructions.md](copilot-instructions.md)。

Behavioral guidelines below are adapted from [forrestchang/andrej-karpathy-skills](https://github.com/forrestchang/andrej-karpathy-skills) (Karpathy-inspired). Bias toward caution over speed; use judgment for trivial tasks.

## Jieyu-specific（一行一指针，全部指向 [copilot-instructions.md](copilot-instructions.md) 对应章节或 docs/）

- **项目级工程约束权威正文**：[copilot-instructions.md](copilot-instructions.md)（中文 canonical full text）。非 trivial 或触碰架构的任务**通读不得只读摘要**。
- **编排层 vs controller 边界、目录落位、复杂度阈值（300 行 / 12 hooks）、面板 CSS 双层边框**：见 [copilot-instructions.md](copilot-instructions.md) §0 / §一 / §二 / §三 / §九。
- **新任务默认工作流（Explore → Plan → Implement → Commit）**：见 [copilot-instructions.md](copilot-instructions.md) §五。Explore 仅读不改；Commit 必须附验证证据。
- **中等以上复杂度需写 SDD 三件套**（≥ 1 新 controller / ≥ 1 新 service / 跨 ≥ 3 controller 改动）：模板见 [docs/execution/specs/_template/](docs/execution/specs/_template/)。
- **ReadyWorkspace 装配**：波形 / UI state / segment scope 的 API **不得**从 `useTranscriptionData` 的 `data` 上取；见 [docs/architecture/ReadyWorkspace-数据域与壳层装配边界.md](docs/architecture/ReadyWorkspace-数据域与壳层装配边界.md)；门禁含于 `npm run check:architecture-guard`（`audit:ready-workspace-timeline-host`）。
- **docs 落位与治理**：[.cursor/rules/jieyu-docs-governance.mdc](.cursor/rules/jieyu-docs-governance.mdc) 与 `npm run check:docs-governance`。
- **当 docs 与代码冲突时**：优先 [docs/architecture/](docs/architecture/) 与代码为当前真相；历史规划只作上下文。
- **成熟方案优先**：新增功能 / 交互 / 算法 / 存储 / 集成 / 架构前，先调研业内成熟实现（库 / 规范 / 框架原生模式 / 仓库既有模块）；只有明确说明复用不适合后才自行设计。新增依赖必须说明维护、体积、许可与集成成本。
- **桌面端浏览器支持**：[docs/architecture/桌面端浏览器支持策略.md](docs/architecture/桌面端浏览器支持策略.md)；新或敏感的浏览器 API 用特性检测；行为差异需扩 E2E（`npm run test:e2e`；本地快环 `npm run test:e2e:chromium`）。
- **UI / Stitch handoff**：视觉工作先读 [DESIGN.md](DESIGN.md) 与 [src/styles/tokens.css](src/styles/tokens.css)；颜色映射语义 token；用户可见文案走 `dictKeys` / 字典，不留设计稿原文。
- **AI formatter 文案 vs UI 文案分层**：模型/工具输出固定句式放 `src/ai/messages/`，与界面字典不混命名空间。
- **单人合并门槛（拍板 2A）**：完成前必跑 `npm run typecheck` + 触及域的 `vitest`；交互 / ReadyWorkspace / 侧栏 / 时间轴改动还要 `npm run test:e2e:chromium`；完整改进决策见 [docs/execution/plans/单人AI协作改进计划-拍板决策-2026-05-11.md](docs/execution/plans/单人AI协作改进计划-拍板决策-2026-05-11.md)。
- **Feature flag**：高风险或 UI 觉察大改默认套 flag，`false` 合并、自用 1 周后切默认 `true`；见 [src/featureFlags.ts](src/featureFlags.ts) 与 [copilot-instructions.md](copilot-instructions.md) §五。

## 通用代理基线（Karpathy 4 rules）

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State assumptions explicitly; if uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- For new design or product capabilities, compare mature/common approaches before inventing custom architecture; record the reuse/adapt/custom decision briefly.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

Test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"
- Code reviews trace function call chains and end-to-end data flow (input → transform → persistence → readback). File-level / existence-only checks are not sufficient.
- Persistence paths require concrete verification evidence (targeted tests, repro scripts, or runtime traces), not schema/field presence alone.

未经实际验证，不得宣称"已完成"或"已修复"。

#### Code Review Hard Rules

When asked for a code review, always perform a behavior + data-flow audit, not a file-level scan:

- Trace reachable entry points: UI actions, routes, commands, workers, event emitters, scheduled jobs, scripts, service APIs.
- Follow the full chain: entry → state transition → side effect → persistence → cache/audit/log → readback.
- "Still referenced" ≠ useful. Code can be dead even when called, if its result no longer affects state, persistence, UI, downstream behavior, logs, or tests.
- Separate production / test-only / dev-only / fixture / story-demo / migration / script usage before declaring dead code.
- Check hidden risks: stale callbacks, un-awaited async, swallowed errors, feature flags making branches unreachable, orphaned listeners, duplicate subscriptions, stale cache writes, missing cleanup, migration gaps, old enum/value compatibility, permission/fallback paths, build vs runtime environment differences.
- For persistence: write → reload/requery → readback verification required.
- For tests: assert business outcomes via real entry points, not mock call counts or snapshots.
- Report findings with: broken path, why existing checks missed it, concrete verification needed for the fix.

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

## 工作流（Explore → Plan → Implement → Commit）

完整定义见 [copilot-instructions.md](copilot-instructions.md) §五。要点：

- **Explore**：仅读 src/ / docs/adr/ / docs/architecture/，产出已读事实清单。Cursor → Plan/Ask mode；Kimi → `--explore`；Copilot → Chat ask。
- **Plan**：产出落位 + 验证方式；用户确认后才切到实施。
- **Implement**：执行 plan；逐步 typecheck / 定向 vitest 验证。
- **Commit**：commit msg 附验证证据。
- 单文件 ≤ 10 行小修复可跳过 Explore，但 Commit 验证证据不可省。

## 机器守卫兜底（工具无关，最后一道防线）

任何 AI 工具忽略上述规则时，下列 check 命令兜底拦截：

- `npm run check:architecture-guard` — 编排层 / controller 边界 / 复杂度上限
- `npm run check:agent-evals[:smoke]` — 典型 AI 失误（错读路径、业务逻辑落到编排层、UI 文案落到 `src/ai/messages/`）
- `npm run check:docs-governance` — 文档放错位置
- `npm run typecheck` + 定向 `vitest` — 正确性回归

合并门槛与子 agent 委托决策见 [AI_QUICKSTART.md](AI_QUICKSTART.md)。

---

**Guidelines work if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
