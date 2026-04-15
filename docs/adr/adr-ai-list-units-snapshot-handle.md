---
title: ADR-007 list_units in-memory snapshot handle for large projects
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-04-15
source_of_truth: decision-record
---

# ADR-007 — `list_units` in-memory snapshot handle for large projects

## Status

Accepted (2026-04-15).

## Context

`list_units` reads from `localUnitIndex` in the prompt context. For large projects, returning every row in one tool JSON blows the model context and Phase C truncation still loses tail rows. We need a **paging contract** without persisting large blobs to Dexie.

## Decision

1. When `localUnitIndex` row count **> 50** (`LIST_UNITS_SNAPSHOT_ROW_THRESHOLD`), the first successful `list_units` call creates an **in-memory snapshot** (copy of normalized rows + optional `timelineReadModelEpoch`) keyed by **`resultHandle`** (UUID).
2. Follow-up pages use **`list_units({ resultHandle, offset, limit, sort })`**. Sorting is applied per request from the same snapshot rows.
3. **Storage**: single tab, `Map` in module scope — **not** Dexie. **TTL** 15 minutes; **max** 20 live handles; LRU-style prune when over cap.
4. **Staleness**: if both snapshot and current context carry a finite `timelineReadModelEpoch` and they **differ**, return error **`stale_list_handle`** so the client/model re-runs `list_units` without a handle.
5. **Invalid / expired**: return **`invalid_or_expired_handle`**.

## Consequences

- Handles are lost on full page reload; acceptable for AI tool paging within a session.
- Memory bounded by TTL + max entries + row cap per snapshot (large projects hold one full copy temporarily).
- No migration: optional JSON fields on tool results only.

## Alternatives considered

- **Dexie-backed snapshots**: heavier, schema/versioning; deferred unless cross-reload paging is required.
- **Only raise char budget**: does not fix model reasoning over huge single JSON.
