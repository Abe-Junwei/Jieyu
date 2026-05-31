import { describe, expect, it } from 'vitest';
import type { AiConversationDoc } from '../../db/types';
import {
  isConversationVisibleInList,
  matchesConversationScope,
  pickLatestConversationInScope,
} from './aiConversationManager.helpers';

function row(
  partial: Partial<AiConversationDoc> & Pick<AiConversationDoc, 'id' | 'updatedAt'>,
): AiConversationDoc {
  return {
    title: 't',
    mode: 'assistant',
    providerId: 'mock',
    model: 'mock',
    createdAt: partial.updatedAt,
    ...partial,
  };
}

describe('aiConversationManager.helpers', () => {
  it('excludes archived and cleared conversations from list visibility', () => {
    expect(
      isConversationVisibleInList(row({ id: 'a', updatedAt: '2026-01-02', archived: true })),
    ).toBe(false);
    expect(
      isConversationVisibleInList(
        row({ id: 'b', updatedAt: '2026-01-02', clearedAt: '2026-01-03' }),
      ),
    ).toBe(false);
    expect(isConversationVisibleInList(row({ id: 'c', updatedAt: '2026-01-02' }))).toBe(true);
  });

  it('scopes by textId when provided', () => {
    const rows = [
      row({ id: '1', updatedAt: '2026-01-03', textId: 'text-a' }),
      row({ id: '2', updatedAt: '2026-01-04', textId: 'text-b' }),
      row({ id: '3', updatedAt: '2026-01-05' }),
    ];
    expect(matchesConversationScope(rows[0]!, 'text-a')).toBe(true);
    expect(matchesConversationScope(rows[1]!, 'text-a')).toBe(false);
    expect(matchesConversationScope(rows[2]!, undefined)).toBe(true);
    expect(matchesConversationScope(rows[2]!, 'text-a')).toBe(false);
  });

  it('picks latest updated conversation in scope', () => {
    const rows = [
      row({ id: 'old', updatedAt: '2026-01-01', textId: 'text-a' }),
      row({ id: 'new', updatedAt: '2026-01-05', textId: 'text-a' }),
      row({ id: 'other', updatedAt: '2026-01-09', textId: 'text-b' }),
    ];
    expect(pickLatestConversationInScope(rows, 'text-a')?.id).toBe('new');
    expect(pickLatestConversationInScope(rows, undefined)?.id).toBe('other');
  });
});
