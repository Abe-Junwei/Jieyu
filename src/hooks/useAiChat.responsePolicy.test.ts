import { describe, expect, it } from 'vitest';
import { buildUserDirectivePrompt } from '../ai/chat/userDirectivePrompt';
import { resolveAiChatResponsePolicy } from './useAiChat.responsePolicy';

describe('useAiChat.responsePolicy', () => {
  it('prefers directive language over UI locale for formatter policy', () => {
    const policy = resolveAiChatResponsePolicy(
      { responsePreferences: { language: 'en', style: 'concise', evidenceRequired: true } },
      'zh-CN',
      'detailed',
    );

    expect(policy).toMatchObject({
      language: 'en',
      locale: 'en-US',
      style: 'concise',
      evidenceRequired: true,
    });
  });

  it('compiles active directives into a prompt block', () => {
    const prompt = buildUserDirectivePrompt({
      responsePreferences: { language: 'en' },
      toolPreferences: { defaultScope: 'current_track', autoExecute: 'ask_first' },
      safetyPreferences: { denyDestructive: true },
      terminologyPreferences: [{ source: 'unit', target: '语段', createdAt: '2026-04-25T00:00:00.000Z' }],
    });

    expect(prompt).toContain('[USER_DIRECTIVES]');
    expect(prompt).toContain('English');
    expect(prompt).toContain('current_track');
    expect(prompt).toContain('denyDestructive=yes');
  });
});
