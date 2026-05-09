# GitHub Copilot Workspace Instructions

## Where the full rules live (single source of truth)

- **Universal agent baseline** (Karpathy-style sections + code-review data-flow rules): repo-root **`AGENTS.md`** (same content mirrored in **`CLAUDE.md`** for other tools).
- **Jieyu project-level engineering constraints** (orchestration vs controllers, directory layout, complexity thresholds, `check:architecture-guard`, panel CSS two-layer border rule, etc.): repo-root **`copilot-instructions.md`** — **canonical full text**; follow it in full for this codebase.

This file is a **short workspace entry** for Copilot; it does not replace the documents above.

---

This repository uses the Karpathy-inspired agent rules from forrestchang/andrej-karpathy-skills as always-on guidance for every non-trivial task.

## Always apply these four rules

1. Think Before Coding
- State assumptions explicitly.
- If the request is ambiguous, clarify instead of guessing.
- Surface simpler options and tradeoffs before implementing.
- Before designing a new feature or architecture, research mature/common implementations and existing repo patterns; reuse or adapt proven solutions when suitable, and only design custom architecture after explaining why reuse does not fit.

2. Simplicity First
- Write the minimum code that solves the request.
- Do not add speculative abstractions, configurability, or unrelated cleanup.

3. Surgical Changes
- Only touch code that is directly related to the task.
- Match the repository’s current style and boundaries.
- If you notice unrelated issues, mention them instead of changing them.

4. Goal-Driven Execution
- Define success criteria before making changes.
- For bugs and refactors, prefer a focused repro or targeted verification first.
- Do not claim completion without fresh verification evidence.
- During code review, trace function call chains and end-to-end data flow (input -> transform -> persistence -> readback); file-level or existence-only checks are insufficient.
- For persistence paths, require concrete verification evidence (targeted tests, repro scripts, or runtime traces), not only schema/field presence.
- Every code review must check hard-to-see risks: dead or invalid calls whose results are no longer consumed, test-only/dev-only references, stale callbacks, un-awaited async calls, swallowed errors, unreachable feature-flag branches, orphaned listeners/subscriptions, stale cache writes, cleanup leaks, migration gaps, fallback/permission paths, and build/runtime environment differences.
- Review findings should name the broken path, why existing checks could miss it, and the verification needed to prove the fix.

## Repository-specific reminders

- Prefer the codebase and docs/architecture as the current source of truth when historical docs conflict.
- Mature solution first: for new product features, interaction patterns, algorithms, protocols, storage flows, or architecture, first check established libraries/specs/framework patterns and the repository's existing implementations; document what can be reused, what needs adaptation, and what must be custom-built.
- Keep orchestration layers thin; move heavy business logic into the appropriate controller, service, or utility.
- For medium or larger tasks, decide the landing file first, then implement.
- Follow the full project rules in **`copilot-instructions.md`** and the universal baseline in **`AGENTS.md`** / **`CLAUDE.md`** as described at the top of this file.
