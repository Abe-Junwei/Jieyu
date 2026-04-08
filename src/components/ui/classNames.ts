/**
 * 拼接 CSS 类名，跳过 falsy 值 | Join CSS class names, skipping falsy values
 */
export function joinClassNames(...tokens: Array<string | false | null | undefined>): string {
  return tokens.filter(Boolean).join(' ');
}
