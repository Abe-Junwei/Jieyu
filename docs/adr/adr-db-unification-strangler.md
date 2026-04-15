---
title: ADR-005 DB Unification — Strangler Path (Not Taken)
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-04-15
source_of_truth: decision-record
---

# ADR-005 DB Unification — Strangler Path (Not Taken)

## Status
Accepted (historical closure)

## Context
The unified timeline program originally allowed a **time-bounded dual-write strangler** (legacy segmentation tables + canonical `layer_units`) for in-place user DB upgrades.

## Decision
This repository shipped **direct canonical storage** for timeline segments: Dexie **v31** removed physical `layer_segments` / `layer_segment_contents` / `segment_links` stores; reads and writes go through `layer_units` and related services. **No strangler dual-write window** was implemented in application code.

## Consequences
- In-place upgrades rely on **Dexie migrations** in `src/db/engine.ts`, not on parallel legacy mirrors.
- Operational gates are **M16 (cutover)** and **M17 (verification)** under `docs/execution/release-gates/`, plus `npm run gate:timeline-cqrs-phase16-17`.
- For mapping, replay, and idempotency, the source of truth remains **[ADR-003](./adr-db-unification-timeline-units.md)**.

## Relation to other ADRs
- **Supersedes** any open-ended “strangler until further notice” wording in informal plans.
- **Does not** change the **read-model** direction in [ADR timeline unit view read-model](./adr-timeline-unit-view-read-model.md): `TimelineUnitViewIndex` remains the CQRS-style projection over persisted rows.
