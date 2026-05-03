import { describe, expect, it } from 'vitest';
import { dryRunToolCallForConfirm } from './toolCallDryRun';
import { validateToolCallArguments } from './toolCallHelpers';

describe('dryRunToolCallForConfirm', () => {
  it('passes when validateToolCallArguments passes', () => {
    const call = {
      name: 'set_transcription_text' as const,
      arguments: { segmentId: 'u1', text: 'ok' },
    };
    expect(validateToolCallArguments(call)).toBeNull();
    expect(dryRunToolCallForConfirm(call)).toEqual({ ok: true });
  });

  it('returns args_schema failure aligned with validateToolCallArguments', () => {
    const call = {
      name: 'link_translation_layer' as const,
      arguments: { translationLayerId: 'trl_1' },
    };
    const expected = validateToolCallArguments(call);
    expect(expected).not.toBeNull();
    expect(dryRunToolCallForConfirm(call)).toEqual({
      ok: false,
      phase: 'args_schema',
      message: expected!,
    });
  });
});
