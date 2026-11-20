import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  desktopBundleGuard,
  desktopBundleViolations,
  legacyZoneRoots,
} from './vite-plugin-desktop-bundle-guard.ts';

const roots = ['dexie', 'src/db/engine.ts', 'src/App.tsx'] as const;

describe('desktop bundle guard', () => {
  it('rejects legacy roots and service worker files', () => {
    expect(
      desktopBundleViolations(['/repo/node_modules/dexie/dist/dexie.mjs'], [], roots),
    ).toEqual(['dexie /repo/node_modules/dexie/dist/dexie.mjs']);
    expect(desktopBundleViolations(['/repo/src/db/engine.ts?used'], [], roots)).toEqual([
      'src/db/engine.ts /repo/src/db/engine.ts?used',
    ]);
    expect(
      desktopBundleViolations(['/repo/src/App.tsx'], ['sw.js', 'workbox-abc.js', 'registerSW.js'], roots),
    ).toEqual([
      'src/App.tsx /repo/src/App.tsx',
      'service worker sw.js',
      'service worker workbox-abc.js',
      'service worker registerSW.js',
    ]);
  });

  it('ignores sentry-vendor source that mentions indexedDB', () => {
    expect(
      desktopBundleViolations(
        ['/repo/node_modules/@sentry/browser/esm/index.js'],
        ['assets/sentry-vendor-abc.js'],
        legacyZoneRoots(),
      ),
    ).toEqual([]);
  });

  it('fails generateBundle for a legacy module and closeBundle for sw.js', () => {
    const plugin = desktopBundleGuard();
    const fail = (message: string): never => {
      throw new Error(message);
    };
    const generate = plugin.generateBundle;
    if (typeof generate !== 'function') throw new Error('missing generateBundle');
    expect(() =>
      generate.call({ error: fail } as never, {} as never, {
        sentry: {
          type: 'chunk',
          fileName: 'assets/sentry-vendor-abc.js',
          modules: {
            '/repo/node_modules/@sentry/browser/esm/index.js': {
              code: 'indexedDB.open("sentry-offline")',
            },
          },
        },
      } as never, false),
    ).not.toThrow();
    expect(() =>
      generate.call({ error: fail } as never, {} as never, {
        app: {
          type: 'chunk',
          fileName: 'assets/app.js',
          modules: { '/repo/src/main.tsx': {} },
        },
      } as never, false),
    ).toThrow(/src\/main\.tsx/);

    const dir = mkdtempSync(join(tmpdir(), 'jieyu-bundle-guard-'));
    try {
      writeFileSync(join(dir, 'sw.js'), '');
      const resolveConfig = plugin.configResolved;
      const close = plugin.closeBundle;
      if (typeof resolveConfig !== 'function' || typeof close !== 'function') {
        throw new Error('missing bundle hooks');
      }
      resolveConfig.call({} as never, { build: { outDir: dir } } as never);
      expect(() => close.call({ error: fail } as never)).toThrow(/service worker sw\.js/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
