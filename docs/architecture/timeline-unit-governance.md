---
title: Timeline Unit Governance
doc_type: architecture
status: active
owner: repo
last_reviewed: 2026-10-15
source_of_truth: process
---

# Timeline Unit Governance

## Single Read Entry
- Read `TimelineUnitViewIndex` in upper layers.
- Treat raw `layer_units` / `layer_unit_contents` rows as lower-level data sources only.

## Centralized Write Dispatch
- Route writes by `TimelineUnitView.kind` plus active layer `SegmentRoutingResult.editMode` via `src/pages/timelineUnitMutationDispatch.ts` (`dispatchTimelineUnitMutation` / `dispatchTimelineUnitSelectionMutation`).
- Require preview-confirm for multi-target AI writes.

## Naming Discipline
- New unit-level APIs use `unit`, not `utterance`, unless truly utterance-only.

## Permanent Gates
- Keep golden coverage for `utterance-only`, `segment-only`, and `mixed`.
- Record count-claim mismatches (`ai.count_claim_mismatch`, see below).

## No `utterances` store

- Utterance-shaped rows live only in **`layer_units` + `layer_unit_contents`** (see [ADR-006](../adr/adr-006-linguistic-subgraph-unitid-utterances-retirement.md)). Linguistic subgraph rows (`unit_tokens` / `unit_morphemes`) key on **`unitId`**.
- **Imports**: `importDatabaseFromJson` rejects a non-empty legacy top-level `units` key; other unknown collections are ignored. Use current-app exports only.

## Local Context Tool Naming (Current Contract)
- **Canonical-only contract:** runtime tool names follow canonical ids (`list_units` / `search_units` / `get_unit_detail`) via `normalizeToolName` in `src/ai/chat/localContextTools.ts`.
- **Legacy alias note:** legacy names (`list_utterances`, `search_utterances`, `get_utterance_detail`) are historical terms in prior planning docs, not the current runtime contract.
- **Architecture rule:** do not reintroduce alias map constants or alias-based fallback paths without an ADR update.
- **Count-claim drift:** assistant output that asserts a total count inconsistent with `projectUnitCount` / `projectStats.unitCount` increments `ai.count_claim_mismatch` (see `useAiChat.streamCompletion.ts`).
