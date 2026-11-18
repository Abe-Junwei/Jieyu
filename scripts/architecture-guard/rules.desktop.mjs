import { patternRule } from './rule-builders.mjs';

/**
 * Desktop mainline hooks (`src/pages/useDesktop*`, `src/desktop/use*`).
 * Same 300-line / per-kind hook ceilings as the page `use*` pattern; controllers do not get the legacy 800-line allowance.
 */
const desktopHookLimits = {
  maxLines: 300,
  maxUseCallbackDecls: 6,
  maxUseMemoDecls: 6,
  maxUseEffects: 4,
  warnAtRatio: 0.85,
};

export const architectureGuardDesktopRules = [
  patternRule(/^src\/pages\/useDesktop[A-Za-z0-9]*\.(ts|tsx)$/, {
    excludeRegexes: [/\.test\./],
    ...desktopHookLimits,
  }),
  patternRule(/^src\/desktop\/(?:[^/]+\/)*use[A-Za-z0-9]+\.(ts|tsx)$/, {
    excludeRegexes: [/\.test\./],
    ...desktopHookLimits,
  }),
];
