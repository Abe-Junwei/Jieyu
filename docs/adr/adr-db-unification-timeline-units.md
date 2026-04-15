---
title: ADR-003 DB Unification Timeline Units
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-04-15
source_of_truth: decision-record
---

# ADR-003 DB Unification Timeline Units

## Status
Accepted

## Decision
Canonical persistence is `layer_units`, `layer_unit_contents`, and `unit_relations`. Legacy utterance and segment shapes map into that schema through explicit migration helpers.

## Mapping
- `UtteranceDocType` -> `LayerUnitDocType(unitType='utterance')` + `LayerUnitContentDocType(contentRole='primary_text')`
- `LayerSegmentDocType` -> `LayerUnitDocType(unitType='segment')`
- `LayerSegmentContentDocType` -> `LayerUnitContentDocType(contentRole='primary_text')`
- `segment.utteranceId` -> `UnitRelationDocType(relationType='derived_from')`

## Verification
- Replay tests confirm deterministic output.
- Idempotency tests confirm stable repeated runs.
- Backfill verification confirms unit/content/relation references stay intact.

## Phase 16 — Read/write cutover (greenfield, 2026-04-15)

**Reads:** `LayerSegmentQueryService` and related code query `layer_units` / `layer_unit_contents` / `unit_relations` only. Dexie v31 removed physical `layer_segments`, `layer_segment_contents`, and `segment_links` stores; migration hooks in `src/db/engine.ts` retain historical upgrade paths only.

**Writes:** Segment-shaped documents are persisted through `LayerUnitSegmentWriteService` (facade) and `LayerUnitSegmentWritePrimitives` (bulk/cascade helpers). There is no dual-write to legacy segmentation tables.

**Guards:** `scripts/check-segmentation-storage-boundary.mjs` whitelists the above storage-layer entry points; `scripts/architecture-guard.config.mjs` forbids reintroducing the deleted `LegacyMirrorService` / `LayerUnitSegmentMirrorPrimitives` module names.

**Release gate:** See `docs/execution/release-gates/M16-DB-unification-cutover-清单-2026-04-15.md`.

**See also:** [ADR-005 — Strangler path not taken](./adr-db-unification-strangler.md) (greenfield-style cutover instead of dual-write). [ADR-006 — Linguistic `unitId` + removal of `utterances` store](./adr-006-linguistic-subgraph-unitid-utterances-retirement.md) (**accepted**; Dexie v37 completes utterance **persistence** in `layer_units` only and removes the `utterances` collection).

## Phase 17 — Post-cutover verification closure (2026-04-15)

**Canonical payload checks:** `verifyUnifiedUnitBackfill` asserts content `textId` / `layerId` match the owning unit, relations use only `UnitRelationType` values, and relations do not form source/target self-loops (in addition to duplicate-id and referential checks from Phase 15).

**Automated gate:** `npm run gate:timeline-cqrs-phase16-17` runs architecture guard, `scripts/check-segmentation-storage-boundary.mjs`, migration replay/idempotency tests, and `LayerUnitSegmentWriteService` / `LayerUnitRelationQueryService` regression tests.

**Release gate:** See `docs/execution/release-gates/M17-DB-unification-verification-清单-2026-04-15.md`.
