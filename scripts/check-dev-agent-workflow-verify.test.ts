import { describe, expect, it } from 'vitest';
// @ts-expect-error — .mjs guard script without type declarations
import { detectSddTriggerSignals, hasSpecDirectoryActivity, isDevAgentConfigOnlyChange, verifyDevAgentWorkflow } from './check-dev-agent-workflow-verify.mjs';

type TriggerSignal = { kind: string; detail: string };

describe('detectSddTriggerSignals', () => {
  it('detects new page controller', () => {
    const triggers = detectSddTriggerSignals([
      { path: 'src/pages/useFooBarController.ts', status: 'A' },
    ]);
    expect(triggers.some((t: TriggerSignal) => t.kind === 'new_controller')).toBe(true);
  });

  it('detects feature flag file touches', () => {
    const triggers = detectSddTriggerSignals([
      { path: 'src/ai/config/featureFlags.ts', status: 'M' },
    ]);
    expect(triggers.some((t: TriggerSignal) => t.kind === 'feature_flag_touch')).toBe(true);
  });

  it('detects cross-controller touches (>=3)', () => {
    const triggers = detectSddTriggerSignals([
      { path: 'src/pages/useAController.ts', status: 'M' },
      { path: 'src/pages/useBController.ts', status: 'M' },
      { path: 'src/pages/useCController.ts', status: 'M' },
    ]);
    expect(triggers.some((t: TriggerSignal) => t.kind === 'cross_controllers')).toBe(true);
  });

  it('ignores test-only service files as new service', () => {
    const triggers = detectSddTriggerSignals([
      { path: 'src/services/FooService.test.ts', status: 'A' },
    ]);
    expect(triggers.some((t: TriggerSignal) => t.kind === 'new_service')).toBe(false);
  });
});

describe('isDevAgentConfigOnlyChange', () => {
  it('returns true for hooks + guard scripts only', () => {
    expect(
      isDevAgentConfigOnlyChange([
        { path: '.cursor/hooks/stop-verify.mjs', status: 'M' },
        { path: 'scripts/check-dev-agent-workflow-verify.mjs', status: 'M' },
        { path: 'AGENTS.md', status: 'M' },
      ]),
    ).toBe(true);
  });

  it('returns false when product code is also changed', () => {
    expect(
      isDevAgentConfigOnlyChange([
        { path: 'AGENTS.md', status: 'M' },
        { path: 'src/pages/useFooController.ts', status: 'A' },
      ]),
    ).toBe(false);
  });
});

describe('verifyDevAgentWorkflow', () => {
  it('skips SDD gate for dev-agent config-only diffs', () => {
    const failures = verifyDevAgentWorkflow([
      { path: '.cursor/hooks/stop-verify.mjs', status: 'M' },
      { path: 'scripts/check-dev-agent-workflow-verify.mjs', status: 'M' },
    ]);
    expect(failures).toEqual([]);
  });

  it('fails when SDD signals present but no spec activity', () => {
    const failures = verifyDevAgentWorkflow([
      { path: 'src/pages/useNewFeatureController.ts', status: '??' },
    ]);
    expect(failures.length).toBe(1);
    expect(failures[0]).toContain('SDD 触发信号');
    expect(failures[0]).toContain('Plan 阶段 checklist');
  });

  it('passes when spec directory also changed', () => {
    const failures = verifyDevAgentWorkflow([
      { path: 'src/pages/useNewFeatureController.ts', status: 'A' },
      { path: 'docs/execution/specs/my-feature/design.md', status: 'A' },
    ]);
    expect(failures).toEqual([]);
  });

  it('fails when spec touched but research guard reports placeholders', () => {
    const failures = verifyDevAgentWorkflow(
      [{ path: 'docs/execution/specs/x/design.md', status: 'M' }],
      { specResearchFailures: ['docs/execution/specs/x/design.md: §1 占位符'] },
    );
    expect(failures[0]).toContain('spec Research 未填实');
  });

  it('passes for trivial src changes without SDD signals', () => {
    const failures = verifyDevAgentWorkflow([
      { path: 'src/utils/formatDate.ts', status: 'M' },
    ]);
    expect(failures).toEqual([]);
  });
});

describe('hasSpecDirectoryActivity', () => {
  it('ignores _template', () => {
    expect(
      hasSpecDirectoryActivity([
        { path: 'docs/execution/specs/_template/design.md', status: 'M' },
      ]),
    ).toBe(false);
  });
});
