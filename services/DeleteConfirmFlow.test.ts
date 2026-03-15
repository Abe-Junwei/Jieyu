import { describe, expect, it } from 'vitest';
import {
  buildDeleteConfirmStats,
  nextSuppressFlag,
  shouldPromptDelete,
} from '../src/utils/deleteConfirmFlow';

describe('deleteConfirmFlow', () => {
  it('builds text/empty counts', () => {
    const stats = buildDeleteConfirmStats(['u1', 'u2', 'u3'], (id) => id !== 'u2');
    expect(stats).toEqual({ totalCount: 3, textCount: 2, emptyCount: 1 });
  });

  it('does not prompt when all targets are empty', () => {
    const shouldPrompt = shouldPromptDelete({ totalCount: 2, textCount: 0, emptyCount: 2 }, false);
    expect(shouldPrompt).toBe(false);
  });

  it('prompts when text exists and not suppressed', () => {
    const shouldPrompt = shouldPromptDelete({ totalCount: 1, textCount: 1, emptyCount: 0 }, false);
    expect(shouldPrompt).toBe(true);
  });

  it('supports session suppression after confirm+mute', () => {
    const suppressed = nextSuppressFlag(false, true, true);
    expect(suppressed).toBe(true);
    const shouldPrompt = shouldPromptDelete({ totalCount: 1, textCount: 1, emptyCount: 0 }, suppressed);
    expect(shouldPrompt).toBe(false);
  });
});
