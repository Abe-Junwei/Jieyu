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

## After merge

- Record the upgrade under `CHANGELOG.md`.
- If behavior is user-visible, bump **MINOR** or **PATCH** per `docs/development/VERSIONING.md`.
