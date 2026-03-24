import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { DICT_KEYS } from '../i18n';

async function walk(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...await walk(full));
      continue;
    }
    if (!entry.isFile()) continue;
    if (!/\.(ts|tsx)$/.test(entry.name)) continue;
    if (/\.test\.(ts|tsx)$/.test(entry.name)) continue;
    out.push(full);
  }
  return out;
}

function collectMissingI18nCallsites(content: string): number[] {
  const missing: number[] = [];
  const pattern = /report(?:Action|Validation)Error\s*\(\s*\{([\s\S]*?)\}\s*\)\s*;/g;
  let match: RegExpExecArray | null = null;
  while ((match = pattern.exec(content)) !== null) {
    const block = match[1] ?? '';
    const hasI18nKey = /(i18nKey|conflictI18nKey|fallbackI18nKey)\s*:/.test(block);
    if (hasI18nKey) continue;
    const before = content.slice(0, match.index);
    const line = before.split('\n').length;
    missing.push(line);
  }
  return missing;
}

function collectUnknownI18nKeyLiterals(content: string, dictKeySet: Set<string>): Array<{ line: number; key: string }> {
  const unknown: Array<{ line: number; key: string }> = [];
  const pattern = /(i18nKey|conflictI18nKey|fallbackI18nKey)\s*:\s*['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null = null;
  while ((match = pattern.exec(content)) !== null) {
    const key = match[2] ?? '';
    if (dictKeySet.has(key)) continue;
    const before = content.slice(0, match.index);
    const line = before.split('\n').length;
    unknown.push({ line, key });
  }
  return unknown;
}

describe('error reporter callsite contract', () => {
  it('requires i18n metadata on every production reporter callsite', async () => {
    const srcDir = path.resolve(process.cwd(), 'src');
    const files = await walk(srcDir);
    const offenders: string[] = [];
    const unknownKeyOffenders: string[] = [];
    const dictKeySet = new Set<string>(DICT_KEYS as readonly string[]);

    for (const file of files) {
      if (file.endsWith(path.join('utils', 'actionErrorReporter.ts'))) continue;
      if (file.endsWith(path.join('utils', 'validationErrorReporter.ts'))) continue;
      const content = await fs.readFile(file, 'utf8');
      if (!content.includes('reportActionError(') && !content.includes('reportValidationError(')) continue;

      const missingLines = collectMissingI18nCallsites(content);
      for (const line of missingLines) {
        offenders.push(`${path.relative(process.cwd(), file)}:${line}`);
      }

      const unknownKeys = collectUnknownI18nKeyLiterals(content, dictKeySet);
      for (const item of unknownKeys) {
        unknownKeyOffenders.push(`${path.relative(process.cwd(), file)}:${item.line} -> ${item.key}`);
      }
    }

    expect(offenders).toEqual([]);
    expect(unknownKeyOffenders).toEqual([]);
  });
});
