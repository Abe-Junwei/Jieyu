import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../db';
import { StorageReadbackError } from '../../db/storageReadbackError';
import * as storagePortModule from '../../db/storagePort';
import { t } from '../../i18n';
import {
  awaitScheduledConversationTitlePatches,
  buildConversationTitleRuleBased,
  isPersistedTitleEmptyOrDefault,
  scheduleConversationTitlePatch,
} from './conversationTitleGeneration';

describe('isPersistedTitleEmptyOrDefault', () => {
  it('recognizes default titles for every APP_LOCALES entry and active locale', () => {
    expect(isPersistedTitleEmptyOrDefault('')).toBe(true);
    expect(isPersistedTitleEmptyOrDefault(t('zh-CN', 'ai.chat.defaultConversationTitle'))).toBe(
      true,
    );
    expect(isPersistedTitleEmptyOrDefault(t('en-US', 'ai.chat.defaultConversationTitle'))).toBe(
      true,
    );
    expect(
      isPersistedTitleEmptyOrDefault(t('en-US', 'ai.chat.defaultConversationTitle'), 'en-US'),
    ).toBe(true);
    expect(isPersistedTitleEmptyOrDefault('Custom title')).toBe(false);
  });
});

describe('buildConversationTitleRuleBased', () => {
  it('uses first sentence and strips markdown noise', () => {
    expect(
      buildConversationTitleRuleBased('```js\nx\n```\n## 语段校对\n请检查第二句。第三句。'),
    ).toBe('语段校对');
  });

  it('truncates long single-line prompts', () => {
    const long = 'a'.repeat(60);
    const title = buildConversationTitleRuleBased(long);
    expect(title.endsWith('…')).toBe(true);
    expect(title.length).toBeLessThanOrEqual(49);
  });
});

describe('scheduleConversationTitlePatch', () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    await db.ai_conversations.clear();
  });

  it('lets the test observe the scheduled patch before the conversation row is cleared', async () => {
    await db.open();
    await db.ai_conversations.put({
      id: 'conv-title',
      title: '默认会话',
      mode: 'assistant',
      providerId: 'mock',
      model: 'mock',
      createdAt: '2026-05-17T10:00:00.000Z',
      updatedAt: '2026-05-17T10:00:00.000Z',
    });

    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => {
      unhandled.push(reason);
    };
    process.on('unhandledRejection', onUnhandled);
    try {
      scheduleConversationTitlePatch('conv-title', '请检查第二句。', { locale: 'zh-CN' });
      await expect(awaitScheduledConversationTitlePatches()).resolves.toBeUndefined();
      await expect(db.ai_conversations.get('conv-title')).resolves.toMatchObject({
        title: '请检查第二句。',
      });
      await db.ai_conversations.clear();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });

  it('still rejects with StorageReadbackError when the scheduled patch cannot read back', async () => {
    await db.open();
    await db.ai_conversations.put({
      id: 'conv-fail',
      title: '默认会话',
      mode: 'assistant',
      providerId: 'mock',
      model: 'mock',
      createdAt: '2026-05-17T10:00:00.000Z',
      updatedAt: '2026-05-17T10:00:00.000Z',
    });
    const failure = new StorageReadbackError('patchAiConversation');
    const real = storagePortModule.storagePort();
    vi.spyOn(storagePortModule, 'storagePort').mockReturnValue({
      ...real,
      readAiConversation: (id) => real.readAiConversation(id),
      patchAiConversation: () => Promise.reject(failure),
    });

    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => {
      unhandled.push(reason);
    };
    process.on('unhandledRejection', onUnhandled);
    try {
      scheduleConversationTitlePatch('conv-fail', '请检查第二句。', { locale: 'zh-CN' });
      await expect(awaitScheduledConversationTitlePatches()).rejects.toBe(failure);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });
});
