import { describe, expect, it } from 'vitest';

import {
  buildLaneLockEntriesForAiFromEffectiveMap,
  summarizeReadyWorkspaceNoteCategoriesByKey,
} from './transcriptionReadyWorkspaceAssistantBridgeAggregateBuilder';

describe('transcriptionReadyWorkspaceAssistantBridgeAggregateBuilder', () => {
  it('summarizes note categories', () => {
    expect(
      summarizeReadyWorkspaceNoteCategoriesByKey([
        { category: 'comment' },
        { category: ' gloss ' },
        { category: null },
      ]),
    ).toEqual({ comment: 2, gloss: 1 });
  });

  it('builds lane lock entries with cap', () => {
    const map = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`s${i}`, i])) as Record<
      string,
      unknown
    >;
    const entries = buildLaneLockEntriesForAiFromEffectiveMap(map);
    expect(entries).toHaveLength(16);
    expect(entries[0]).toEqual({ speakerId: 's0', laneIndex: 0 });
  });
});
