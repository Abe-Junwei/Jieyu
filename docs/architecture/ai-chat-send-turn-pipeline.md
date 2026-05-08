---
title: AI 聊天 send-turn 管道（现状）
doc_type: architecture
status: active
owner: repo
last_reviewed: 2026-05-08
source_of_truth: current-state
---

# AI chat send-turn pipeline

This document describes the **client-side** send path for the transcription AI panel (`runAiChatSendTurn` and its modules). It is the current-state map for code under `src/hooks/useAiChat.sendTurn*.ts`.

## Stages

1. **Preflight** (`useAiChat.sendTurnPreflight.ts`) — feature flags, busy guard, budget, session memory updates, UI seed (user + streaming assistant), abort controller + first-chunk timeout, persistence helpers, metric tags. Produces a `correlationId` (`snt*`) for optional debug tracing.
2. **Persist + primary stream** (`useAiChat.sendTurnPersistAndPrimaryStream.ts`) — opening persistence, first `createAssistantStream`, DB / generation metadata wiring.
3. **Stream phase** (`useAiChat.sendTurnStreamPhase.ts`) — consume chunks, output-cap retries, completion, agent loop continuation.
4. **Completion** (`useAiChat.sendTurnCompletion.ts`) — `catch` maps abort/timeout/provider errors to assistant message status; `finally` clears timers, flushes usage into metrics, invokes `onMessageComplete`.

Orchestration lives in `useAiChat.sendTurn.ts`; `useAiChat.ts` only delegates into `runAiChatSendTurn`.

## Optional phase logging

When `localStorage['jieyu_debug_ai_send_turn'] === '1'`, `useAiChat.sendTurnCorrelation.ts` logs phase boundaries (`preflight_ok`, `persist_primary_stream_*`, `stream_phase_start`, `stream_catch`, `finally`) with the turn `correlationId`. Default builds stay quiet.

## Tests

- Structure / import seams: `useAiChat.structure.test.ts`
- Completion paths: `useAiChat.sendTurnCompletion.test.ts`
- Persist + primary stream failure seams (mocked persist / stream factory / DB update): `useAiChat.sendTurnPersistAndPrimaryStream.test.ts`
- Stream phase happy/error/empty + output-cap retry seams (mocked completion, agent loop, `flushSync`, `createAssistantStream`): `useAiChat.sendTurnStreamPhase.test.ts`
- Preflight guard rails (mocked assistant-dialogue gate): `useAiChat.sendTurnPreflight.test.ts`
- Send-turn orchestration order + persist-layer `setLastError` hint (mocked sub-steps): `useAiChat.sendTurn.test.ts`
- E2E shell (no model): `tests/e2e/aiChatSendTurnSmoke.spec.ts` — hovers `.transcription-ai-panel-hover-zone` to expand the default-collapsed AI rail, then asserts `data-testid="ai-chat-composer-input"` on the transcription sidebar composer.
- Correlation gate: `useAiChat.sendTurnCorrelation.test.ts`

## Stable UI hooks

- Composer `<input>` in `AiChatCard` exposes `data-testid="ai-chat-composer-input"` for E2E and diagnostics (it already carries an `aria-label` from i18n).

## Post-stream completions (P1–P5 verticals)

`useAiChat.sendTurnStreamPhase.ts` performs the following after the primary stream finishes:

1. **Agent loop** (`runAgentLoop` from `src/ai/chat/agentLoopRunner.ts`) — multi-step tool execution continuation.
2. **Reflection checks** — rule-based self-check per workflow (`segment_qa`, `annotation_qa`, `lexeme_candidates`, `elan_flex_compatibility`). Results are stored on the assistant message as `reflectionChecks` for the UI quality panel.
3. **Composed workflow state advancement** — parses `<step1>`/`<step2>`/`<step3>` tags and updates `sessionMemory.composedWorkflowState`. If reflection flags a step and retry budget remains (`stepReflectionRetryCounts[step] < 1`), the state is rolled back with `pendingReflectionRetryStepIndex`; `useAiChat.ts` detects this after `send` completes and auto-triggers the retry turn.
4. **Compatibility report parsing** (when `workflowId === 'elan_flex_compatibility'`) — parses JSON from the model output, attaches a structured `compatibilityReport` to the assistant message, and auto-pushes findings that carry `adoptionCandidateId` into the AdoptionQueue via `onPushAdoptionItemsRef`.
5. **Source set traceability binding** — evidence packets produced by `ragCitationsToEvidencePackets` carry `sourceSetId` and `sourceSetSnapshot` for audit-grade traceability. The active source set is selected via `AiSourceSetBar` and synced into `sessionMemoryRef.current.activeSourceSetId` through `setActiveSourceSetId`.

### AdoptionQueue push boundary

`onPushAdoptionItemsRef` is a callback ref passed from `AiChatCard` into `useAiChat`. After stream completion, `sendTurnStreamPhase.ts` iterates over `compatibilityReport.findings`; for each finding with `adoptionCandidateId`, it constructs an `AdoptionItem` (status `pending`) and calls `onPushAdoptionItemsRef.current(items)`. `AiChatCard` accumulates these in local React state (`adoptionItems`) and renders `AiAdoptionQueuePanel`. This decouples the stream-phase from the UI: the hook only emits items; the card owns presentation and action handlers (accept/ignore/copy/jump).

### Source set traceability data flow (current state)

1. User selects a source set in `AiSourceSetBar` → `handleSelectSourceSet(id)` → `setActiveSourceSetId(id)` writes `sessionMemoryRef.current.activeSourceSetId`.
2. On the next `send`, `sendPersistTurnAndBuildPromptContext.ts` resolves corpus scope via `resolveCorpusSourceSet(aiContext)` (segment/selection/current_media/project rules).
3. `sessionMemoryRef.current.activeSourceSetId` is currently used for evidence traceability tagging, not for RAG scope resolution.
4. `ragCitationsToEvidencePackets` injects `sourceSetSnapshot`, and then `activeSourceSetId` is written into each packet as `sourceSetId` when available, establishing traceability between citations and the user-selected source set.
5. ~~`toRuntimeCorpusSourceSet` / `fromRuntimeCorpusSourceSet`~~ → Removed. `resolveCorpusSourceSet(aiContext)` directly constructs the runtime `CorpusSourceSet` from live UI state; no persisted→runtime conversion path is currently needed.

## E2E anchors

- `tests/e2e/aiChatSendTurnSmoke.spec.ts` — composer shell mounting (no model).
- `tests/e2e/segmentQaEvidenceJump.spec.ts` — evidence card citation jump (fixture-based, no model).
- `tests/e2e/compatibilityReportRendering.spec.ts` — compatibility report card rendering (fixture-based, no model).
- `tests/e2e/sourceSetBarSmoke.spec.ts` — source set bar mounts with project-scope label in empty state (fixture-based, no model).
- `tests/e2e/reflectionPanelRendering.spec.ts` — reflection quality panel renders passed/failed checks (fixture-based, no model).

## Follow-ups (not implemented here)

- **Error UX:** persist/opening and `ai_messages.update` failures set `lastError` to **`tf(..., 'ai.chat.persistLayerRecoveryHint', { providerLabel })`** when the thrown `Error.message` is `persist failed` or `db generation metadata failed` (see `useAiChat.sendTurn.ts`). The AI sidebar warning bar adds **Retry last send** (replays the latest user message via `onSendAiMessage`; disabled when none or while streaming) and **Copy diagnostics** (JSON to clipboard: `lastError`, `providerLabel`, `conversationId`, `lastUserMessagePresent`, `messageCount`, `ts`, `userAgent`) when the visible error matches `isSendTurnPersistLayerRecoveryHintMessage` (`src/ai/chat/sendTurnPersistRecoveryUi.ts`).
- **a11y:** periodic audit of send/stop controls and live regions beyond the composer label.
- **Performance:** trace large-history turns if field reports show up; keep work evidence-driven.

## Cadence (a11y / performance)

- **a11y:** Before releases that touch AI send/stop or live regions, run the Playwright axe smoke (`tests/e2e/a11ySmoke.spec.ts`) and spot-check focus order in the AI sidebar.
- **performance:** If users report slow turns with large histories, capture a Performance profile on a representative project before optimizing; record threshold or baseline changes in `docs/execution/audits/` when applicable.
