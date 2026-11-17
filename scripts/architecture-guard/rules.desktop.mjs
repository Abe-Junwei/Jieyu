import { pageControllerRule, patternRule } from './rule-builders.mjs';

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
    excludeFiles: ['src/pages/useDesktopProjectReadController.ts'],
    excludeRegexes: [/\.test\./],
    ...desktopHookLimits,
  }),
  patternRule(/^src\/desktop\/(?:[^/]+\/)*use[A-Za-z0-9]+\.(ts|tsx)$/, {
    excludeRegexes: [/\.test\./],
    ...desktopHookLimits,
  }),
  // ponytail: registered exception over 300; split before slice 1b adds selection/playback wiring.
  pageControllerRule('useDesktopProjectReadController', {
    ...desktopHookLimits,
    maxLines: 312,
    floorSetAt: '2026-11-17',
    floorTrendDays: 30,
  }),
];
