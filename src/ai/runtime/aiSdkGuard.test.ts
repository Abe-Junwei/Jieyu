/**
 * 护栏 2 / 9：源码扫描守卫（迁移方案 v4.2 §3.3）。
 * Source-scan guard: no gateway, no provider built-in tools, no deprecated generateObject,
 * and write tools in the pilot must be approval-gated.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..', '..');
const BANNED: Array<[RegExp, string]> = [
  [/@ai-sdk\/gateway/, 'gateway package'],
  [/AI_SDK_DEFAULT_PROVIDER/, 'global default provider'],
  [/\bcreateGateway\b/, 'createGateway'],
  [/\b(anthropic|google|openai)\.tools\./, 'provider built-in tools'],
  [/\bgenerateObject\s*\(/, 'deprecated generateObject'],
  [/experimental_repairToolCall|\brepairToolCall\s*:/, 'tool-call repair masks M1'],
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

describe('aiSdkGuard', () => {
  it('src/ contains no banned AI SDK usage', () => {
    const hits: string[] = [];
    for (const file of walk(SRC)) {
      const text = readFileSync(file, 'utf8');
      for (const [re, label] of BANNED)
        if (re.test(text)) hits.push(`${relative(SRC, file)}: ${label}`);
    }
    expect(hits).toEqual([]);
  });

  it('pilot write tools are always user-approval gated', () => {
    const text = readFileSync(join(__dirname, 'toolLoopAgentPilot.ts'), 'utf8');
    expect(text).toMatch(/toolApproval\[name\] = 'user-approval'/);
    expect(text).toMatch(/execute: \(input, \{ toolCallId \}\) => options\.runWriteDecision/);
  });
});
