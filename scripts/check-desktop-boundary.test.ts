import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error — .mjs guard script without type declarations
import { collectImports, findBoundaryViolations, missingLegacyRoots } from './check-desktop-boundary.mjs';

describe('desktop boundary', () => {
  it('fails when a desktop file imports db/engine and prints the chain', () => {
    const imports = new Map<string, string[]>([
      ['src/pages/DesktopExample.tsx', ['src/utils/shared.ts']],
      ['src/utils/shared.ts', ['src/db/engine.ts']],
    ]);
    expect(
      findBoundaryViolations(imports, ['src/pages/DesktopExample.tsx'], ['src/db/engine.ts']),
    ).toEqual([['src/pages/DesktopExample.tsx', 'src/utils/shared.ts', 'src/db/engine.ts']]);
  });

  it('reads a value import of engine and ignores a type-only import', () => {
    const dir = mkdtempSync(join(tmpdir(), 'desktop-boundary-'));
    writeFileSync(join(dir, 'value.ts'), "import { db } from './engine';\nexport const marker = db;\n");
    writeFileSync(join(dir, 'typeOnly.ts'), "import type { Db } from './engine';\nexport type Alias = Db;\n");
    writeFileSync(join(dir, 'engine.ts'), 'export const db = 1;\nexport type Db = number;\n');
    const legacy = ['engine.ts'];
    expect(findBoundaryViolations(collectImports(dir, ['value.ts']), ['value.ts'], legacy)).toEqual([
      ['value.ts', 'engine.ts'],
    ]);
    expect(findBoundaryViolations(collectImports(dir, ['typeOnly.ts']), ['typeOnly.ts'], legacy)).toEqual([]);
  });

  it('keeps import { type X } because verbatimModuleSyntax emits an empty import', () => {
    const dir = mkdtempSync(join(tmpdir(), 'desktop-boundary-'));
    writeFileSync(join(dir, 'inlineType.ts'), "import { type Db } from './engine';\n");
    writeFileSync(join(dir, 'engine.ts'), 'export type Db = number;\n');
    expect(
      findBoundaryViolations(collectImports(dir, ['inlineType.ts']), ['inlineType.ts'], ['engine.ts']),
    ).toEqual([['inlineType.ts', 'engine.ts']]);
  });

  it('follows a .js file that re-exports engine', () => {
    const dir = mkdtempSync(join(tmpdir(), 'desktop-boundary-'));
    writeFileSync(join(dir, 'audio.js'), "export { db } from './engine.js';\n");
    writeFileSync(join(dir, 'engine.js'), 'export const db = 1;\n');
    expect(
      findBoundaryViolations(collectImports(dir, ['audio.js']), ['audio.js'], ['engine.js']),
    ).toEqual([['audio.js', 'engine.js']]);
  });

  it('rejects a legacy-zone path that is not on disk', () => {
    const dir = mkdtempSync(join(tmpdir(), 'desktop-boundary-'));
    expect(missingLegacyRoots(dir, ['dexie', 'src/db/engine.ts'])).toEqual(['src/db/engine.ts']);
  });
});
