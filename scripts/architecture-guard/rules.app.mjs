import { patternRule } from './rule-builders.mjs';

/**
 * App barrel contract + M3 dependency guards + hooks↔Supabase import ban.
 * Phase 0.4 — split from `architecture-guard.config.mjs`.
 */
export const architectureGuardAppLayerRules = [
  // ── M3 依赖方向守卫 | M3 dependency direction guard ──

  // 应用服务层禁止反向依赖页面层或组件层 | App service layer must NOT import pages or components
  patternRule(/^src\/app\/.*\.(ts|tsx)$/, {
    excludeRegexes: [/\.test\./],
    maxLines: 800,
    forbiddenRegexes: [
      /from ['"]\.\.\/pages\//,
      /from ['"]\.\.\/components\//,
    ],
  }),

  // 应用服务层入口契约 | App service barrel contract
  {
    file: 'src/app/index.ts',
    requiredLiterals: [
      'TranscriptionAppService',
      'AiAppService',
      'LanguageAssetsAppService',
      'contracts',
    ],
  },

  // 页面层不得直连 db（M3；豁免已清零，仅允许通过 types/utils 等转发层） | Pages must not import `../db` directly
  patternRule(/^src\/pages\/(?!.*\.test\.).*\.(ts|tsx)$/, {
    maxRegexMatchCounts: [
      {
        label: 'page→db direct imports (M3 baseline 0 — no exemptions)',
        pattern: /^import .* from ['"]\.\.\/db/gm,
        max: 0,
      },
    ],
    excludeFiles: [],
  }),

  // 页面层不得直连 services（M3；豁免已清零） | Pages must not import `../services/*` directly
  patternRule(/^src\/pages\/(?!.*\.test\.).*\.(ts|tsx)$/, {
    maxRegexMatchCounts: [
      {
        label: 'page→services direct imports (M3 baseline 0 — no exemptions)',
        pattern: /^import .* from ['"]\.\.\/services\//gm,
        max: 0,
      },
    ],
    excludeFiles: [],
  }),

  // React hooks must not import Supabase directly — use `collaboration/cloud/collaborationSupabaseFacade` or cloud services.
  patternRule(/^src\/hooks\/(?!.*\.test\.).*\.(ts|tsx)$/, {
    forbiddenRegexes: [
      /^import .* from ['"]\.\.\/integrations\/supabase\//m,
      /^import .* from ['"]\.\.\/\.\.\/integrations\/supabase\//m,
    ],
  }),
];
