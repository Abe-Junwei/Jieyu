import { describe, expect, it } from 'vitest';
import { matchKeyEvent } from '../src/services/KeybindingService';

describe('matchKeyEvent', () => {
  it('matches space combo for blank-space key value', () => {
    const fake = {
      key: ' ',
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
    } as KeyboardEvent;
    expect(matchKeyEvent(fake, 'space')).toBe(true);
  });

  it('matches space combo for legacy Spacebar key value', () => {
    const fake = {
      key: 'Spacebar',
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
    } as KeyboardEvent;
    expect(matchKeyEvent(fake, 'space')).toBe(true);
  });

  it('still matches regular keys and modifiers', () => {
    const fake = {
      key: 'm',
      metaKey: true,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
    } as KeyboardEvent;
    expect(matchKeyEvent(fake, 'mod+m')).toBe(true);
  });
});
