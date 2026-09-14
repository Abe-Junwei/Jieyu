# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
as described in `docs/development/VERSIONING.md` (when present on the default branch).

## [Unreleased]

### Changed

- **Annotation page open (B4c/d/e)**: `annotationPageEnabled` now defaults to `true`. `/annotation` is an IGT workbench with unit-range playback, notes/tags/self-certainty, and AutoGloss preview-then-apply. Env `VITE_ANNOTATION_PAGE_ENABLED=false` still shows the placeholder panel. Corpus / MCP / lexicon-attachment flags stay false.
- **Master roadmap subsequent-slice eval (2026-09-11)**: Next knife is #165 then B5c rebase; added B4c/B4d/B3b leftover rows. Dogfood ≠ product-open. See `docs/execution/audits/后续路线图详细评估-2026-09-11.md`.
- **Master roadmap recalibrated (2026-09-11)**: Stage B leftover is B5c (PR #154 conflicting), not “open B4/B5 placeholders”. ChatWindow 766/800 gate replaced with 127/220. A2/A3 marked partial. See `docs/execution/audits/主路线图代码核对-2026-09-11.md`.

### Added

- **B4e annotation AutoGloss preview**: `/annotation` previews lexeme matches without calling `AutoGlossService.glossUnit`, then writes `unit_tokens.gloss` and `token_lexeme_links` only after confirm. Dirty drafts and tokens that already have gloss are skipped.
- **B4d annotation notes / tags / selfCertainty**: Unit notes persist in `user_notes` (`targetType: unit`); tag is `UserNoteDocType.category`; self-certainty patches that `layer_units` row via `saveBatch` and readback. Does not edit transcription or timing.
- **B4c annotation unit playback**: Space on a focused IGT row toggles `HTMLAudioElement` playback for `[startTime, endTime]`. Input-focused Space still inserts a space. No WaveSurfer / Orchestrator copy.
- **B2 cross-page unit refresh events**: Typed `jieyu:workspace.*.v1` CustomEvent bus in `workspaceEvents.ts` (re-exported from `appShellEvents.ts`). LinguisticService single-write paths emit after persist; annotation / corpus / lexicon subscribe and incremental-refetch by `unitId`/`lexemeId`. Uncommitted annotation drafts are marked dirty instead of overwritten. `saveUnitsBatch` stays silent. No ChatWindow, no BroadcastChannel, no new flag.
- **B1 list scroll persistence**: Lexicon `lexiconListState.listScrollTop` restores `.app-main` scroll; corpus `corpusViewState.listScrollTop` restores `.corpus-library-body`. Session-only (R8); `corpusBasket` stays router-session. No ChatWindow / ReadyWorkspace changes.
- **B10 R1–R8 cross-page checklist gate**: PRs that touch annotation / lexicon / corpus product paths must tick R1–R8 or write `N/A` in the PR body (`npm run check:r1-r8`, included in `check:all`). Push to `main` skips. No Danger.js.
- **B1 workspace return deep links**: Annotation `?unitId=` focuses that IGT row. Lexicon hit-segment jumps add `lexiconReturn` (kept after transcription deep-link strip). Shell `WorkspaceReturnBanner` returns to `/lexicon` without dual-writing selection into the URL. R8 key owners are asserted by `findWorkspaceStateDualWriteViolations`. No ChatWindow / ReadyWorkspace assembly changes.
- **B8 lexicon referenced attachments**: Lexeme detail can attach image/audio/document files to Dexie `lexeme_assets` + `lexeme_asset_links` (v53). The lexeme row stores references only; unlink drops the link then refcount-GCs the blob. Flag `lexiconAttachmentsEnabled` default false. No ChatWindow, no FLEx/LIFT attachment export.
- **B4b annotation morpheme / split / lexeme link**: `/annotation` (flag still default false) can seed and edit `unit_morphemes`, split/merge `unit_tokens`, and write `token_lexeme_links`. Leipzig inline check reuses `LeipzigValidator` plus the system structural profile markers; template editing stays on `/assets/structural-profiles`. Does not write `layer_units` or touch ChatWindow.
- **B4a-2 annotation POS/gloss edit**: `/annotation` (flag `annotationPageEnabled`, default false) can edit token POS and gloss with controlled inputs. Enter saves in place; Ctrl+Enter advances only after `unit_tokens` write→readback succeeds. Does not write `layer_units` or touch ChatWindow.
- **B4a-1 annotation workspace shell**: `/annotation` readonly IGT list for the current text/media scope, lane-scoped via ADR-0020, plus a keyboard state-machine skeleton (no save, no playback). Flag `annotationPageEnabled` default false keeps the placeholder panel.
- **B15 Zotero/OpenAlex MCP adapters**: Settings origin/label presets; `tools/call` text JSON mapped to `EvidencePacketV0` (`document`). Flag `aiExternalMcpProviderAdaptersEnabled` default false. CSP enumerates loopback `8765` only (no `https:` wildcard). No stdio, no OpenAlex REST, no ChatWindow, no catalog mix-in.
- **B5a-1 corpus library workset shell**: `/corpus` readonly unit list for the current text/media scope, multi-select `corpusBasket` isolated from transcription selection (in-memory Router session; not URL/Dexie/sessionStorage). Filter text in `corpusViewState`. Flag `corpusLibraryPageEnabled` default false keeps the placeholder panel.
- **B6 citation broken state**: Deleted timeline units resolve as `CITATION_UNIT_NOT_FOUND` and citation jump no longer pretends they still exist. Copyable RAG source lines omit stale snippets when `readModelIndexHit` is false. Dangling lexeme links show `CITATION_LEXEME_NOT_FOUND` instead of using the id as a lemma. No soft-delete column and no writing `jieyu:corpus:v1` URI yet.
- **B5c corpus P1 HTML clipboard and workset bundle**: Copy current `corpusBasket` as `text/html` plus `text/plain` via `ClipboardItem` (falls back to `writeText` when needed). Empty / too-long / clipboard-fail diagnostics use stable codes. Download a small `fflate` zip (`README.txt`, `snippets.*`, `manifest.json`). Rides `corpusLibraryPageEnabled` (still default false). No EAF/TextGrid second pipeline, no ChatWindow.
- **B14 outbound MCP send-turn**: Cached `lastToolsJson` on B11 trust rows; `extmcp__<originKey>__<tool>` guide in system prompt; execute via B13 after local tools. Settings can fetch `tools/list`. Flag `aiExternalMcpSendTurnEnabled` default false. No ChatWindow edits, no catalog mix-in, no CSP widening.
- **B13 outbound Streamable HTTP MCP client**: POST `tools/list` / `tools/call` to B11-enabled origins (JSON or SSE `data:`). Write RPC methods never fetch. `mcp_tool_call_audits` may store `agentRunId`. Flag `aiExternalMcpHttpClientEnabled` default false. No SDK, no CSP widening, no ChatWindow wiring.
- **B12 MCP resources/prompts + AgentArtifactV0**: inbound `resources/list`/`read` (`jieyu://source-set/{id}`) and `prompts/list`/`get` (A12 vertical registry). Dexie v52 `agent_artifacts` with AdoptionQueue `artifactIds` and `buildB5bExportManifest`. Flag `aiMcpResourcesArtifactsEnabled` default false.
- **B11 External MCP trust**: origin allowlist (`external_mcp_trust`, Dexie v51). Unregistered / disabled / flag-off origins never expose `tools/list` to the LLM. First enable with schema runs A9 `inspectInbound`. Settings AI section is flag-gated (`aiExternalMcpTrustEnabled`, default false).
- **A13 TaskRunner**: `enqueue` / `parkCheckpoint` persist optional `agentRunId`. Parked resumable `agent_loop` checkpoints skip stale TTL recovery and do not pump. Catalog `trust: background` gates background batches. Parallel readonly sample (`search_units` + `list_layers`) runs on TaskRunner in vitest only — send-turn sequential local-tool is unchanged. Four-state reload classifier: `done` / `clarify` / `error` / `running`.
- **A14 eval trajectory**: `--assert-audit-trace` requires schema-v1 `ai_tool_call_decision` rows to carry `agentRunId` and at least one run to chain with `ai_tool_call_intent` / `ai_agent_loop_step`. Vertical citation semantic cases join `:smoke`. Fixture tool-call counts live in `docs/execution/release-gates/release-evidence/agent-tool-aci-baseline.v1.json` (replay, not live LLM ACI).
- **AdoptionQueue MVP** (`AiAdoptionQueuePanel`, `adoptionQueue.ts`): `AdoptionItem` extended with
  `outputKind`, `title`, `recommendedAction`, `writeMode` to align with `AdoptionCandidateV0` spec.
- **Eval suite expansion**: 12 new JSON semantic cases for `annotation_qa` and `lexeme_candidates`
  workflow selection + envelope building (parity with `segment_qa`).
- **Reflection checks**: `confidence_in_bounds` and `quote_nonempty` added to
  `annotationQaReflection` and `lexemeCandidatesReflection` (matching `segmentQaReflection`).
- **Judge production integration**: `judgeCitationAccuracyBatch` and `judgeRelevance` wired into
  `useAiChat.sendTurnStreamPhase.ts`; results persisted to `audit_logs` (`ai_citation_judge`,
  `ai_relevance_judge`).
- **AiRuntimeReport generator** (`aiRuntimeReportGenerator.ts`, `aiRuntimeReportDimensionalAudit.ts`):
  reads adoption outcomes, citation/relevance judge results, reflection failed checks, and tool
  decisions from Dexie `audit_logs` to build dimensional runtime reports.

### Fixed

- **B11 MCP schema scan truncation**: A9 inbound scan no longer slices combined tool text at 16k. Each tool is inspected in full, including `inputSchema` JSON, so injection hidden after the old window cannot reach the LLM.
- **E2E flaky** (`aiChatSendTurnSmoke.spec.ts`): webkit hover reliability improved with
  visibility wait + collapsed-state assertion + click fallback.
- **Architecture guard** (`useAiChat.ts`): merged two `useMemo` declarations into one to satisfy
  `maxUseMemoDecls: 3` ceiling.

### Tests

- **B3 lexicon regression**: list → detail → hit-segment refresh, sessionStorage restore, segment `unitKind` deep links, MiniSearch hook coverage; `/lexicon` e2e asserts search box and entry list.

## [1.1.0] - 2026-04-24

### Changed

- **React Router 7**: removed v6 `future` flags from `BrowserRouter` / `MemoryRouter`
  (v7 defaults).
- **TypeScript 6** (`exactOptionalPropertyTypes`): waveform viewport sizing input is
  assembled without assigning `undefined` to optional keys (`useTranscriptionWaveformBridgeController`).
- **Vite 8**: dependency optimizer uses `optimizeDeps.rolldownOptions` and a Rolldown
  `transform` hook for the wavesurfer spectrogram `worker_threads` shim (replaces deprecated
  `optimizeDeps.esbuildOptions`).
- **VoiceInputService**: AEC diagnostic flags use strict boolean checks for `getSettings()` fields.

### Dependencies

- **Build / test**: `vite` ^8, `@vitejs/plugin-react` ^6, `typescript` ^6, `vitest` ^4.1,
  `jsdom` ^29, `stylelint` ^17, `cross-env` ^10.
- **App**: `react-router-dom` ^7, `dexie`, `maplibre-gl`, `pdfjs-dist`, `@tanstack/*`,
  OpenTelemetry JS 2.7 / exporter 0.215, `@sentry/react`, `@supabase/supabase-js`,
  `@huggingface/transformers`, `@maptiler/sdk` ^4, `wavesurfer.js`, and related bumps
  (see `package-lock.json`).
- **npm `overrides`**: `vite-plugin-pwa` → `vite` peer uses root `vite` until the plugin
  declares Vite 8 in `peerDependencies` (install may print `ERESOLVE overriding peer dependency`).

## [1.0.0] - 2026-04-24

Baseline public version prior to this changelog entry.
