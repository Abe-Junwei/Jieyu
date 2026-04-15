---
title: ADR-001 Timeline Unit View Read Model
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-04-15
source_of_truth: decision-record
---

# ADR-001 Timeline Unit View Read Model

## Status
Accepted

## Decision
Use `TimelineUnitViewIndex` as the single read projection for AI, waveform, timeline, and selection paths.

## Rationale
- Aligns upper layers on one rebuildable CQRS-style projection.
- Prevents mixed utterance/segment caliber bugs.
- Keeps write routing explicit through `kind`.

## Consequences
- Upper-layer modules should consume `TimelineUnitViewIndex`, not parallel raw `utterances` + `segmentsByLayer`.
- Cross-chain invariants are enforced in tests, metrics, and architecture guard rules.
