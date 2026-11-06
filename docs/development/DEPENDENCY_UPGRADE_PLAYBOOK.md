---
title: Dependency upgrade playbook
doc_type: guide
status: active
owner: repo
last_reviewed: 2026-10-15
source_of_truth: development-guide
---

# Dependency upgrade playbook

Use this when adopting **major** npm upgrades (Vite, TypeScript, routers, SDKs).

## Principles

1. **One axis per PR** — e.g. Vite + `@vitejs/plugin-react` together; `react-router-dom` alone in the next PR.
2. **Read upstream release notes** for breaking changes before typing.
3. **Run** `npm run typecheck`, `npm test`, and `npm run test:e2e` (or at least `test:e2e:chromium` on a PR branch).

## Suggested order (high coupling first)

| Step | Packages | Notes |
| --- | --- | --- |
| 1 | `typescript` | Fix new compile errors before runtime. |
| 2 | `vite`, `@vitejs/plugin-react` | Align plugin major with Vite major. |
| 3 | `react-router-dom` | Route API and data APIs may change. |
| 4 | `@maptiler/sdk`, `maplibre-gl` | Map tiles and controls regression pass. |
| 5 | `stylelint` | Rule renames; run `npm run lint:css`. |
| 6 | `jsdom` | Vitest/jsdom integration only. |
| 7 | `cross-env` | Smoke `npm run` scripts that set env vars. |

Patch/minor updates within the same major range can be batched with `npm update` after a quick changelog skim.

## Vite 8 and `vite-plugin-pwa`

Until `vite-plugin-pwa` lists `vite@^8` in `peerDependencies`, this repo uses npm
**`overrides`** so `vite-plugin-pwa` resolves the same `vite` as the root package
(see root `package.json`). Expect `npm install` to log
`ERESOLVE overriding peer dependency` for that edge; CI uses `npm ci` with the lockfile.

## `uuid` and `@maptiler/sdk` (prod `npm audit`)

`@maptiler/sdk` currently depends on `uuid` in a range that can resolve below **14.0.0**,
which is flagged by **GHSA-w5hq-g745-h8pq** (patched in `uuid@14.0.0+`). To keep
`npm audit --omit=dev` green in **`npm run build:guard`**, the root `package.json` uses:

```json
"overrides": { "uuid": "^14.0.0" }
```

When upgrading **`@maptiler/sdk`**, re-check `npm audit --omit=dev` and whether this
override is still needed (upstream may bump `uuid` to ≥14 and make the override redundant).

## After merge

- Record the upgrade under `CHANGELOG.md`.
- If behavior is user-visible, bump **MINOR** or **PATCH** per `docs/development/VERSIONING.md`.
- When `package.json` / `CHANGELOG.md` carry a new **release version**, add a matching
  **annotated Git tag** `v<version>` on the default branch (e.g. `v1.1.0`) so builds and
  Sentry can align on the same string as `VITE_APP_VERSION` (see `VERSIONING.md`).

## OpenTelemetry SDK 3.x

Upgrade API, stable SDK/core/resources and the experimental exporter as a compatible
set. SDK 3.0 uses API 1.10 and exporter 0.300; do not mix it with SDK 2.x.
The retired `sdk-trace-base` / `sdk-trace-web` packages are replaced by `sdk-trace`.
Register the provider, synchronous context manager and W3C trace/baggage propagators
explicitly. `BatchSpanProcessor` takes one options object containing `exporter`.
Node.js must be at least 22.15.0. Run `npm ci`, `npm run test:otel-smoke` and a browser
build: the smoke checks real collector export, scrubbing and context propagation.
See the [upstream changelog](https://github.com/open-telemetry/opentelemetry-js/blob/main/CHANGELOG.md).
