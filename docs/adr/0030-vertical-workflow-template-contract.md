---
title: ADR-0030 — Vertical Workflow Template Contract
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-05-07
source_of_truth: decision-record
---

# ADR-0030: Vertical Workflow Template Contract

## Status

Accepted

## Context

Multiple vertical workflows (`segment_qa`, `annotation_qa`, `lexeme_candidates`, composed chains) share engineering patterns (reflection, evidence binding, eval suites) but risk drifting in naming, DTOs, and acceptance language. Planning documents used placeholders such as `00xx` ADR slots and informal names (e.g. `CorpusSourceSetSummary`) that did not match shipped code (`sourceScopeSummary`).

We need a single, code-aligned contract so that:

- Documentation and QA gates reference **stable symbols** under `src/ai/vertical/` and related hooks.
- **MCP and other narrow entry points** reject ambiguous scope instead of silently issuing wide reads.
- **Eval and dogfood metrics** can mature in phases without blocking merges on aspirational counts.

## Decision

1. **Naming source of truth**  
   User-visible “source scope summary” capability is implemented as `sourceScopeSummary` (`src/ai/vertical/sourceScopeSummary.ts`, `UiChatMessage.sourceScopeSummary`). Specs, audits, and acceptance checklists MUST use this name (or explicitly say “formerly referred to as CorpusSourceSetSummary in plans”).

2. **Empty read scope (MCP)**  
   `jieyu_list_segments`, `jieyu_get_segment_detail`, and `jieyu_diagnose_quality` MUST return a structured error (`SEGMENT_READ_SCOPE_REQUIRED`, `isError: true`) when `McpServerRuntimeContext` resolves to an empty `SegmentReadQueryScope` (no non-blank `textId`, `currentMediaId`, or `currentLayerId`). Integrations SHOULD map this error to a **strong user-facing prompt** (e.g. bind host / project context) rather than treating it as a silent empty list. The Dexie facade (`segmentReadQueries`) may retain legacy behaviour for in-app callers that supply explicit scope; MCP is strict.

3. **Vertical workflow template (eval + reflection)**  
   The reusable template for vertical workflows is defined by code in:

   - `src/ai/vertical/*Reflection.ts` + audit field names,
   - `verticalWorkflowRegistry` / eval suite ids,
   - `scripts/agent-evals/cases/` JSON shape and `scripts/agent-evals/cases/README.md` where present.

   Future dedicated “eval field dictionary” ADRs may extend this ADR without superseding its naming and scope rules.

4. **segment_qa eval volume**  
   Target remains a **full** golden set (plan: 10 cases). **Phased delivery** is allowed: an earlier milestone may ship with fewer cases (e.g. ≥6) provided suite id, thresholds, and trajectory fields match the template; expand to the full set in the same quarter.

5. **Tool-decision audit evidence pointers**  
   `ToolIntentAuditMetadata` / `ToolDecisionAuditMetadata` MAY include `evidenceSourceRefs`: dedupe-stable strings from `formatEvidenceSourceRefForAudit` (`src/ai/vertical/evidenceSourceRef.ts`), derived best-effort from tool `arguments` (including nested `propose_changes` children). Consumers use this field for joins with citations / `EvidencePacket`, not as a user-visible label.

6. **Release evidence skip taxonomy**  
   `scripts/generate-release-evidence-bundle.mjs` emits `skipTaxonomyRollup` (schemaVersion 1, `byTaxonomy`) derived from `skipReason` on skipped sections/cards, and sets `skipTaxonomy` on each skipped node that carries `skipReason` (same classifier). This supports analytics and dogfood; it is **not** a merge gate.

7. **Dogfood: defect-class skips**  
   “Zero defect-class skips” is a **goal metric** for continuous improvement. It MUST NOT block merge or release unless a separate, explicit gate is adopted by release governance.

8. **VoiceAgentService size**  
   `src/services/VoiceAgentService.ts` MUST stay **strictly below 950** physical lines (see `scripts/architecture-guard.config.mjs`). Singleton exports live in `VoiceAgentService.singleton.ts`; supporting modules continue to absorb cohesive chunks.

## Consequences

- MCP integration tests and hosts MUST pass `runtimeContext` with at least one scope field for read tools.
- Docs and audits should prefer linking to this ADR + code paths over duplicating evolving DTO names.
- Release evidence JSON gains a stable `skipTaxonomyRollup` field for downstream dashboards, plus per-skipped-node `skipTaxonomy` (same classifier as the rollup) for card-level analytics.
- Assistant explainability DTO lives in `src/ai/chat/workflowExplainability.ts` and may populate `UiChatMessage.workflowExplainability` (session UX / a11y); `AiRuntimeReport` may include optional `workflowExplainabilityRollup` when callers supply snapshots or call `attachWorkflowExplainabilityRollupFromChat`.
- Persisted copies MAY embed the DTO under `ai_messages.contextSnapshot.workflowExplainability` (finalize path); history hydrate restores `UiChatMessage.workflowExplainability` from that snapshot when present.
- Tool decision / intent audit metadata may carry `evidenceSourceRefs` for downstream joins with RAG citations and `EvidencePacket` rows.

## MCP host copy templates (`SEGMENT_READ_SCOPE_REQUIRED`)

When `isError: true` and the tool payload includes `SEGMENT_READ_SCOPE_REQUIRED`, hosts SHOULD show a **blocking** or **high-visibility** message (not an empty list). Suggested copy for integrators (adapt product name as needed):

**English (default)**  
Title: *Jieyu needs project context*  
Body: *Connect this chat or tool session to a Jieyu project (text / media / layer) before reading segments. Empty scope is not allowed for MCP read tools.*

**简体中文**  
标题：**需要绑定解语项目上下文**  
正文：**请先将本会话或工具宿主绑定到解语项目（语篇 / 媒体 / 层至少一项），再使用只读分段工具。MCP 禁止在空 scope 下静默全库读取。**

## References

- `src/ai/mcp/server/tools.ts`
- `src/ai/queries/segmentReadQueries.ts`
- `src/ai/vertical/sourceScopeSummary.ts`
- `src/ai/vertical/evidenceSourceRef.ts`
- `src/ai/chat/toolCallHelpers.ts` (`buildToolIntentAuditMetadata` / `buildToolDecisionAuditMetadata`)
- `src/ai/chat/workflowExplainability.ts`
- `scripts/generate-release-evidence-bundle.mjs`
- `docs/execution/plans/AI智能体架构改进方案-2026-05-06.md`
