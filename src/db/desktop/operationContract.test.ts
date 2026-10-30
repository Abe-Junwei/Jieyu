import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DESKTOP_METHODS_AT_5fbc66f8 } from './operationCatalog.baseline';
import { desktopOperations } from './operationContract';

const contractSource = readFileSync(
  fileURLToPath(new URL('./operationContract.ts', import.meta.url)),
  'utf8',
);
const clientSource = readFileSync(fileURLToPath(new URL('./client.ts', import.meta.url)), 'utf8');

describe('desktop operation contract', () => {
  it('stays free of main-process modules, and the client imports only its type', () => {
    const imports = contractSource.split('\n').filter((line) => line.startsWith('import '));
    expect(imports.length).toBeGreaterThan(0);
    for (const line of imports) expect(line.startsWith('import type ')).toBe(true);
    expect(contractSource).not.toContain('better-sqlite3');
    expect(contractSource).not.toContain('node:fs');
    expect(clientSource).toContain("import type { DesktopOperations } from './operationContract'");
    expect(clientSource).not.toContain('desktopOperations');
  });

  it('keeps the current unknown-field checks', () => {
    expect(() => desktopOperations['project.get'].check({ extra: 1 })).toThrow(
      'desktop call field extra is not supported',
    );
    expect(() =>
      desktopOperations['layers.create'].check({
        manuscriptId: 'm',
        key: 'tx',
        name: { zh: '转写' },
        tierType: 'time-aligned',
        contentType: 'transcription',
        extra: 1,
      }),
    ).toThrow('desktop call field extra is not supported');
    expect(
      desktopOperations['units.updateText'].check({ unitId: 'u', text: 'ta', extra: 1 }),
    ).toEqual({
      unitId: 'u',
      text: 'ta',
    });
    expect(() =>
      desktopOperations['media.finishCleanup'].check({ id: 'm', operationId: 'op', extra: 1 }),
    ).toThrow('desktop call field extra is not supported');
    expect(desktopOperations['project.get'].undo).toBe('keep');
    expect(desktopOperations['layers.create'].undo).toBe('clear');
    expect(desktopOperations['units.updateText'].undo).toBe('replace-on-success');
    expect(desktopOperations['media.finishCleanup'].undo).toBe('clear');
  });

  it('keeps reopen outside the catalog and the union equal to the 5fbc66f8 keys', () => {
    const desktopCallSource = readFileSync(
      fileURLToPath(new URL('./desktopCall.ts', import.meta.url)),
      'utf8',
    );
    const contract = [
      ...sliceBetween(contractSource, 'export const desktopOperations = {', '\n};').matchAll(
        /^\s+'([a-zA-Z0-9.]+)': spec/gm,
      ),
    ].map((match) => match[1] ?? '');
    expect(desktopCallSource).toContain("method === 'reopen'");
    expect(desktopCallSource).not.toContain('const METHODS');
    expect(unique(DESKTOP_METHODS_AT_5fbc66f8)).toEqual([...DESKTOP_METHODS_AT_5fbc66f8]);
    expect(unique(contract)).toEqual(contract);
    expect(contract).not.toContain('reopen');
    expect(unique(['reopen', ...contract]).sort()).toEqual(
      unique(DESKTOP_METHODS_AT_5fbc66f8).sort(),
    );
    expect(Object.keys(desktopOperations).sort()).toEqual([...contract].sort());
  });
});

function sliceBetween(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  if (from < 0 || to < 0) throw new Error(`missing ${start}`);
  return source.slice(from + start.length, to);
}

function unique(keys: readonly string[]): string[] {
  return [...new Set(keys)];
}
