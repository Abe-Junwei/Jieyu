import { describe, expect, it } from 'vitest';
import { t } from '../../i18n';
import {
  buildConversationTitleRuleBased,
  isPersistedTitleEmptyOrDefault,
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
