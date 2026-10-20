import { afterEach, describe, expect, it, vi } from 'vitest';
import { installStoragePort, storagePort } from '../../db/storagePort';
import { t } from '../../i18n';
import {
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
  const original = storagePort();
  afterEach(() => installStoragePort(original));

  it('swallows a rejected background patch instead of leaking an unhandled rejection', async () => {
    const patch = vi.fn(async () => {
      throw new Error('read-back failed');
    });
    installStoragePort({
      ...original,
      readAiConversation: vi.fn(async () => ({ id: 'conv-x', title: '' })),
      patchAiConversation: patch,
    } as unknown as ReturnType<typeof storagePort>);
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      scheduleConversationTitlePatch('conv-x', '整理第二段');
      await vi.waitFor(() => expect(patch).toHaveBeenCalled());
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });
});
