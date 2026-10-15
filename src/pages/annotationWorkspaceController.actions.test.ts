import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LinguisticService } from '../app/languageAssetPageAccess';
import { db } from '../db';
import type { Locale } from '../i18n';
import {
  annotationWorkspaceWriteActions,
  type AnnotationSaveNotice,
} from './annotationWorkspaceController.actions';

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

  it('keeps a written gloss when the following reload fails, and retry only reloads', async () => {
    await db.unit_tokens.put({
      id: 'tok-refresh',
      textId: 'text-refresh',
      unitId: 'unit-refresh',
      form: { default: 'dog' },
      tokenIndex: 0,
      createdAt: now,
      updatedAt: now,
    });
    const write = vi.spyOn(LinguisticService.units, 'updateTokenGloss');
    let reloads = 0;
    const notices: AnnotationSaveNotice[] = [];
    const actions = annotationWorkspaceWriteActions({
      textId: 'text-refresh',
      languageId: 'und',
      rows: [],
      reload: async () => {
        reloads += 1;
        if (reloads === 1) throw new Error('snapshot down');
      },
      setSaveNotice: (notice) => {
        notices.push(notice);
      },
      locale: 'zh-CN' as Locale,
      noticeGate: { current: 0 },
    });
    actions.onAcceptGlossSuggestion('unit-refresh', 'tok-refresh', 'HUMAN', 'default');
    await viWaitFor(() => notices.at(-1)?.kind === 'refresh-pending');
    expect(await db.unit_tokens.get('tok-refresh')).toMatchObject({
      gloss: { default: 'HUMAN' },
    });
    expect(notices.some((notice) => notice.kind === 'error')).toBe(false);
    expect(write).toHaveBeenCalledTimes(1);
    const pending = notices.at(-1);
    if (pending?.kind !== 'refresh-pending') throw new Error('expected refresh-pending');
    await pending.retryRefresh();
    expect(write).toHaveBeenCalledTimes(1);
    expect(reloads).toBe(2);
    expect(notices.at(-1)?.kind).toBe('saved');
    expect((await db.unit_tokens.get('tok-refresh'))?.gloss).toEqual({ default: 'HUMAN' });
    write.mockRestore();
  });

  it('reports a failed write without reloading', async () => {
    let reloads = 0;
    const notices: AnnotationSaveNotice[] = [];
    const actions = annotationWorkspaceWriteActions({
      textId: 'text-refresh',
      languageId: 'und',
      rows: [],
      reload: async () => {
        reloads += 1;
      },
      setSaveNotice: (notice) => {
        notices.push(notice);
      },
      locale: 'zh-CN' as Locale,
      noticeGate: { current: 0 },
    });
    actions.onAcceptGlossSuggestion('unit-refresh', 'missing-token', 'AUTO', 'default');
    await viWaitFor(() => notices.at(-1)?.kind === 'error');
    expect(reloads).toBe(0);
    expect(await db.unit_tokens.get('missing-token')).toBeUndefined();
  });
});

async function viWaitFor(ready: () => boolean): Promise<void> {
  const started = Date.now();
  while (!ready()) {
    if (Date.now() - started > 2000) throw new Error('timed out waiting for save notice');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
