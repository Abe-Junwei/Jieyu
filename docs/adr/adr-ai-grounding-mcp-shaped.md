---
title: ADR-002 AI Grounding MCP Shaped
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-10-14
source_of_truth: decision-record
---

# ADR-002 AI Grounding MCP Shaped

> 自称 ADR-002，不是 [开放工作台范围](./0002-开放工作台范围.md)。

## Status
Accepted

## Decision
Ground AI with a small tier-1 snapshot (`worldModelSnapshot`, counts, selection, recent actions) and expose project detail through query/intent tools.

## Rationale
- Avoid prompt stuffing.
- Match MCP practice: compact resources plus schema-bound tools.
- Preserve deterministic grounding under context budgets.

## Consequences
- `worldModelSnapshot` is the default topology view.
- Detailed project scans should prefer `list_units`, `find_incomplete_units`, `diagnose_quality`, and related tools.
