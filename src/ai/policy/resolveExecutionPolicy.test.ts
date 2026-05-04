import { describe, expect, it } from 'vitest';
import {
  AI_CHAT_SESSION_SIDECAR_WRITE_PATH,
  resolveAiChatBackgroundMemorySandboxPolicy,
  resolveAiChatSessionSidecarSandboxPolicy,
  resolveUserDirectivePolicyDecision,
} from './resolveExecutionPolicy';

describe('resolveExecutionPolicy', () => {
  describe('resolveUserDirectivePolicyDecision', () => {
    it('blocks all tools when autoExecute is never', () => {
      const decision = resolveUserDirectivePolicyDecision(
        { name: 'set_transcription_text', arguments: { segmentId: 'u1', text: 'x' } },
        { toolPreferences: { autoExecute: 'never' } },
      );
      expect(decision).toEqual({
        action: 'block',
        reason: 'user_directive_never_execute',
        message: 'Blocked by user directive: do not execute tools automatically.',
      });
    });

    it('requires confirmation when autoExecute is ask_first', () => {
      const decision = resolveUserDirectivePolicyDecision(
        { name: 'set_transcription_text', arguments: { segmentId: 'u1', text: 'x' } },
        { toolPreferences: { autoExecute: 'ask_first' } },
      );
      expect(decision).toEqual({
        action: 'confirm',
        reason: 'user_directive_confirmation_required',
        message: 'User directive requires confirmation before execution.',
      });
    });

    it('blocks destructive tools when safety denies destructive', () => {
      const decision = resolveUserDirectivePolicyDecision(
        { name: 'delete_transcription_segment', arguments: { segmentId: 'u1' } },
        { safetyPreferences: { denyDestructive: true } },
      );
      expect(decision).toMatchObject({ action: 'block', reason: 'user_directive_deny_destructive' });
    });
  });

  describe('resolveAiChatBackgroundMemorySandboxPolicy', () => {
    it('matches sandbox-disabled allow shape used by background runtime', () => {
      expect(
        resolveAiChatBackgroundMemorySandboxPolicy({
          sandboxEnabled: false,
          profile: 'deny_by_default',
          authorizedWriteDirs: ['session-memory'],
        }),
      ).toEqual({ action: 'allow', reason: 'sandbox-disabled' });
    });

    it('denies readonly profile writes to virtual session-memory path', () => {
      expect(
        resolveAiChatBackgroundMemorySandboxPolicy({
          sandboxEnabled: true,
          profile: 'readonly',
          authorizedWriteDirs: ['session-memory'],
        }),
      ).toEqual({ action: 'ask', reason: 'readonly-write-not-allowed' });
    });

    it('allows restricted_write to authorized session-memory subtree', () => {
      expect(
        resolveAiChatBackgroundMemorySandboxPolicy({
          sandboxEnabled: true,
          profile: 'restricted_write',
          authorizedWriteDirs: ['session-memory'],
        }),
      ).toEqual({ action: 'allow', reason: 'restricted-write-allowed' });
    });
  });

  describe('resolveAiChatSessionSidecarSandboxPolicy', () => {
    it('treats pinned-message and send-preflight paths like background extraction under restricted_write', () => {
      const base = { sandboxEnabled: true, profile: 'restricted_write' as const, authorizedWriteDirs: ['session-memory'] };
      expect(
        resolveAiChatSessionSidecarSandboxPolicy({
          ...base,
          virtualWritePath: AI_CHAT_SESSION_SIDECAR_WRITE_PATH.pinnedMessageDirective,
        }),
      ).toEqual({ action: 'allow', reason: 'restricted-write-allowed' });
      expect(
        resolveAiChatSessionSidecarSandboxPolicy({
          ...base,
          virtualWritePath: AI_CHAT_SESSION_SIDECAR_WRITE_PATH.sendPreflightDirective,
        }),
      ).toEqual({ action: 'allow', reason: 'restricted-write-allowed' });
    });
  });
});
