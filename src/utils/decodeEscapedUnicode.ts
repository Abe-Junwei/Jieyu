const ESCAPED_UNICODE_PATTERN = /\\u([0-9a-fA-F]{4})/g;

export function decodeEscapedUnicode(value: string): string {
  return value.replace(ESCAPED_UNICODE_PATTERN, (_, hex: string) =>
    String.fromCharCode(Number.parseInt(hex, 16)),
  );
}

export function escapedUnicodeRegExp(source: string, flags?: string): RegExp {
  return new RegExp(decodeEscapedUnicode(source), flags);
}
