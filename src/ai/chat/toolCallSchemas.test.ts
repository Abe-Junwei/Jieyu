import { describe, expect, it } from 'vitest';
import { extractFirstBalancedJson } from './toolCallSchemas';

describe('extractFirstBalancedJson (P0-4)', () => {
  it('skips an unclosed brace and finds the later tool call', () => {
    expect(extractFirstBalancedJson('先设 {x 为 1。{"name":"list_units","arguments":{}}')).toBe(
      '{"name":"list_units","arguments":{}}',
    );
  });

  it('skips a balanced but non-JSON brace pair', () => {
    expect(extractFirstBalancedJson('用 {占位} 表示：{"name":"a","arguments":{}}')).toBe(
      '{"name":"a","arguments":{}}',
    );
  });

  it('treats a backslash outside strings as plain text', () => {
    expect(extractFirstBalancedJson('写成 \\{ 也行 {"name":"b","arguments":{"q":"x\\"y"}}')).toBe(
      '{"name":"b","arguments":{"q":"x\\"y"}}',
    );
  });

  it('returns null when nothing parses', () => {
    expect(extractFirstBalancedJson('{a} {b')).toBeNull();
  });
});
