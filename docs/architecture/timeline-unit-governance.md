---
title: Timeline Unit Governance
doc_type: architecture
status: active
owner: repo
last_reviewed: 2026-04-15
source_of_truth: process
---

# Timeline Unit Governance

## Single Read Entry
- Read `TimelineUnitViewIndex` in upper layers.
- Treat raw utterance/segment tables as lower-level data sources only.

## Centralized Write Dispatch
- Route writes by `TimelineUnitView.kind` plus active layer `SegmentRoutingResult.editMode` via `src/pages/timelineUnitMutationDispatch.ts` (`dispatchTimelineUnitMutation` / `dispatchTimelineUnitSelectionMutation`).
- Require preview-confirm for multi-target AI writes.

## Naming Discipline
- New unit-level APIs use `unit`, not `utterance`, unless truly utterance-only.

## Permanent Gates
- Keep golden coverage for `utterance-only`, `segment-only`, and `mixed`.
- Record mismatch metrics for counts, alias usage, and stale count claims.

## M18 — No compatibility persistence for `utterances` (2026-04-15)

- **Dexie v37** removes the `utterances` store; utterance-shaped rows live only under **`layer_units` + `layer_unit_contents`** (see [ADR-006](../adr/adr-006-linguistic-subgraph-unitid-utterances-retirement.md)).
- **Linguistic subgraph** rows use **`unitId` only** on `utterance_tokens` / `utterance_morphemes`; do not reintroduce `where('utteranceId')` in application code (architecture guard enforces this).
- **Imports**: `importDatabaseFromJson` rejects non-empty legacy top-level `utterances` in JSON snapshots and rejects linguistic rows that still use **`utteranceId`** instead of **`unitId`**; use current-app exports only.

## Local context tool alias sunset (Phase 9A)
- **Legacy names** (compatibility only): `list_utterances`, `search_utterances`, `get_utterance_detail` → canonical `list_units` / `search_units` / `get_unit_detail`.
- **Telemetry:** each alias resolution increments `ai.local_tool_alias_usage` (tags: `aliasName`, `canonicalName`).
- **Removal gate:** after **two consecutive releases** with alias usage near-zero in aggregated metrics, delete `LEGACY_LOCAL_CONTEXT_TOOL_ALIAS_MAP` in `src/ai/chat/localContextTools.ts` without adding new aliases unless an ADR extends the contract.
- **Count-claim drift:** assistant output that asserts a total count inconsistent with `projectUnitCount` / `projectStats.unitCount` increments `ai.count_claim_mismatch` (see `useAiChat.streamCompletion.ts`).
