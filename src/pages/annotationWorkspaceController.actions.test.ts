import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import type { Locale } from '../i18n';
import { annotationWorkspaceWriteActions } from './annotationWorkspaceController.actions';

describe('annotationWorkspaceWriteActions', () => {
  const now = '2026-09-30T00:00:00.000Z';

  beforeEach(async () => {
    await db.unit_tokens.clear();
  });

  it('keeps a later error after an earlier save finishes', async () => {
    await db.unit_tokens.put({
      id: 'tok-notice',
      textId: 'text-notice',
      unitId: 'unit-notice',
      form: { default: 'dog' },
      tokenIndex: 0,
      createdAt: now,
      updatedAt: now,
    });
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let reloads = 0;
    const kinds: string[] = [];
    const actions = annotationWorkspaceWriteActions({
      textId: 'text-notice',
      languageId: 'und',
      rows: [],
      reload: async () => {
        reloads += 1;
        if (reloads === 1) await gate;
      },
      setSaveNotice: (notice) => {
        kinds.push(notice.kind);
      },
      locale: 'zh-CN' as Locale,
      noticeGate: { current: 0 },
    });
    actions.onAcceptGlossSuggestion('unit-notice', 'tok-notice', 'HUMAN', 'default');
    await viWaitFor(() => reloads === 1);
    actions.onAcceptGlossSuggestion('unit-notice', 'missing-token', 'AUTO', 'default');
    await viWaitFor(() => kinds.at(-1) === 'error');
    release();
    await viWaitFor(() => kinds.length >= 3);
    expect(kinds.at(-1)).toBe('error');
  });
});

async function viWaitFor(ready: () => boolean): Promise<void> {
  const started = Date.now();
  while (!ready()) {
    if (Date.now() - started > 2000) throw new Error('timed out waiting for save notice');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
