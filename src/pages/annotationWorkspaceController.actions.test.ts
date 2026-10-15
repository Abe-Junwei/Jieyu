import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db';
import type { Locale } from '../i18n';
import { LinguisticService } from '../app/languageAssetPageAccess';
import { annotationWorkspaceWriteActions } from './annotationWorkspaceController.actions';

describe('annotationWorkspaceWriteActions', () => {
  const now = '2026-09-30T00:00:00.000Z';

  beforeEach(async () => {
    await Promise.all([db.unit_tokens.clear(), db.unit_morphemes.clear()]);
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

  it('reports gloss and delete failures, and a later error covers an earlier success', async () => {
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

    const first = actions.onApplyGlossByForm([
      { tokenId: 'tok-notice', gloss: 'DOG', glossLang: 'default' },
    ]);
    await viWaitFor(() => reloads === 1);
    await actions.onApplyGlossByForm([
      { tokenId: 'missing-token', gloss: 'AUTO', glossLang: 'default' },
    ]);
    expect(kinds.at(-1)).toBe('error');
    release();
    await first;
    expect(kinds.at(-1)).toBe('error');

    const reloadFailed = annotationWorkspaceWriteActions({
      textId: 'text-notice',
      languageId: 'und',
      rows: [],
      reload: async () => {
        throw new Error('reload failed');
      },
      setSaveNotice: (notice) => {
        kinds.push(notice.kind);
      },
      locale: 'zh-CN' as Locale,
      noticeGate: { current: 0 },
    });
    const beforeReloadFailure = kinds.length;
    await reloadFailed.onApplyGlossByForm([
      { tokenId: 'tok-notice', gloss: 'HOUND', glossLang: 'default' },
    ]);
    expect(kinds.at(-1)).toBe('error');
    await reloadFailed.onDeleteToken('unit-notice', 'tok-notice', false);
    expect(kinds.at(-1)).toBe('error');
    expect(kinds.length).toBeGreaterThan(beforeReloadFailure);

    const removeToken = vi
      .spyOn(LinguisticService.units, 'removeToken')
      .mockRejectedValueOnce(new Error('delete failed'));
    const deleteFailed = annotationWorkspaceWriteActions({
      textId: 'text-notice',
      languageId: 'und',
      rows: [],
      reload: async () => {
        reloads += 1;
      },
      setSaveNotice: (notice) => {
        kinds.push(notice.kind);
      },
      locale: 'zh-CN' as Locale,
      noticeGate: { current: 0 },
    });
    await db.unit_tokens.put({
      id: 'tok-notice',
      textId: 'text-notice',
      unitId: 'unit-notice',
      form: { default: 'dog' },
      tokenIndex: 0,
      createdAt: now,
      updatedAt: now,
    });
    await deleteFailed.onDeleteToken('unit-notice', 'tok-notice', false);
    expect(kinds.at(-1)).toBe('error');
    expect(await db.unit_tokens.get('tok-notice')).toBeDefined();
    removeToken.mockRestore();
  });

  it('leaves the notice alone when token deletion still needs confirmation', async () => {
    await db.unit_tokens.put({
      id: 'only',
      textId: 'text-notice',
      unitId: 'unit-notice',
      form: { default: 'dog' },
      tokenIndex: 0,
      createdAt: now,
      updatedAt: now,
    });
    await db.unit_morphemes.put({
      id: 'morph-only',
      textId: 'text-notice',
      unitId: 'unit-notice',
      tokenId: 'only',
      form: { default: 'dog' },
      morphemeIndex: 0,
      createdAt: now,
      updatedAt: now,
    });
    let reloads = 0;
    const kinds: string[] = ['saved'];
    const actions = annotationWorkspaceWriteActions({
      textId: 'text-notice',
      languageId: 'und',
      rows: [],
      reload: async () => {
        reloads += 1;
      },
      setSaveNotice: (notice) => {
        kinds.push(notice.kind);
      },
      locale: 'zh-CN' as Locale,
      noticeGate: { current: 0 },
    });
    await actions.onDeleteToken('unit-notice', 'only', false);
    expect(reloads).toBe(0);
    expect(kinds).toEqual(['saved']);
    expect(await db.unit_tokens.get('only')).toBeDefined();
  });
});

async function viWaitFor(ready: () => boolean): Promise<void> {
  const started = Date.now();
  while (!ready()) {
    if (Date.now() - started > 2000) throw new Error('timed out waiting for save notice');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
