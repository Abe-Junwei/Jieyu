// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  isAnnotationNativeSpaceActivationTarget,
  isAnnotationSpaceShortcutKey,
  isAnnotationTypingTarget,
} from './annotationKeyboardTarget';

describe('annotationKeyboardTarget', () => {
  it('treats form fields as typing targets and buttons as native Space activators', () => {
    const input = document.createElement('input');
    const textarea = document.createElement('textarea');
    const button = document.createElement('button');
    const link = document.createElement('a');
    link.setAttribute('href', '/annotation');
    const roleButton = document.createElement('div');
    roleButton.setAttribute('role', 'button');

    expect(isAnnotationTypingTarget(input)).toBe(true);
    expect(isAnnotationTypingTarget(textarea)).toBe(true);
    expect(isAnnotationTypingTarget(button)).toBe(false);
    expect(isAnnotationNativeSpaceActivationTarget(button)).toBe(true);
    expect(isAnnotationNativeSpaceActivationTarget(link)).toBe(true);
    expect(isAnnotationNativeSpaceActivationTarget(roleButton)).toBe(true);
    expect(isAnnotationNativeSpaceActivationTarget(input)).toBe(false);
    expect(isAnnotationSpaceShortcutKey(' ')).toBe(true);
    expect(isAnnotationSpaceShortcutKey('Enter')).toBe(false);
  });
});
