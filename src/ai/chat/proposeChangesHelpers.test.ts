import { describe, expect, it } from 'vitest';
import { parseProposedChildCallsFromArguments } from './proposeChangesHelpers';

describe('parseProposedChildCallsFromArguments', () => {
  it('accepts tool or name field and normalizes children', () => {
    const result = parseProposedChildCallsFromArguments({
      description: 'Batch text edits',
      changes: [
        { tool: 'set_transcription_text', arguments: { utteranceId: 'u1', text: 'a' } },
        { name: 'undo', arguments: {} },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.children).toHaveLength(2);
    expect(result.children[0]!.name).toBe('set_transcription_text');
    expect(result.children[1]!.name).toBe('undo');
    expect(result.description).toBe('Batch text edits');
  });

  it('rejects nested propose_changes and unknown tools', () => {
    const nested = parseProposedChildCallsFromArguments({
      changes: [{ tool: 'propose_changes', arguments: { changes: [] } }],
    });
    expect(nested.ok).toBe(false);

    const unknown = parseProposedChildCallsFromArguments({
      changes: [{ tool: 'not_a_real_tool', arguments: {} }],
    });
    expect(unknown.ok).toBe(false);
  });
});
