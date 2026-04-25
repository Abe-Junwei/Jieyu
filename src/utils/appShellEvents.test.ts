// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import {
  WORKSPACE_CONTEXT_SYNC_EVENT,
  WORKSPACE_LEXEME_DELETED_EVENT,
  WORKSPACE_LEXEME_UPDATED_EVENT,
  WORKSPACE_UNIT_UPDATED_EVENT,
  dispatchWorkspaceEvent,
  subscribeWorkspaceEvent,
} from './appShellEvents';

describe('workspace app shell events', () => {
  it('dispatches typed unit update events', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeWorkspaceEvent(WORKSPACE_UNIT_UPDATED_EVENT, listener);

    const dispatched = dispatchWorkspaceEvent(WORKSPACE_UNIT_UPDATED_EVENT, {
      eventId: 'evt-1',
      occurredAt: '2026-04-25T00:00:00.000Z',
      unitId: 'unit-1',
      layerId: 'layer-1',
      revision: 3,
      idempotencyKey: 'unit:unit-1:rev:3',
    });

    expect(dispatched).toBe(true);
    expect(listener).toHaveBeenCalledWith(
      {
        eventId: 'evt-1',
        occurredAt: '2026-04-25T00:00:00.000Z',
        unitId: 'unit-1',
        layerId: 'layer-1',
        revision: 3,
        idempotencyKey: 'unit:unit-1:rev:3',
      },
      expect.any(CustomEvent),
    );

    unsubscribe();
  });

  it('unsubscribes workspace listeners', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeWorkspaceEvent(WORKSPACE_LEXEME_UPDATED_EVENT, listener);
    unsubscribe();

    dispatchWorkspaceEvent(WORKSPACE_LEXEME_UPDATED_EVENT, {
      eventId: 'evt-2',
      occurredAt: '2026-04-25T00:00:00.000Z',
      lexemeId: 'lex-1',
      revision: 1,
      idempotencyKey: 'lexeme:lex-1:rev:1',
    });

    expect(listener).not.toHaveBeenCalled();
  });

  it('keeps lexeme deletion and context sync payloads distinct', () => {
    const deleted = vi.fn();
    const context = vi.fn();
    const unsubscribeDeleted = subscribeWorkspaceEvent(WORKSPACE_LEXEME_DELETED_EVENT, deleted);
    const unsubscribeContext = subscribeWorkspaceEvent(WORKSPACE_CONTEXT_SYNC_EVENT, context);

    dispatchWorkspaceEvent(WORKSPACE_LEXEME_DELETED_EVENT, {
      eventId: 'evt-3',
      occurredAt: '2026-04-25T00:00:00.000Z',
      lexemeId: 'lex-1',
      deletionMode: 'soft',
      idempotencyKey: 'lexeme:lex-1:rev:deleted',
    });
    dispatchWorkspaceEvent(WORKSPACE_CONTEXT_SYNC_EVENT, {
      eventId: 'evt-4',
      occurredAt: '2026-04-25T00:00:00.000Z',
      sourcePage: 'lexicon',
      targetPage: 'transcription',
      lexemeId: 'lex-1',
      contextKeys: ['lexiconListState'],
      idempotencyKey: 'context:lexicon->transcription:evt-4',
    });

    expect(deleted.mock.calls[0]?.[0]).toMatchObject({ lexemeId: 'lex-1', deletionMode: 'soft' });
    expect(context.mock.calls[0]?.[0]).toMatchObject({
      sourcePage: 'lexicon',
      targetPage: 'transcription',
      contextKeys: ['lexiconListState'],
    });

    unsubscribeDeleted();
    unsubscribeContext();
  });
});
