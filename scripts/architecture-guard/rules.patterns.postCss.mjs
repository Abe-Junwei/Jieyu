import { patternRule } from './rule-builders.mjs';

/**
 * Pattern guards after CSS + ReadyWorkspace ratchet files (surface/track bulk, components, ADR/M18, useZoom).
 * Phase 0.4 — split from `architecture-guard.config.mjs`.
 */
export const architectureGuardPostCssPatternRules = [
  patternRule(/^src\/pages\/(?:[^/]+\/)*use.*\.(ts|tsx)$/, {
    excludeFiles: [
      'src/pages/useReadyWorkspaceSurfaceProps.tsx',
      'src/pages/useReadyWorkspaceTrackEditControllers.ts',
    ],
    excludeRegexes: [
      /Controller\.ts$/,
      /\.test\./,
      /\.structure\./,
      /\.segmentTargets\.ts$/,
      // Ratchet files in `rules.pages.mjs` own ceilings for ReadyWorkspace phase hooks.
      /useReadyWorkspace.*Phase\.ts$/,
    ],
    maxLines: 300,
    maxUseCallbackDecls: 6,
    maxUseMemoDecls: 6,
    maxUseEffects: 4,
    warnAtRatio: 0.85,
    requiredRegexes: [/export function use[A-Za-z0-9]+\(/],
  }),
  patternRule(/^src\/components\/.*\.(ts|tsx)$/, {
    excludeRegexes: [/\.test\./, /\.structure\./],
    maxLines: 2250,
    maxUseCallbackDecls: 25,
    maxUseMemoDecls: 30,
    maxUseEffects: 20,
    warnAtRatio: 0.85,
  }),
  patternRule(/^src\/contexts\/.*\.(ts|tsx)$/, {
    excludeRegexes: [/\.test\./, /\.structure\./],
    maxLines: 800,
    maxUseCallbackDecls: 10,
    maxUseMemoDecls: 10,
    maxUseEffects: 10,
    warnAtRatio: 0.85,
  }),

  // ── ADR-003 Phase 16: forbid resurrecting removed legacy mirror modules | DB cutover guard ──
  patternRule(/^src\/services\/(?!.*\.test\.).*\.ts$/, {
    excludeFiles: ['src/services/LayerUnitSegmentWritePrimitives.ts'],
    forbiddenRegexes: [
      /\bLegacyMirrorService\b/,
      /LayerUnitSegmentMirrorPrimitives/,
    ],
  }),

  // ── ADR-006 M18: forbid resurrecting Dexie `utterances` store (allowlist: engine upgrade, M18 migration) ──
  patternRule(/^src\/.*\.(ts|tsx)$/, {
    excludeRegexes: [/\.test\.(ts|tsx)$/, /\.structure\.(ts|tsx)$/],
    excludeFiles: [
      'src/db/engine.ts',
      'src/db/migrations/m18LinguisticUnitCutover.ts',
    ],
    forbiddenRegexes: [
      /\bdb\.utterances\b/,
      /\bdexie\.utterances\b/,
      /\bcollections\.utterances\b/,
      /collections\[\s*['"]utterances['"]\s*\]/,
    ],
  }),

  // ── ADR-006 M18: subgraph must not query legacy `utteranceId` index (allowlist: engine historical schema strings only if needed) ──
  patternRule(/^src\/.*\.(ts|tsx)$/, {
    excludeRegexes: [/\.test\.(ts|tsx)$/, /\.structure\.(ts|tsx)$/],
    excludeFiles: [
      'src/db/engine.ts',
      'src/db/migrations/m18LinguisticUnitCutover.ts',
    ],
    forbiddenRegexes: [
      /utterance_tokens\.where\(\s*['"]utteranceId['"]/,
      /utterance_morphemes\.where\(\s*['"]utteranceId['"]/,
      /\.utterance_tokens\.where\(\s*['"]utteranceId['"]/,
      /\.utterance_morphemes\.where\(\s*['"]utteranceId['"]/,
    ],
  }),

  // ── 视口单写者：页面层禁止直连 useZoom（须经 useTimelineViewport 封装） ──
  patternRule(/^src\/pages\/.*\.(ts|tsx)$/, {
    excludeRegexes: [/\.test\./, /\.structure\./],
    forbiddenRegexes: [
      /from ['"][^'"]*\/hooks\/useZoom['"]/,
      /\buseZoom\s*\(/,
    ],
  }),
];
