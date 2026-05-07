# Agent eval semantic cases (`*.json`)

This directory holds **JSON fixtures** consumed by `semantic-cases.test.ts` (Vitest). They are **not** shipped to the browser bundle.

## Contract

- **ADR-0030** (`docs/adr/0030-vertical-workflow-template-contract.md`) is the durable naming + phased eval policy reference; planning checklists point here for case shape and volume expectations (e.g. `segment_qa` phased ≥6, full target ≥10).
- Each file is one object with at least:
  - `caseId` — stable id (kebab-case, unique across files)
  - `category` — drives the branch in `runCase()` (`safety` | `policy` | `adversarial` | `evidence` | `workflow` | `rag` | `i18n`)
  - `capability`, `tier` (`blocking` | `quality`), `outcome`, `description`
  - `input` / `expected` — category-specific payloads (see test file)

## Running

From repo root:

```bash
npx vitest run scripts/agent-evals/cases/semantic-cases.test.ts
```

`semantic-cases.test.ts` loads **every** `*.json` in this folder; add a new file and the suite picks it up automatically.

## Workflow selection cases

For `category: "workflow"` (or `i18n` when only exercising `selectVerticalWorkflowV0`), put the user text in `input.selectWorkflowQuery` and assert `expected.workflowId` or `expected.noMatch`.

Avoid accidental matches with earlier keyword rules (e.g. substring `qa` inside English words matching `annotation_qa`); prefer **distinct** `segment_qa` keywords from `verticalWorkflowSelection.ts` when adding `segment_qa` positives.

The repo currently ships **10** `selectVerticalWorkflowV0` positives for `segment_qa` (`i18n-zh-segment-qa-01.json` plus `workflow-segment-qa-select-*.json`), meeting the ADR-0030 “full target” count for that slice; expand other suites (`evalSuiteId`, golden trajectories) separately as needed.
