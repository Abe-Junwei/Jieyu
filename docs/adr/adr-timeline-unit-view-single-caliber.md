---
title: ADR-004 Timeline Unit Single Caliber
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-04-15
source_of_truth: decision-record
---

# ADR-004 Timeline Unit Single Caliber

## Status
Accepted

## Decision
Do not introduce new upper-layer code that reads raw `utterances` and `segmentsByLayer` in parallel when a `TimelineUnitViewIndex` is available.

## Lifecycle Policy
- Compatibility aliases are time-bounded.
- New selection/context APIs must use `unit` terminology for unit-level semantics.
- Mixed golden scenarios (`utterance-only`, `segment-only`, `mixed`) remain permanent release gates.

## Guard Alignment
- Architecture guard rules must reference this ADR.
- CI blocks new split-caliber reads in AI, waveform, timeline, and selection surfaces.
