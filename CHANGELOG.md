# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
as described in `docs/development/VERSIONING.md` (when present on the default branch).

## [Unreleased]

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
