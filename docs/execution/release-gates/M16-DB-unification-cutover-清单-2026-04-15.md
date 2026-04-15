# M16 — DB Unification Cutover Gate (Phase 16)

**Date:** 2026-04-15  
**ADR:** [ADR-003 DB Unification Timeline Units](../../adr/adr-db-unification-timeline-units.md)

## Go / no-go checklist

- [x] Segment reads go through `layer_units` projection (`LayerSegmentQueryService`); no runtime reads of removed `layer_segments` stores.
- [x] Segment writes go through `LayerUnitSegmentWriteService` + primitives; no dual-write feature flag or parallel legacy table writes.
- [x] `npm run test` / `npx vitest run` green for storage services (`LayerUnitSegmentWriteService`, segmentation, graph restore).
- [x] `npx tsc --noEmit` green.
- [x] `npm run check:architecture-guard` green (includes Phase 16 forbidden mirror-module guard).
- [x] `node scripts/check-segmentation-storage-boundary.mjs` green with updated whitelist.

## Follow-up (Phase 17)

After cutover, run `npm run gate:timeline-cqrs-phase16-17` for extended verification (payload invariants + segmentation boundary + unit write/query service tests). See [M17 verification gate](./M17-DB-unification-verification-清单-2026-04-15.md).

## Rollback note

User databases on Dexie < 31 still upgrade through existing `engine.ts` migrations; rollback of **code** only is supported via version control. There is no supported downgrade path that preserves v31+ data in removed stores.
