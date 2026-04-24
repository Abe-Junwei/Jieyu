# Versioning and releases

This document defines how the **application version** in `package.json` and
Git tags relate to user-visible and operational semantics.

## Semantic versioning (SemVer)

Given `MAJOR.MINOR.PATCH`:

- **MAJOR** — Breaking changes to **persisted project data**, **import/export**
  contracts, **collaboration sync** wire formats, or **documented public APIs**
  where migration is required. Release notes must list migrations and rollback.
- **MINOR** — New capabilities or materially larger UX changes that remain
  **backward compatible** with existing local databases and export files unless
  explicitly called out.
- **PATCH** — Bug fixes, performance, telemetry tuning, copy, and CSS that do
  not change compatibility guarantees.

Pre-release identifiers (`1.1.0-beta.1`) are optional and should be documented
in `CHANGELOG.md` under **Unreleased** or a dated pre-release section.

## Changelog

Meaningful user- or operator-facing changes belong in `CHANGELOG.md` under the
matching version. Internal-only refactors may be omitted or summarized as
“Maintenance”.

## Sentry and build metadata

- `VITE_APP_VERSION` is set at build time from `package.json` (`vite.config.ts`).
- `VITE_SENTRY_RELEASE`, when set, **overrides** the default Sentry `release`
  string (e.g. CI deploy IDs). If unset, Sentry uses `VITE_APP_VERSION`.

## Dependency major upgrades

Treat **npm major-range** upgrades (Vite, TypeScript, routers, SDKs) as their
own release notes: upgrade one axis at a time, run `npm run typecheck`,
`npm test`, and Playwright E2E before merging.
