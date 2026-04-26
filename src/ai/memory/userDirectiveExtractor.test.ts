import { describe, expect, it } from 'vitest';
import { extractUserDirectives } from './userDirectiveExtractor';
import { applyUserDirectivesToSessionMemory } from './userDirectiveRegistry';

describe('userDirectiveExtractor', () => {
  it('extracts language and tool-scope preferences from explicit memory text', () => {
    const directives = extractUserDirectives({
      userText: '请记住，所有回答用英文\n以后默认只看当前音频',
      now: new Date('2026-04-25T00:00:00.000Z'),
    });

    expect(directives).toEqual(expect.arrayContaining([
      expect.objectContaining({ targetPath: 'responsePreferences.language', value: 'en', scope: 'long_term' }),
      expect.objectContaining({ targetPath: 'toolPreferences.defaultScope', value: 'current_track', scope: 'long_term' }),
    ]));
  });

  it('applies conservative safety directives and session-only review rules', () => {
    const directives = extractUserDirectives({
      userText: '本轮只审查，不改代码\n不要删除任何东西',
      now: new Date('2026-04-25T00:00:00.000Z'),
    });
    const result = applyUserDirectivesToSessionMemory({}, directives, {
      now: new Date('2026-04-25T00:00:00.000Z'),
    });

    expect(result.nextMemory.toolPreferences?.autoExecute).toBe('never');
    expect(result.nextMemory.safetyPreferences?.denyDestructive).toBe(true);
    expect(result.nextMemory.sessionDirectives?.length).toBeGreaterThan(0);
    expect(directives).toEqual(expect.arrayContaining([
      expect.objectContaining({ targetPath: 'safetyPreferences.denyDestructive', scope: 'long_term' }),
    ]));
    expect(result.acceptedCount).toBeGreaterThan(0);
  });
});
