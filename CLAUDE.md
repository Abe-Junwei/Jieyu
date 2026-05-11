# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Sourced from [forrestchang/andrej-karpathy-skills](https://github.com/forrestchang/andrej-karpathy-skills) (Karpathy-inspired; upstream `CLAUDE.md`). Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

The same sections are mirrored in **`AGENTS.md`** for Cursor and other tools that read that filename.

## Jieyu-specific

- **Repository-wide engineering constraints** (orchestration vs controllers, `src/pages` controller hooks, complexity thresholds, `check:architecture-guard`, panel CSS two-layer border rule, etc.): the **canonical full text** is **`copilot-instructions.md`** at the repository root (Chinese). Follow it in full when working in this repo; it extends these universal guidelines and resolves ambiguity for Jieyu-specific rules.
- **ReadyWorkspace 装配**：波形 / UI state / segment scope 的 API **不得**从 `useTranscriptionData` 的 `data` 上取；见 `docs/architecture/ReadyWorkspace-数据域与壳层装配边界.md`，门禁已含于 `npm run check:architecture-guard`（`audit:ready-workspace-timeline-host`）。
- Docs layout and governed paths: `.cursor/rules/jieyu-docs-governance.mdc`
- Prefer `docs/architecture/` and code as current truth when docs conflict.
- **Mature solution first:** When adding a new feature, interaction, algorithm, storage flow, integration, or architecture, first research common mature implementations: established libraries/specs, framework-native patterns, and existing Jieyu modules. Prefer direct reuse or small adaptation when suitable; only design custom code after stating why reuse does not fit. Do not add a dependency unless its maintenance, bundle, license, and integration cost are justified.
- **Browser support (desktop):** `docs/architecture/桌面端浏览器支持策略.md`. New or sensitive browser APIs: check compatibility, prefer feature detection, and extend E2E if behavior differs across engines (`npm run test:e2e`; local quick loop `npm run test:e2e:chromium`).
- **UI / Stitch handoff:** For visual work, read repo-root `DESIGN.md` (design intent + Stitch export) and `src/styles/tokens.css`. Map colors to semantic tokens (`var(--…)`); do not introduce arbitrary hex in components unless deliberately extending `tokens.css` and updating `DESIGN.md`. User-visible copy must use i18n (`dictKeys` / dictionaries), not raw text from design tools.

---

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- For new design or product capabilities, compare mature/common approaches before inventing a custom architecture; record the reuse/adapt/custom decision briefly.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"
- For code reviews, trace function call chains and end-to-end data flow (input → transform → persistence → readback). File-level review or existence-only checks are not sufficient.
- For persistence-related paths, require concrete verification evidence (targeted tests, repro scripts, or runtime traces), not just schema/field presence checks.

### Code Review Hard Rules

When asked for a code review, always perform the review as a behavior and data-flow audit, not a file-level scan:

- Trace the reachable entry points: UI actions, routes, commands, workers, event emitters, scheduled jobs, scripts, and service APIs.
- Follow the full call chain from entry point to state transition, side effect, persistence, cache update, audit/log output, and readback path.
- Treat "still referenced" as insufficient evidence of usefulness. Code can be dead or invalid when it is called but its result no longer affects state, persistence, UI, downstream behavior, logs, or tests.
- Separate production, test-only, dev-only, fixture, story/demo, migration, and script usage before deciding whether code is dead.
- Check hard-to-see risks: stale callbacks, un-awaited async calls, swallowed errors, feature flags that make branches unreachable, orphaned event listeners, duplicate subscriptions, stale cache writes, missing cleanup, migration gaps, old enum/value compatibility, permission/feature-flag fallback paths, and build/runtime environment differences.
- For persistence, require write → reload/requery → readback verification. Schema fields, object properties, or write calls alone do not prove the feature works.
- For tests, verify that tests exercise real user or service entry points and assert business outcomes, not only mock calls, snapshots, or implementation details.
- When reporting findings, include the broken path, why existing checks would miss it, and the concrete verification needed to prove the fix.

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
