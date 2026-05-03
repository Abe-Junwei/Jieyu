import { describe, expect, it } from 'vitest';
import {
  getToolDecisionFailureTriage,
  TOOL_DECISION_METADATA_REASON_CODES,
} from './toolDecisionFailureReason';

describe('toolDecisionFailureReason.bundle.mjs parity', () => {
  it('matches TypeScript triage for every known metadata reason code', async () => {
    const bundleUrl = new URL('../../../scripts/toolDecisionFailureReason.bundle.mjs', import.meta.url).href;
    const bundle = await import(bundleUrl);
    for (const code of TOOL_DECISION_METADATA_REASON_CODES) {
      expect(bundle.getToolDecisionFailureTriage(code), code).toBe(getToolDecisionFailureTriage(code));
    }
  });
});
