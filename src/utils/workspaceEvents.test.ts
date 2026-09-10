// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  buildUnitUpdatedIdempotencyKey,
  decideWorkspaceUnitRefresh,
  dispatchWorkspaceContextSync,
  dispatchWorkspaceLexemeDeleted,
  dispatchWorkspaceLexemeUpdated,
  dispatchWorkspaceUnitUpdated,
  subscribeWorkspaceEvent,
  WORKSPACE_CONTEXT_SYNC_EVENT,
  WORKSPACE_LEXEME_DELETED_EVENT,
  WORKSPACE_LEXEME_UPDATED_EVENT,
  WORKSPACE_UNIT_UPDATED_EVENT,
  type WorkspaceUnitUpdatedDetail,
} from './workspaceEvents';

describe('workspaceEvents', () => {
  it('dispatches unit-updated with contract fields and idempotency key', () => {
    const received: WorkspaceUnitUpdatedDetail[] = [];
    const stop = subscribeWorkspaceEvent(WORKSPACE_UNIT_UPDATED_EVENT, (detail) => {
      received.push(detail as WorkspaceUnitUpdatedDetail);
    });
    const sent = dispatchWorkspaceUnitUpdated({
      unitId: 'uid-1',
      layerId: 'lid-a',
      revision: 9,
    });
    stop();
    expect(sent).toMatchObject({
      unitId: 'uid-1',
      layerId: 'lid-a',
      revision: 9,
      idempotencyKey: 'unit:uid-1:rev:9',
    });
    expect(sent?.eventId.length).toBeGreaterThan(0);
    expect(sent?.occurredAt.length).toBeGreaterThan(0);
    expect(received).toEqual([sent]);
    expect(WORKSPACE_UNIT_UPDATED_EVENT).toBe('jieyu:workspace.unit-updated.v1');
    expect(WORKSPACE_LEXEME_UPDATED_EVENT).toBe('jieyu:workspace.lexeme-updated.v1');
    expect(WORKSPACE_LEXEME_DELETED_EVENT).toBe('jieyu:workspace.lexeme-deleted.v1');
    expect(WORKSPACE_CONTEXT_SYNC_EVENT).toBe('jieyu:workspace.context-sync.v1');
  });

  it('dispatches lexeme-updated with contract fields', () => {
    const sent = dispatchWorkspaceLexemeUpdated({
      lexemeId: 'lex-1',
      revision: 2,
      textId: 'tid-1',
    });
    expect(sent).toMatchObject({
      lexemeId: 'lex-1',
      revision: 2,
      textId: 'tid-1',
      idempotencyKey: 'lexeme:lex-1:rev:2',
    });
  });

  it('dispatches lexeme-deleted and context-sync contract payloads', () => {
    const sentDeleted = dispatchWorkspaceLexemeDeleted({
      lexemeId: 'lex-1',
      deletionMode: 'soft',
      textId: 'tid-1',
    });
    expect(sentDeleted).toMatchObject({
      lexemeId: 'lex-1',
      deletionMode: 'soft',
      textId: 'tid-1',
    });
    expect(sentDeleted?.idempotencyKey.startsWith('lexeme:lex-1:rev:')).toBe(true);

    const sentSync = dispatchWorkspaceContextSync({
      sourcePage: 'annotation',
      targetPage: 'lexicon',
      contextKeys: ['unitId'],
      unitId: 'uid-1',
    });
    expect(sentSync).toMatchObject({
      sourcePage: 'annotation',
      targetPage: 'lexicon',
      contextKeys: ['unitId'],
      unitId: 'uid-1',
    });
    expect(sentSync?.idempotencyKey).toContain('context:annotation->lexicon:');
  });

  it('drops duplicate idempotency keys and blocks drafts', () => {
    const key = buildUnitUpdatedIdempotencyKey('uid-1', 3);
    const seen = new Set<string>([key]);
    expect(
      decideWorkspaceUnitRefresh({
        idempotencyKey: key,
        seenKeys: seen,
        hasUncommittedDraft: false,
      }),
    ).toBe('drop-duplicate');
    expect(
      decideWorkspaceUnitRefresh({
        idempotencyKey: 'unit:uid-2:rev:1',
        seenKeys: seen,
        hasUncommittedDraft: true,
      }),
    ).toBe('mark-dirty');
    expect(
      decideWorkspaceUnitRefresh({
        idempotencyKey: 'unit:uid-2:rev:1',
        seenKeys: seen,
        hasUncommittedDraft: false,
      }),
    ).toBe('apply');
  });
});
