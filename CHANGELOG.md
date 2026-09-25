# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
as described in `docs/development/VERSIONING.md` (when present on the default branch).

## [Unreleased]

### Changed

- **Lexicon entry overview**: The entry overview grid lives in `LexiconEntryOverview`. `LexiconPage` only assembles that panel. Field values and test ids are unchanged.
- **Annotation page open (B4c/d/e)**: `annotationPageEnabled` now defaults to `true`. `/annotation` is an IGT workbench with unit-range playback, notes/tags/self-certainty, and AutoGloss preview-then-apply. Env `VITE_ANNOTATION_PAGE_ENABLED=false` still shows the placeholder panel. Corpus / MCP / lexicon-attachment flags stay false.
- **Master roadmap subsequent-slice eval (2026-09-11)**: Next knife is #165 then B5c rebase; added B4c/B4d/B3b leftover rows. Dogfood ≠ product-open. See `docs/execution/audits/后续路线图详细评估-2026-09-11.md`.
- **Master roadmap recalibrated (2026-09-11)**: Stage B leftover is B5c (PR #154 conflicting), not “open B4/B5 placeholders”. ChatWindow 766/800 gate replaced with 127/220. A2/A3 marked partial. See `docs/execution/audits/主路线图代码核对-2026-09-11.md`.

### Added

- **Lexicon sense scientific name (B3s)**: `/lexicon` edits each sense `scientificName` (the first form text of a sense-level LIFT `<field type="scientific-name">`). Save readback shows it on that sense and keeps the category. A blank value omits the key. Export writes one field with `lang="und"` after examples and before nested subsenses. Import ignores an entry-level field of the same type. Re-import replaces the whole `senses` array, so omitting the field drops the stored name. No DMLex, no new flag.
- **Lexicon summary definition (B3r)**: `/lexicon` edits entry `summaryDefinition` (the first form text of an entry-level LIFT `<field type="summary-definition">`). Save readback shows it in `LexiconEntryOverview` and keeps literal meaning. A blank value omits the key. Export writes one field with `lang="und"` after `literal-meaning`. Import ignores a sense-level field of the same type and keeps an existing value when the field is omitted. No DMLex, no new flag.
- **Lexicon restrictions (B3q)**: `/lexicon` edits entry `restrictions` (the first form text of an entry-level LIFT `<note type="restrictions">`). Save readback shows it in the entry overview and keeps bibliography. A blank value omits the key. Export writes one note with `lang="und"` after the bibliography note. Import keeps an existing value when the restrictions note is omitted. Sense notes are ignored. No DMLex, no new flag.
- **Lexicon bibliography (B3p)**: `/lexicon` edits entry `bibliography` (the first form text of an entry-level LIFT `<note type="bibliography">`). Save readback shows it in the entry overview and keeps the untyped note. A blank value omits the key. Export writes one note with `lang="und"` after the untyped note. Import ignores sense notes, other note types, and `<field type="bibliography">`, and keeps an existing value when the bibliography note is omitted. No DMLex, no new flag.
- **Lexicon literal meaning (B3o)**: `/lexicon` edits entry `literalMeaning` (the first LIFT `<field type="literal-meaning">` form text). Save readback shows it in the entry overview. A blank value omits the key. Export writes one field with `lang="und"`. Import ignores other field types and keeps an existing value when the field is omitted. No DMLex, no new flag.
- **Lexicon entry etymology (B3n)**: `/lexicon` edits one entry `etymology` (source form, optional gloss, optional source language). Save readback shows it in the entry overview. A blank source form omits the key. LIFT import/export map this to `<etymology>`. Source language is `<trait name="languages">`. The obsolete `source` attribute is ignored. No comments, bibliography, second etymology, DMLex, or new flag.
- **Lexicon entry pronunciation (B3m)**: `/lexicon` edits entry `pronunciation` (the first LIFT `<pronunciation>` form text). Save readback shows it in the entry overview. A blank value omits the key. Export writes one element with `lang="und-fonipa"`. Import skips media-only blocks and keeps an existing value when the element is omitted. No media, tone, CV pattern, second pronunciation, DMLex, or new flag.
- **Lexicon sense examples (B3l)**: `/lexicon` edits sense `examples` (sentence plus optional translation). Save readback shows them in the sense list. A blank sentence drops the row; a blank translation omits the key. LIFT import/export map this to `<example>`. Entry-level `examples: string[]` stays untouched. No bibliographic source, no DMLex, no new flag.
- **Lexicon entry type (B3k)**: `/lexicon` edits `lexemeType`. Save readback shows it in the entry overview. A blank value omits the key. An existing `morphemeType` stays on the row. LIFT import/export already map `lexemeType` to `morph-type`. No closed type list, no DMLex, no new flag.
- **Lexicon sense part of speech (B3j)**: `/lexicon` edits `senses[].category` on the primary gloss and on extra senses. Save readback shows it in the sense list. A blank value omits the key. LIFT import/export already map this field to `grammatical-info`. No closed POS list, no DMLex, no new flag.
- **Lexicon sense promote/demote (B3i)**: `/lexicon` promotes or demotes an extra sense by changing only `parentId`. Demote hangs the sense under the previous sibling, or under the primary gloss when it is the first root extra. Promote moves it up one level and does not replace the primary gloss. Save readback keeps the new depth. No drag library, no DMLex, no new flag.
- **Lexicon sense reorder (B3h)**: `/lexicon` moves an extra sense up or down as a sibling block, including its subsenses. Save readback keeps that `senses[]` order and `parentId`. LIFT import sorts senses by the `order` attribute. No drag library, no promote/demote, no new flag.
- **Lexicon LIFT 0.13 import (B3f)**: `/lexicon` imports a `.lift` file (SIL 0.13 subset), upserts by entry id via `saveLexeme`, then `list()` readback. Invalid XML / non-0.13 / empty files do not write. No sense tree, no attachments, no corpus lexicon pack, no new flag.
- **Lexicon LIFT 0.13 export (B3e)**: `/lexicon` downloads the current lexeme list as SIL LIFT 0.13 XML (lemma / sense gloss+definition / allomorph `variant`). Outbound only. Empty lexicon does not download. No import, no sense tree, no corpus lexicon pack, no new flag.
- **Lexicon sense/form stable ids**: `senses` and `forms` get persistent `id`s. `saveLexeme` / B3c apply keep existing ids and assign `newId` for new rows. Dexie v54 backfills older lexeme rows. No sense-tree UI, no DMLex, no new flag.
- **C4 project-scoped collaboration snapshots**: Auto snapshot, first-device hydration, and panel restore now export/import only the current `textId` transcription graph. Restore prunes that project then upserts; it no longer `replace-all`s IndexedDB. Lexemes and language assets stay local (ADR-0034). Inbound sync advances last-seen revision only after apply succeeds. Boot feature-detects `navigator.storage.persist()`.
- **B3d lexicon entry hard-delete**: `/lexicon` confirms then hard-deletes a selected lexeme. `deleteLexeme` drops the row, `token_lexeme_links` for that id, and unshared attachments, then `list()` readback. Emits existing `jieyu:workspace.lexeme-deleted.v1` (`hard`). No new flag, no soft-delete column.
- **B3c lexicon extra senses and wordforms**: `/lexicon` can add or edit additional `senses` (gloss + optional definition) and `forms` transcriptions on the existing lexeme row. Empty extra glosses and blank wordforms are dropped. No new flag, no new Dexie table, no sense tree.
- **B4f annotation secondary auto-tokenization**: `/annotation` previews Unicode word splits with no writes, then replaces `unit_tokens` only when the unit has no POS, gloss, morphemes, lexeme links, or dirty drafts. Annotated units store a pending `alternativeAnalysis` candidate instead. Empty or unchanged proposals do not write. No new flag.
- **B3b lexicon entry edit**: `/lexicon` can create and save lemma / primary gloss / citation / language / notes via `LinguisticService.lexemes.save`, then `list()` readback. Empty lemma does not write. No ChatWindow, no new flag, no R8 key split. Attachments stay behind `lexiconAttachmentsEnabled`.
- **B4e annotation AutoGloss preview**: `/annotation` previews lexeme matches without calling `AutoGlossService.glossUnit`, then writes `unit_tokens.gloss` and `token_lexeme_links` only after confirm. Dirty drafts and tokens that already have gloss are skipped.
- **B4d annotation notes / tags / selfCertainty**: Unit notes persist in `user_notes` (`targetType: unit`); tag is `UserNoteDocType.category`; self-certainty patches that `layer_units` row via `saveBatch` and readback. Does not edit transcription or timing.
- **B4c annotation unit playback**: Space on a focused IGT row toggles `HTMLAudioElement` playback for `[startTime, endTime]`. Input-focused Space still inserts a space. No WaveSurfer / Orchestrator copy.
- **B2 emit completeness**: `saveUnitsBatch` emits unique `unitId`s after persist; token↔lexeme link save/remove emit `unit-updated` (via token/morpheme lookup) and `lexeme-updated`; unit/token/morpheme `saveUserNote` emits `unit-updated` when a unit id can be resolved. No ChatWindow, no new flag.
- **B2 cross-page unit refresh events**: Typed `jieyu:workspace.*.v1` CustomEvent bus in `workspaceEvents.ts` (re-exported from `appShellEvents.ts`). LinguisticService write paths emit after persist; annotation / corpus / lexicon subscribe and incremental-refetch by `unitId`/`lexemeId`. Uncommitted annotation drafts are marked dirty instead of overwritten. No ChatWindow, no BroadcastChannel, no new flag.
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

- **Lexicon nested ids on row delete**: extra-sense/form editor drafts carry stored `id`s. `applyLexiconEntryFields` looks up the previous row by that id (index only if the draft has no id), so deleting a non-last extra sense or wordform does not remap remaining nested ids.
- **B11 MCP schema scan truncation**: A9 inbound scan no longer slices combined tool text at 16k. Each tool is inspected in full, including `inputSchema` JSON, so injection hidden after the old window cannot reach the LLM.
- **E2E flaky** (`aiChatSendTurnSmoke.spec.ts`): webkit hover reliability improved with
  visibility wait + collapsed-state assertion + click fallback.
- **Architecture guard** (`useAiChat.ts`): merged two `useMemo` declarations into one to satisfy
  `maxUseMemoDecls: 3` ceiling.

### Tests

- **B3 lexicon regression**: list → detail → hit-segment refresh, sessionStorage restore, segment `unitKind` deep links, MiniSearch hook coverage; `/lexicon` e2e asserts search box, entry list, and create button.
- **B3b lexicon edit**: `saveLexiconEntry` create/update/empty-lemma + `LexiconPage` save/create/readback tests.

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
