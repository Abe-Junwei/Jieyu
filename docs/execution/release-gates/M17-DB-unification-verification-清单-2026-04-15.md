---
title: M17 DB Unification Verification Gate (Phase 17)
doc_type: release_gate
status: active
owner: repo
last_reviewed: 2026-04-15
source_of_truth: process
---

# M17 — DB Unification Verification Gate (Phase 17)

**Date:** 2026-04-15  
**ADR:** [ADR-003 DB Unification Timeline Units](../../adr/adr-db-unification-timeline-units.md)

## Go / no-go checklist

- [x] `verifyUnifiedUnitBackfill` enforces content↔unit `textId` / `layerId` alignment, valid `relationType`, and no self-loop relations.
- [x] `npm run test:timeline-cqrs-phase15-17` green (includes migration replay, idempotency, `LayerUnitSegmentWriteService`, `LayerUnitRelationQueryService`).
- [x] `npm run check:timeline-cqrs-phase16-segmentation` green (`scripts/check-segmentation-storage-boundary.mjs`).
- [x] `npm run gate:timeline-cqrs-phase16-17` green (Phase 16 + 17 bundle).
- [x] `npx tsc --noEmit` green.

## Relation to Phase 16

Phase 16 covers read/write cutover and storage-boundary whitelists; Phase 17 adds **structural verification** on canonical backfill payloads and wires **service-level** tests into the same gate as migration tests.
