/**
 * 正则元字符转义 | Escape RegExp special characters
 */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
