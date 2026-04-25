import { describe, expect, it } from 'vitest';
import { resolveBackgroundToolSandboxDecision } from './backgroundToolSandbox';

const workspaceRoot = '/workspace/jieyu';

describe('resolveBackgroundToolSandboxDecision', () => {
  it('preserves existing behavior when the sandbox flag is disabled', () => {
    expect(resolveBackgroundToolSandboxDecision({
      enabled: false,
      profile: 'deny_by_default',
      kind: 'shell',
      command: 'rm -rf src',
      workspaceRoot,
      cwd: workspaceRoot,
    })).toEqual({ action: 'allow', reason: 'sandbox-disabled' });
  });

  it('allows readonly allowlisted commands inside the workspace', () => {
    expect(resolveBackgroundToolSandboxDecision({
      enabled: true,
      profile: 'readonly',
      kind: 'shell',
      command: 'rg memoryBroker',
      workspaceRoot,
      cwd: workspaceRoot,
    })).toEqual({ action: 'allow', reason: 'readonly-command-allowed' });

    expect(resolveBackgroundToolSandboxDecision({
      enabled: true,
      profile: 'readonly',
      kind: 'shell',
      command: 'git status',
      workspaceRoot,
      cwd: workspaceRoot,
    })).toEqual({ action: 'allow', reason: 'readonly-command-allowed' });
  });

  it('rejects shell bypass syntax before command allowlisting', () => {
    for (const command of ['git status && rm -rf src', 'cd docs && npm run write', 'ls > out.txt', 'rg $(pwd)', 'git status; touch x']) {
      expect(resolveBackgroundToolSandboxDecision({
        enabled: true,
        profile: 'readonly',
        kind: 'shell',
        command,
        workspaceRoot,
        cwd: workspaceRoot,
      })).toEqual({ action: 'deny', reason: 'shell-syntax-not-allowed' });
    }
  });

  it('denies shell commands outside the workspace root', () => {
    expect(resolveBackgroundToolSandboxDecision({
      enabled: true,
      profile: 'readonly',
      kind: 'shell',
      command: 'git status',
      workspaceRoot,
      cwd: '/tmp',
    })).toEqual({ action: 'deny', reason: 'workspace-boundary-violation' });
  });

  it('requires approval for writes under readonly profile', () => {
    expect(resolveBackgroundToolSandboxDecision({
      enabled: true,
      profile: 'readonly',
      kind: 'file_write',
      path: 'src/generated.ts',
      workspaceRoot,
    })).toEqual({ action: 'ask', reason: 'readonly-write-not-allowed' });
  });

  it('allows restricted writes only under authorized directories', () => {
    expect(resolveBackgroundToolSandboxDecision({
      enabled: true,
      profile: 'restricted_write',
      kind: 'file_write',
      path: 'src/ai/memory/cache.json',
      workspaceRoot,
      authorizedWriteDirs: ['src/ai/memory'],
    })).toEqual({ action: 'allow', reason: 'restricted-write-allowed' });

    expect(resolveBackgroundToolSandboxDecision({
      enabled: true,
      profile: 'restricted_write',
      kind: 'file_write',
      path: 'docs/report.md',
      workspaceRoot,
      authorizedWriteDirs: ['src/ai/memory'],
    })).toEqual({ action: 'deny', reason: 'write-outside-authorized-dir' });
  });

  it('rejects path traversal out of the workspace', () => {
    expect(resolveBackgroundToolSandboxDecision({
      enabled: true,
      profile: 'restricted_write',
      kind: 'file_write',
      path: '../../outside.txt',
      workspaceRoot,
      authorizedWriteDirs: ['src/ai/memory'],
    })).toEqual({ action: 'deny', reason: 'workspace-boundary-violation' });
  });
});
