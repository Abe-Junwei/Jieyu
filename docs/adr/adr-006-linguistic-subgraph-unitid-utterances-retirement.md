---
title: ADR-006 Linguistic Subgraph unitId + utterances Store Removal (Big-Bang)
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-04-15
source_of_truth: decision-record
---

# ADR-006 — 语言学子图 `unitId` 与 `utterances` 表移除（破坏性单次切流）

## Status
**Accepted** — aligned with [M18 行动方案](../execution/plans/M18-语言学子图-unitId-统一行动方案-2026-04-15.md): Dexie **v37** performs the cutover (`utterances` store removed; subgraph keys **`unitId` only**), with verification via `npm run test:m18-linguistic-subgraph` and `npm run gate:timeline-cqrs-full-migration`.

## Context

- [ADR-001](./adr-timeline-unit-view-read-model.md) unified **read** semantics via `TimelineUnitViewIndex`.
- [ADR-003](./adr-db-unification-timeline-units.md) made **`layer_units`** the canonical store for **segment-shaped** timeline units and defined mapping from legacy utterance/segment **document** shapes.
- **Remaining debt:** (1) `utterance_tokens` / `utterance_morphemes` still key by **`utteranceId`**; (2) the **`utterances`** Dexie collection remains a **second persistence root** for utterance-shaped rows, inviting drift and dual maintenance.

## Decision

1. **Linguistic subgraph**  
   - `utterance_tokens` and `utterance_morphemes` **shall use only `unitId`**, where **`unitId` === `layer_units.id`** for utterance-type hosts.  
   - The field **`utteranceId` shall not exist** on these documents after the M18 migration.  
   - **No** long-lived application fallback that reads legacy `utteranceId` in release builds.

2. **Utterance-shaped timeline rows**  
   - **Canonical persistence** is **`LayerUnitDocType` with `unitType='utterance'`** plus **`layer_unit_contents`**, per ADR-003 mapping.  
   - The **`utterances` Dexie store shall be removed** in the same schema version as the M18 migration.  
   - Application code **must not** read or write `db.utterances` after M18.

3. **Cutover style**  
   - **Big-bang only:** one Dexie major upgrade (or equivalent single migration entrypoint) performs data rewrite and store removal.  
   - **No** multi-release dual-write, shadow reads, or feature-flagged compatibility mode in **production** code paths.  
   - **Rollback** is **out-of-band**: user restores a **pre-upgrade backup** and runs an **older app build**; the product does **not** support downgrading the DB in-app.

4. **Import / export**  
   - **Export** after M18: JSON (or chosen format) **does not** emit a top-level `utterances` collection as the source of truth; utterance-shaped units appear under the **canonical** `layer_units` / contents model.  
   - **Import** (`importDatabaseFromJson`) accepts **current-format** whole-database snapshots only: rejects non-empty legacy `utterances` in `collections`, and rejects linguistic rows that still use **`utteranceId`** instead of **`unitId`**.

5. **Collaboration / multi-client**  
   - **Minimum client / sync protocol version** rises with the M18 release; **older clients must not write** shared state against post-M18 databases. Exact version numbers are **release engineering inputs**, not fixed in this ADR text.  
   - **Repo fact (2026-04-15):** `src/collaboration/*` uses **per-record `version`** for optimistic concurrency; there is **no** separate checked-in “M18 collab wire min version” constant. When a wire format ships, bump and document it in **release notes + a collaboration ADR**, and add a CI assertion if needed.

## Non-goals (unchanged unless a future ADR expands scope)

- **Segment-shaped** units are **not** required to gain full token/morpheme graphs in M18; linguistic host scope remains **utterance-type units** unless product extends it later.

## Nomenclature (avoid over-reading “zero utteranceId”)

M18 removes **`utteranceId` as the subgraph foreign key** on **`utterance_tokens` / `utterance_morphemes`** only; persisted subgraph rows use **`unitId`** (= `layer_units.id` of an **utterance-type** host).

**Not in scope** of that rename (and **not** violations of this ADR):

- **`UtteranceTextDocType.utteranceId`**, **`LayerSegmentDocType.utteranceId`**, and similar fields meaning “**host utterance unit id**” in translation/segment **document** shapes.
- In-memory / UI names such as **`utterances: UtteranceDocType[]`** — these are **projections** from canonical `layer_units`, **not** the removed Dexie `utterances` store.

Authoritative wording: [M18 命名与「子图 utteranceId」边界](../architecture/m18-linguistic-nomenclature.md).

## Consequences

- **Breaking change** for existing user databases: upgrade runs **only** with a tested migration; users must be warned to **back up** before upgrading.  
- **Simpler invariants:** `unitId` on linguistic rows always references **`layer_units`**.  
- **ADR-003** narrative is **completed** for the utterance **table**: the separate `utterances` collection is **retired**; mapping from historical `UtteranceDocType` remains valid as a **projection** shape only.  
- Architecture guard enforces **no `db.utterances` / `dexie.utterances` / `collections.utterances`** in `src/` except allowlisted migration paths (`scripts/architecture-guard.config.mjs`). **Forward-looking:** forbid `utterance_tokens` / `utterance_morphemes` **`.where('utteranceId'`** (post-M18 index is `unitId` only).

## Verification

- **`npm run test:m18-linguistic-subgraph`** — M18 cutover replay / idempotency / host-resolution (`src/db/migrations/m18LinguisticUtteranceCutover.test.ts`) **and** a minimal v36→v37 Dexie harness with `fake-indexeddb` (`src/db/migrations/m18LinguisticUtteranceCutover.dexie.test.ts`).  
- **`npm run gate:timeline-cqrs-full-migration`** — includes phase 15–17 DB migration tests **and** runs `test:m18-linguistic-subgraph` explicitly so the gate name’s docstring can point to an M18-scoped script.  
- `npm run typecheck`.  
- Import round-trip using **current-format** exports (see `src/db/importDatabaseFromJson.test.ts` and `importExportRoundTripIdempotency.test.ts`).  
- **Dexie upgrade atomicity:** v37 upgrade is executed inside Dexie’s version upgrade transaction; **half-written subgraph** on failure is handled by Dexie’s transaction semantics (not re-implemented in app code). Mock replay tests assert **logical** idempotency of `upgradeM18LinguisticUtteranceCutover` itself; the Dexie harness asserts the same hook against a real version upgrade on an isolated database name.

## Related

- [M18 — 语言学子图 unitId 统一 + utterances 退场（一锤定音版）](../execution/plans/M18-语言学子图-unitId-统一行动方案-2026-04-15.md)  
- [M18 命名与「子图 utteranceId」边界](../architecture/m18-linguistic-nomenclature.md)  
- [ADR-003 — DB Unification Timeline Units](./adr-db-unification-timeline-units.md)  
- [ADR-001 — Timeline Unit View Read Model](./adr-timeline-unit-view-read-model.md)
