import { describe, expect, it } from 'vitest';
import { formatMemoryBrokerContext, resolveMemoryBroker, type ProjectMemoryStore } from './memoryBroker';

const fixedNow = new Date('2026-04-25T00:00:00.000Z');

describe('resolveMemoryBroker', () => {
  it('returns no chunks for empty session and project stores', async () => {
    const chunks = await resolveMemoryBroker({
      query: 'alignment',
      tokenBudget: 100,
      sessionMemory: {},
      projectMemoryStore: { recall: async () => [] },
      now: fixedNow,
    });

    expect(chunks).toEqual([]);
  });

  it('keeps why metadata for selected session and project chunks', async () => {
    const projectMemoryStore: ProjectMemoryStore = {
      recall: async () => [
        { refId: 'note-1', text: 'non-linear morpheme alignment note', score: 0.92, updatedAt: '2026-04-24T00:00:00.000Z', why: 'semantic note match' },
      ],
    };

    const chunks = await resolveMemoryBroker({
      query: 'morpheme alignment',
      tokenBudget: 100,
      sessionMemory: {
        conversationSummary: 'User is designing morpheme alignment review flows.',
      },
      projectMemoryStore,
      now: fixedNow,
    });

    expect(chunks.map((chunk) => chunk.why)).toContain('rolling conversation summary');
    expect(chunks.map((chunk) => chunk.why)).toContain('semantic note match');
    expect(chunks.every((chunk) => chunk.suppressedBy === undefined)).toBe(true);
  });

  it('marks already surfaced and repeated refs as duplicate', async () => {
    const projectMemoryStore: ProjectMemoryStore = {
      recall: async () => [
        { refId: 'unit-1', text: 'first surfaced unit', score: 0.9 },
        { refId: 'unit-1', text: 'duplicate surfaced unit', score: 0.8 },
      ],
    };

    const chunks = await resolveMemoryBroker({
      query: 'surfaced unit',
      tokenBudget: 100,
      projectMemoryStore,
      alreadySurfacedRefs: ['unit-1'],
      now: fixedNow,
    });

    expect(chunks).toHaveLength(2);
    expect(chunks.every((chunk) => chunk.suppressedBy === 'duplicate')).toBe(true);
  });

  it('marks over-budget chunks without dropping their diagnostics', async () => {
    const chunks = await resolveMemoryBroker({
      query: 'budget',
      tokenBudget: 2,
      sessionMemory: {
        conversationSummary: 'This summary is intentionally long enough to exceed the tiny broker budget.',
      },
      now: fixedNow,
    });

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.suppressedBy).toBe('budget');
    expect(chunks[0]?.why).toBe('rolling conversation summary');
  });

  it('formats only selected chunks for prompt injection', async () => {
    const chunks = await resolveMemoryBroker({
      query: 'gloss',
      tokenBudget: 100,
      sessionMemory: {
        conversationSummary: 'Gloss diagnostics should remain visible.',
      },
      alreadySurfacedRefs: ['project:skip'],
      projectMemoryStore: {
        recall: async () => [{ refId: 'project:skip', text: 'duplicate project text', score: 1 }],
      },
      now: fixedNow,
    });

    const formatted = formatMemoryBrokerContext(chunks);

    expect(formatted).toContain('[MEMORY_BROKER_CONTEXT]');
    expect(formatted).toContain('Gloss diagnostics should remain visible.');
    expect(formatted).not.toContain('duplicate project text');
  });
});
