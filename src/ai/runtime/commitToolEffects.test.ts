import { describe, expect, it, vi } from 'vitest';
import { commitToolEffects } from './commitToolEffects';
import type { AiSessionMemory } from '../chat/chatDomain.types';

describe('commitToolEffects', () => {
  it('patches chat-tool preferences without writing projectFacts', () => {
    const facts = [
      { fact: 'keep-me', source: 'user' as const, createdAt: '2026-01-01T00:00:00.000Z' },
    ];
    const sessionMemory: AiSessionMemory = { projectFacts: facts };
    const updateSessionMemory = vi.fn();
    const persistSessionMemory = vi.fn();

    const next = commitToolEffects(
      { sessionMemory, updateSessionMemory, persistSessionMemory },
      {
        kind: 'chat_tool',
        toolName: 'set_transcription_text',
        language: 'cmn',
        layerId: 'layer-1',
      },
    );

    expect(next.projectFacts).toBe(facts);
    expect(next.lastToolName).toBe('set_transcription_text');
    expect(next.lastLanguage).toBe('cmn');
    expect(next.lastLayerId).toBe('layer-1');
    expect(updateSessionMemory).toHaveBeenCalledWith(next);
    expect(persistSessionMemory).toHaveBeenCalledWith(next);
  });

  it('merges local-context tool state into localToolState', () => {
    const sessionMemory: AiSessionMemory = { projectFacts: [] };
    const updateSessionMemory = vi.fn();
    const persistSessionMemory = vi.fn();
    const next = commitToolEffects(
      { sessionMemory, updateSessionMemory, persistSessionMemory },
      {
        kind: 'local_context',
        callResults: [
          {
            call: { name: 'search_units', arguments: { query: 'hello' } },
            ok: true,
            result: { unitIds: ['u1'] },
          },
        ],
      },
    );
    expect(next.localToolState).toBeDefined();
    expect(next.projectFacts).toEqual([]);
    expect(updateSessionMemory).toHaveBeenCalledTimes(1);
    expect(persistSessionMemory).toHaveBeenCalledTimes(1);
  });
});
