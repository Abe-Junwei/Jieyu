# GitHub Copilot Workspace Instructions

This repository uses the Karpathy-inspired agent rules from forrestchang/andrej-karpathy-skills as always-on guidance for every non-trivial task.

## Always apply these four rules

1. Think Before Coding
- State assumptions explicitly.
- If the request is ambiguous, clarify instead of guessing.
- Surface simpler options and tradeoffs before implementing.

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

## Repository-specific reminders

- Prefer the codebase and docs/architecture as the current source of truth when historical docs conflict.
- Keep orchestration layers thin; move heavy business logic into the appropriate controller, service, or utility.
- For medium or larger tasks, decide the landing file first, then implement.
- Follow the fuller project rules in the root instruction files already present in this repo.
