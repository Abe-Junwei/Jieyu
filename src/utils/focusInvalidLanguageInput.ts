/**
 * 聚焦并滚动到第一个无效语言代码输入框 | Focus and scroll to the first invalid language-code input
 */

export function focusFirstInvalidLanguageCodeInput(options?: {
  root?: ParentNode;
  allowFallback?: boolean;
}): boolean {
  const root = options?.root ?? document;
  const invalidSelector = '[data-language-iso-code-input="true"][aria-invalid="true"]';
  const fallbackSelector = '[data-language-iso-code-input="true"]';

  const invalidNode = root.querySelector<HTMLInputElement>(invalidSelector);
  const target = invalidNode
    ?? (options?.allowFallback ? root.querySelector<HTMLInputElement>(fallbackSelector) : null);
  if (!target) {
    return false;
  }

  target.scrollIntoView?.({ block: 'center', inline: 'nearest', behavior: 'smooth' });
  target.focus({ preventScroll: true });
  return true;
}
