import { describe, expect, it } from 'vitest';

import { formatToolFailureMessage } from './toolFeedback';

describe('toolFeedback policy-driven clarify prompts', () => {
  it('returns segment-target clarify prompt for policy segment tools', () => {
    const message = formatToolFailureMessage(
      'zh-CN',
      'auto_gloss_unit',
      '标注',
      'Missing unitId',
      'concise',
    );

    expect(message).toContain('你想标注哪个句段');
  });

  it('returns translation-target clarify prompt for translation segment tools', () => {
    const message = formatToolFailureMessage(
      'zh-CN',
      'set_translation_text',
      '写入翻译',
      'missing layerId',
      'concise',
    );

    expect(message).toContain('你想修改哪个句段的哪个翻译层');
  });

  it('returns layer-link clarify prompt for layer-link policy tools', () => {
    const message = formatToolFailureMessage(
      'zh-CN',
      'remove_host',
      '移除宿主',
      'missing transcriptionLayerId',
      'concise',
    );

    expect(message).toContain('你想关联哪两个层');
  });
});
