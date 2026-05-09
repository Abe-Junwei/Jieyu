/**
 * Architecture guard rule list — thin aggregate only (Phase 0.4).
 * Rule bodies live under `scripts/architecture-guard/*.mjs`; consumers import this file only.
 */
import { architectureGuardNamedHookRules } from './architecture-guard/rules.hooks.mjs';
import {
  architectureGuardPageWorkspaceRules,
  architectureGuardPageControllerRules,
  architectureGuardPageRatchetFileRules,
} from './architecture-guard/rules.pages.mjs';
import { architectureGuardServiceFileRules } from './architecture-guard/rules.services.mjs';
import { architectureGuardCssFileRules } from './architecture-guard/rules.css.mjs';
import { architectureGuardPreCssPatternRules } from './architecture-guard/rules.patterns.preCss.mjs';
import { architectureGuardPostCssPatternRules } from './architecture-guard/rules.patterns.postCss.mjs';
import { architectureGuardAppLayerRules } from './architecture-guard/rules.app.mjs';

export const architectureGuardRules = [
  ...architectureGuardPageWorkspaceRules,
  ...architectureGuardNamedHookRules,
  ...architectureGuardPageControllerRules,
  ...architectureGuardServiceFileRules,
  ...architectureGuardPreCssPatternRules,
  ...architectureGuardCssFileRules,
  ...architectureGuardPageRatchetFileRules,
  ...architectureGuardPostCssPatternRules,
  ...architectureGuardAppLayerRules,
];
