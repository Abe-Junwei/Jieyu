# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
as described in `docs/development/VERSIONING.md` (when present on the default branch).

## [Unreleased]

### Added

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

- **E2E flaky** (`aiChatSendTurnSmoke.spec.ts`): webkit hover reliability improved with
  visibility wait + collapsed-state assertion + click fallback.
- **Architecture guard** (`useAiChat.ts`): merged two `useMemo` declarations into one to satisfy
  `maxUseMemoDecls: 3` ceiling.

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
