export function isAnnotationTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

export function isAnnotationNativeSpaceActivationTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target instanceof HTMLButtonElement) return !target.disabled;
  if (target instanceof HTMLAnchorElement && target.getAttribute('href')) return true;
  if (target.tagName === 'SUMMARY') return true;
  const role = target.getAttribute('role');
  return role === 'button' || role === 'link' || role === 'menuitem';
}

export function isAnnotationSpaceShortcutKey(key: string): boolean {
  return key === ' ' || key === 'Spacebar' || key === 'Space';
}
