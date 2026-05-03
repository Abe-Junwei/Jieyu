---
title: AI 聊天 send-turn 管道（现状）
doc_type: architecture
status: active
owner: repo
last_reviewed: 2026-05-01
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

## Follow-ups (not implemented here)

- **Error UX:** persist/opening and `ai_messages.update` failures now set `lastError` to a **local storage recovery hint** via `tf(toolFeedbackLocaleRef.current, 'ai.chat.persistLayerRecoveryHint', { providerLabel })` when the thrown `Error.message` is `persist failed` or `db generation metadata failed` (see `useAiChat.sendTurn.ts`). Broader inline recovery (retry buttons, diagnostics export) is still open.
- **a11y:** periodic audit of send/stop controls and live regions beyond the composer label.
- **Performance:** trace large-history turns if field reports show up; keep work evidence-driven.
